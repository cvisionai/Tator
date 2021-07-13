from typing import Dict
from django.db import transaction
import logging

from ..models import (
    MediaType,
    Media,
    LocalizationType,
    Localization,
    StateType,
    State,
    LeafType,
    Leaf,
)
from ..search import TatorSearch
from ..schema import AttributeTypeListSchema, parse

from ._base_views import BaseListView
from ._attributes import (
    bulk_patch_attributes,
    bulk_rename_attributes,
    bulk_mutate_attributes,
    bulk_delete_attributes,
    convert_attribute,
)
from ._permissions import ProjectFullControlPermission

logger = logging.getLogger(__name__)

ENTITY_TYPES = {
    "MediaType": (MediaType, Media),
    "LocalizationType": (LocalizationType, Localization),
    "StateType": (StateType, State),
    "LeafType": (LeafType, Leaf),
}


class AttributeTypeListAPI(BaseListView):
    """Interact with attributes on an individual type."""

    schema = AttributeTypeListSchema()
    permission_classes = [ProjectFullControlPermission]
    http_method_names = ["patch", "post", "delete"]

    @staticmethod
    def _check_attribute_type(attribute_type):
        """
        Checks that all required fields exist in an attribute type definition.
        """

        if "name" not in attribute_type:
            raise ValueError("Attribute type definition missing 'name' field")
        if "dtype" not in attribute_type:
            raise ValueError("Attribute type definition missing 'dtype' field")
        if "enum" == attribute_type["dtype"] and "choices" not in attribute_type:
            raise ValueError("enum attribute type definition missing 'choices' field")
        if "default" in attribute_type:
            # Convert default value to this type to validate it.
            convert_attribute(attribute_type, attribute_type["default"])

    @staticmethod
    def _get_models(type_name):
        models = ENTITY_TYPES.get(type_name)
        if not models:
            raise ValueError(
                f"Invalid 'entity_type' value '{type_name}'. Valid values are '{[ENTITY_TYPES.keys()]}'"
            )

        return models

    @staticmethod
    def _get_objects(params):
        """
        Makes use of the `entity_type` and `project` fields to extract the parent annotation type
        and all annotations of that type. Returns the annotation type object and the QuerySet of
        annotations.
        """
        parent_id = params["id"]
        models = AttributeTypeListAPI._get_models(params["entity_type"])
        entity_type = models[0].objects.select_for_update(nowait=True).get(pk=parent_id)
        model = models[1]
        obj_qs = model.objects.filter(meta=parent_id)
        return entity_type, obj_qs

    @staticmethod
    def _get_related_objects(target_entity_type, attribute_name):
        """
        Used by _patch in conjunction with _get_objects to find all types and instances of said
        types that have an attribute with the given name for bulk mutation.
        """
        project = target_entity_type.project
        id_set = {target_entity_type.id}
        objects = []
        for entity_type, entity in ENTITY_TYPES.values():
            for instance in entity_type.objects.filter(project=project):
                if not instance.attribute_types:
                    continue
                if (
                    any(
                        attribute_name == attribute["name"]
                        for attribute in instance.attribute_types
                    )
                    and instance.id not in id_set
                ):
                    id_set.add(instance.id)
                    objects.append((instance, entity.objects.select_for_update(nowait=True)\
                                                            .filter(meta=instance.id)))

        return objects

    def _delete(self, params: Dict) -> Dict:
        """Delete an existing attribute on a type."""
        attribute_to_delete = params["attribute_to_delete"]
        with transaction.atomic():
            entity_type, obj_qs = self._get_objects(params)
            TatorSearch().delete_alias(entity_type, attribute_to_delete).save()

        if obj_qs.exists():
            bulk_delete_attributes([attribute_to_delete], obj_qs)

        return {"message": f"Attribute '{attribute_to_delete}' deleted"}

    def _patch(self, params: Dict) -> Dict:
        """Rename an attribute on a type."""
        ts = TatorSearch()
        global_operation = params.get("global", "false").lower()
        old_name = params["old_attribute_type_name"]
        old_dtype = None
        old_attribute_type = None
        new_attribute_type = params["new_attribute_type"]
        new_name = new_attribute_type["name"]
        attribute_renamed = old_name != new_name

        # Get the old and new dtypes
        with transaction.atomic():
            entity_type, obj_qs = self._get_objects(params)
            related_objects = self._get_related_objects(entity_type, old_name)
            if related_objects and global_operation == "false":
                raise ValueError(
                    f"Attempted to mutate attribute '{old_name}' without the global flag set to 'true',"
                    " but it exists on other types."
                )

            for attribute_type in entity_type.attribute_types:
                if attribute_type["name"] == old_name:
                    old_dtype = attribute_type["dtype"]
                    old_attribute_type = dict(attribute_type)
                    break
            else:
                raise ValueError(
                    f"Could not find attribute name {old_name} in entity type "
                    f"{type(entity_type)} ID {entity_type.id}"
                )

            # Determine if the attribute is being mutated
            attribute_mutated = False
            dtype_mutated = False
            for key, new_value in new_attribute_type.items():
                # Ignore differences in `name` values, those are handled by a rename
                if key == "name":
                    continue
                old_value = old_attribute_type.get(key)
                if old_value is None or old_value != new_value:
                    attribute_mutated = True
                    if key == "dtype":
                        dtype_mutated = True

            # Atomic validation of all changes; TatorSearch.check_* methods raise if there is a problem
            # that would cause either a rename or a mutation to fail.
            if attribute_renamed:
                ts.check_rename(entity_type, old_name, new_name)
                for instance, _ in related_objects:
                    ts.check_rename(instance, old_name, new_name)
            if attribute_mutated:
                self._check_attribute_type(new_attribute_type)
                ts.check_mutation(entity_type, old_name, new_attribute_type)
                for instance, _ in related_objects:
                    ts.check_mutation(instance, old_name, new_attribute_type)

            # List of success messages to return
            messages = []

            # Renames the attribute alias for the entity type in PSQL and ES
            if attribute_renamed:
                # Update entity type alias
                updated_types = ts.rename_alias(entity_type, related_objects, old_name, new_name)
                for instance in updated_types:
                    instance.save()
                entity_type.project.save()

                # Update entity alias
                if obj_qs.exists():
                    bulk_rename_attributes({old_name: new_name}, obj_qs)
                for _, qs in related_objects:
                    if qs.exists():
                        bulk_rename_attributes({old_name: new_name}, qs)

                messages.append(f"Attribute '{old_name}' renamed to '{new_name}'.")

                # refresh entity_type and queryset after a rename
                entity_type, obj_qs = self._get_objects(params)
                related_objects = self._get_related_objects(entity_type, new_name)

            if attribute_mutated:
                # Update entity type attribute type
                ts.mutate_alias(entity_type, new_name, new_attribute_type).save()
                for instance, _ in related_objects:
                    ts.mutate_alias(instance, new_name, new_attribute_type).save()

                # Convert entity values
                if dtype_mutated:
                    if obj_qs.exists():
                        # Get the new attribute type to convert the existing value
                        new_attribute = None
                        for attribute_type in entity_type.attribute_types:
                            if attribute_type["name"] == new_name:
                                new_attribute = attribute_type
                                break

                        # Mutate the entity attribute values
                        bulk_mutate_attributes(new_attribute, obj_qs)

                    for _, qs in related_objects:
                        if qs.exists():
                            # Get the new attribute type to convert the existing value
                            new_attribute = None
                            for attribute_type in entity_type.attribute_types:
                                if attribute_type["name"] == new_name:
                                    new_attribute = attribute_type
                                    break

                            # Mutate the entity attribute values
                            bulk_mutate_attributes(new_attribute, qs)

            messages.append(
                f"Attribute '{new_name}' mutated from:\n{old_attribute_type}\nto:\n{new_attribute_type}"
            )

        return {"message": "\n".join(messages)}

    def _post(self, params: Dict) -> Dict:
        """Adds an attribute to a type."""
        ts = TatorSearch()
        new_attribute_type = params["addition"]
        new_name = new_attribute_type["name"]
        with transaction.atomic():
            entity_type, obj_qs = self._get_objects(params)

            # Check that the attribute type is valid and it is valid to add it to the desired entity
            # type
            self._check_attribute_type(new_attribute_type)
            ts.check_addition(entity_type, new_attribute_type)

            # Add the attribute to the desired entity type
            if entity_type.attribute_types:
                entity_type.attribute_types.append(new_attribute_type)
            else:
                entity_type.attribute_types = []
                entity_type.attribute_types.append(new_attribute_type)
            entity_type.save()

        # Add new field to all existing attributes if there is a default value
        if obj_qs.exists() and "default" in new_attribute_type:
            new_attr = {new_name: new_attribute_type["default"]}

            # Add default value to PSQL
            bulk_patch_attributes(new_attr, obj_qs)

            # Add default value to ES
            query = {"query": {"match": {"_meta": {"query": int(entity_type.id)}}}}
            ts.update(entity_type.project.pk, entity_type, query, new_attr)

        return {"message": f"New attribute type '{new_name}' added"}

    def get_queryset(self):
        params = parse(self.request)
        models = self._get_models(params["entity_type"])
        queryset = models[0].objects.filter(pk=params["id"])
        return queryset
