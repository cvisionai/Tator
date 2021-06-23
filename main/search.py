import logging
import os
import datetime
from copy import deepcopy
from uuid import uuid1

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

logger = logging.getLogger(__name__)

# Indicates what types can mutate into. Maps from type -> to type.
ALLOWED_MUTATIONS = {
    'bool': ['bool', 'enum', 'string'],
    'int': ['int', 'float', 'enum', 'string'],
    'float': ['int', 'float', 'enum', 'string'],
    'enum': ['enum', 'string'],
    'string': ['enum', 'string'],
    'datetime': ['enum', 'string', 'datetime'],
    'geopos': ['enum', 'string', 'geopos'],
}

# Used for duplicate ID storage
id_bits=448
id_mask=(1 << id_bits) - 1

def drop_dupes(ids):
    """ Drops duplicates in a list without changing the order.
    """
    seen = set()
    seen_add = seen.add
    return [x for x in ids if not (x in seen or seen_add(x))]

def _get_alias_type(attribute_type):
    """
    Maps `dtype` to ES alias type.
    """
    dtype = attribute_type["dtype"]
    if dtype == "bool":
        return "boolean"
    if dtype == "int":
        return "long"
    if dtype == "float":
        return "double"
    if dtype == "enum":
        return "keyword"
    if dtype == "string":
        return "text" if "long_string" in attribute_type.get("style", "") else "keyword"
    if dtype == "datetime":
        return "date"
    if dtype == "geopos":
        return "geo_point"

def _get_mapping_values(entity_type, attributes):
    """ For a given entity type and attribute values, determines mappings that should
        be set.
    """
    mapping_values = {}

    if entity_type.attribute_types is None:
        return mapping_values

    for attribute_type in entity_type.attribute_types:
        name = attribute_type['name']
        value = attributes.get(name)
        if value is not None:
            dtype = attribute_type['dtype']
            uuid = entity_type.project.attribute_type_uuids[name]
            mapping_type = _get_alias_type(attribute_type)
            mapping_name = f'{uuid}_{mapping_type}'
            if mapping_type == 'boolean':
                mapping_values[mapping_name] = bool(value)
            elif mapping_type == 'long':
                mapping_values[mapping_name] = int(value)
            elif mapping_type == 'double':
                mapping_values[mapping_name] = float(value)
            elif mapping_type == 'text':
                mapping_values[mapping_name] = str(value).replace("\\", "\\\\")
            elif mapping_type == 'keyword':
                mapping_values[mapping_name] = str(value).replace("\\", "\\\\")
            elif mapping_type == 'date':
                mapping_values[mapping_name] = value # TODO: reformat?
            elif mapping_type == 'geo_point':
                if type(value) == list:
                    # Store django lat/lon as a string
                    # Special note: in ES, array representations are lon/lat, but
                    # strings are lat/lon, therefore we intentionally swap order here.
                    mapping_values[mapping_name] = f"{value[1]},{value[0]}"
                else:
                    mapping_values[mapping_name] = value
    return mapping_values

class TatorSearch:
    """ Interface for elasticsearch documents.
        There is one index per entity type.
        There is one mapping per attribute type.
        There is one document per entity.
    """
    @classmethod
    def setup_elasticsearch(cls):
        cls.prefix = os.getenv('ELASTICSEARCH_PREFIX')
        if cls.prefix is None:
            cls.prefix = ''
        cls.es = Elasticsearch(
            [os.getenv('ELASTICSEARCH_HOST')],
            timeout=60,
            max_retries=10,
            retry_on_timeout=True,
        )

    def index_name(self, project):
        return f'{self.prefix}project_{project}'

    def create_index(self, project):
        index = self.index_name(project)
        if not self.es.indices.exists(index):
            self.es.indices.create(
                index,
                body={
                    'settings': {
                        'number_of_shards': 1,
                        'number_of_replicas': 1,
                        'analysis': {
                            'normalizer': {
                                'lower_normalizer': {
                                    'type': 'custom',
                                    'char_filter': [],
                                    'filter': ['lowercase', 'asciifolding'],
                                },
                            },
                        },
                    },
                    'mappings': {
                        'properties': {
                            '_media_relation': {
                                'type': 'join',
                                'relations': {
                                    'media': 'annotation',
                                }
                            },
                            '_exact_name': {'type': 'keyword', 'normalizer': 'lower_normalizer'},
                            '_md5': {'type': 'keyword'},
                            '_meta': {'type': 'integer'},
                            '_dtype': {'type': 'keyword'},
                            'tator_user_sections': {'type': 'keyword'},
                        }
                    },
                },
            )
        # Mappings that were added later
        self.es.indices.put_mapping(
            index=index,
            body={'properties': {
                '_exact_treeleaf_name': {'type': 'keyword'},
                'tator_treeleaf_name': {'type': 'text'},
                '_treeleaf_depth': {'type': 'integer'},
                '_treeleaf_path': {'type': 'text'},
                '_annotation_version': {'type': 'integer'},
                '_modified': {'type': 'boolean'},
                '_modified_datetime': {'type': 'date'},
                '_modified_by': {'type': 'keyword'},
                '_created_datetime': {'type': 'date'},
                '_created_by': {'type': 'keyword'},
                '_indexed_datetime': {'type': 'date'},
                '_postgres_id': {'type': 'long'},
                '_download_size': {'type': 'long'},
                '_total_size': {'type': 'long'},
                '_duration': {'type': 'float'},
                '_gid': {'type': 'keyword'},
                '_uid': {'type': 'keyword'},
                'filename': {'type': 'keyword', 'normalizer': 'lower_normalizer'},
            }},
        )

    def delete_index(self, project):
        index = self.index_name(project)
        if self.es.indices.exists(index):
            self.es.indices.delete(index)

    def check_addition(self, entity_type, new_attribute_type):
        """
        Checks that the new attribute type does not collide with existing attributes on the target
        entity type or other entity types.
        """
        new_name = new_attribute_type["name"]

        # There should be no existing attribute types on the target entity type with the same name
        if entity_type.attribute_types:
            for attribute_type in entity_type.attribute_types:
                if new_name == attribute_type["name"]:
                    raise ValueError(
                        f"Attempted to add attribute '{new_name}' to {type(entity_type).__name__} "
                        f"{entity_type.name} ID {entity_type.id}, but one with that name already exists"
                    )

        # If no uuid exists, then no other entity types have an attribute type with the same name
        uuid = entity_type.project.attribute_type_uuids.get(new_name)
        if uuid is None:
            return

        # Fetch existing mappings
        index_name = self.index_name(entity_type.project.pk)
        existing_mappings = self.es.indices.get_mapping(index=index_name)
        mappings = existing_mappings[index_name].get("mappings",{})
        properties = mappings.get("properties",{})

        # This should not happen if the uuid exists, but if it does, then no mapping exists and it
        # is valid to create one
        if new_name not in properties:
            return

        # Check that the existing mapping has the same mapping name, i.e. the same dtype
        mapping_type = _get_alias_type(new_attribute_type)
        mapping_name = f"{uuid}_{mapping_type}"
        if mapping_name != properties[new_name]["path"]:
            raise ValueError(
                f"Attempted to add attribute '{new_name}' with dtype {new_attribute_type['dtype']} "
                f"to {type(entity_type).__name__} {entity_type.name} ID {entity_type.id}, but "
                f"another entity type has already defined this attribute name with a different dtype"
            )

    def create_mapping(self, entity_type):
        if not entity_type.attribute_types:
            return

        # Fetch existing mappings
        index_name = self.index_name(entity_type.project.pk)
        existing_mappings = self.es.indices.get_mapping(index=index_name)
        mappings = existing_mappings[index_name].get("mappings",{})
        properties = mappings.get("properties",{})
        existing_prop_names = properties.keys()
        for attribute_type in entity_type.attribute_types:
            # Skip over existing mappings
            if attribute_type["name"] in existing_prop_names:
                continue

            # Get or create UUID for this attribute type.
            name = attribute_type["name"]
            if name in entity_type.project.attribute_type_uuids:
                uuid = entity_type.project.attribute_type_uuids[name]
            else:
                uuid = str(uuid1()).replace("-", "")
                entity_type.project.attribute_type_uuids[name] = uuid
                entity_type.project.save()

            mapping_type = _get_alias_type(attribute_type)
            mapping_name = f"{uuid}_{mapping_type}"

            # Define alias for this attribute type.
            alias = {name: {"type": "alias",
                            "path": mapping_name}}

            # Create mappings depending on dtype.
            mapping = {mapping_name: {"type": mapping_type}}

            # Create mappings.
            self.es.indices.put_mapping(
                index=self.index_name(entity_type.project.pk),
                body={"properties": {**mapping, **alias}},
            )

    def check_rename(self, entity_type, old_name, new_name):
        """
        Checks rename operation and raises if it is invalid. See `rename_alias` for argument
        description.
        """
        # If no name change is happening, there is nothing to check
        if old_name == new_name:
            return None, None, None

        # Retrieve UUID, raise error if it doesn't exist.
        uuid = entity_type.project.attribute_type_uuids.get(old_name)
        if uuid is None:
            raise ValueError(f"Could not find attribute name {old_name} in entity type "
                             f"{type(entity_type).__name__} ID {entity_type.id}")

        # Find old attribute type and create new attribute type.
        new_attribute_type = None
        for idx, attribute_type in enumerate(entity_type.attribute_types):
            name = attribute_type['name']
            if name == old_name:
                replace_idx = idx
                new_attribute_type = dict(attribute_type)
                new_attribute_type['name'] = new_name
            elif name == new_name:
                raise ValueError(
                    f"Could not rename attribute '{old_name}' to '{new_name}' because an attribute "
                    f"with that name already exists in entity type {type(entity_type).__name__} ID "
                    f"{entity_type.id}"
                )

        if new_attribute_type is None:
            raise ValueError(
                f"Could not find attribute name {old_name} in entity type "
                f"{type(entity_type).__name__} ID {entity_type.id}"
            )

        return uuid, replace_idx, new_attribute_type


    def rename_alias(self, entity_type, related_objects, old_name, new_name):
        """
        Adds an alias corresponding to an attribute type rename. Note that the old alias will still
        exist but can be excluded by specifying fields parameter in query_string queries. Entity
        type should contain an attribute type definition for old_name.

        :param entity_type: *Type object. Should be passed in before updating attribute_type json.
                            Fields attribute_types and attribute_type_uuids will be updated with new
                            name. Entity type will NOT be saved.
        :param related_objects: The list of pairs of entity types and querysets that also have an
                                attribute to be renamed.
        :param old_name: Name of attribute type being mutated.
        :param new_name: New name for the attribute type.
        :returns: Entity types with updated attribute_type_uuids.
        """
        # If no name change is happening, there is nothing to do
        if old_name == new_name:
            return [entity_type]

        uuid, replace_idx, new_attribute_type = self.check_rename(entity_type, old_name, new_name)
        updated_types = []

        # Create new alias definition.
        alias_type = _get_alias_type(new_attribute_type)
        alias = {new_name: {"type": "alias", "path": f"{uuid}_{alias_type}"}}
        self.es.indices.put_mapping(
            index=self.index_name(entity_type.project.pk),
            body={"properties": alias},
        )

        # Update entity type object with new values.
        entity_type.project.attribute_type_uuids[
            new_name
        ] = entity_type.project.attribute_type_uuids.pop(old_name)
        entity_type.attribute_types[replace_idx] = new_attribute_type
        updated_types.append(entity_type)

        # Update related objects with new values.
        for instance, _ in related_objects:
            _, replace_idx, _ = self.check_rename(instance, old_name, new_name)
            instance.attribute_types[replace_idx] = new_attribute_type
            updated_types.append(instance)
        return updated_types

    def check_mutation(self, entity_type, name, new_attribute_type):
        """
        Checks mutation operation and raises if it is invalid. See `mutate_alias` for argument
        description.
        """
        # Retrieve UUID, raise error if it doesn't exist.
        uuid = entity_type.project.attribute_type_uuids.get(name)
        if uuid is None:
            raise ValueError(f"Could not find attribute name {name} in entity type "
                             f"{type(entity_type).__name__} ID {entity_type.id}")

        # Find old attribute type and create new attribute type.
        for idx, attribute_type in enumerate(entity_type.attribute_types):
            if attribute_type['name'] == name:
                replace_idx = idx
                old_mapping_type = _get_alias_type(attribute_type)
                old_mapping_name = f'{uuid}_{old_mapping_type}'
                old_dtype = attribute_type['dtype']
                break
        else:
            raise ValueError(f"Could not find attribute name {name} in entity type "
                             f"{type(entity_type).__name__} ID {entity_type.id}")

        new_dtype = new_attribute_type["dtype"]
        if new_dtype not in ALLOWED_MUTATIONS[old_dtype]:
            raise RuntimeError(f"Attempted mutation of {name} from {old_dtype} to {new_dtype} is "
                                "not allowed!")

        return uuid, replace_idx, old_mapping_name

    def mutate_alias(self, entity_type, name, new_attribute_type, new_style=None):
        """
        Sets alias to new mapping type.

        :param entity_type: *Type object. Should be passed in before updating attribute_type json.
                            Field attribute_types will be updated with new dtype and style. Entity
                            type will not be saved.
        :param name: Name of attribute type being mutated.
        :param new_attribute_type: New attribute type for the attribute being mutated.
        :param new_style: [Optional] New display style of attribute type. Used to determine if
                          string attributes should be indexed as keyword or text.
        :returns: Entity type with updated attribute_types.
        """
        # Check mutation before applying atomically
        uuid, replace_idx, old_mapping_name = self.check_mutation(
            entity_type, name, new_attribute_type
        )

        # Create new alias definition and mapping.
        if new_style is not None:
            new_attribute_type['style'] = new_style
        mapping_type = _get_alias_type(new_attribute_type)
        mapping_name = f'{uuid}_{mapping_type}'
        alias = {name: {'type': 'alias',
                        'path': mapping_name}}
        mapping = {mapping_name: {'type': mapping_type}}
        # Create new mapping.
        self.es.indices.put_mapping(
            index=self.index_name(entity_type.project.pk),
            body={'properties': {**mapping, **alias}},
        )

        # Copy values from old mapping to new mapping.
        body = {
            "script": f"ctx._source['{mapping_name}']=ctx._source['{old_mapping_name}'];",
            "query": {"exists": {"field": old_mapping_name}},
        }
        self.es.update_by_query(
            index=self.index_name(entity_type.project.pk),
            body=body,
            conflicts='proceed',
            slices="auto",
            requests_per_second=-1,
        )

        # Replace values in old mapping with null.
        body = {
            "script": f"ctx._source['{old_mapping_name}']=null;",
            "query": {"exists": {"field": old_mapping_name}},
        }
        self.es.update_by_query(
            index=self.index_name(entity_type.project.pk),
            body=body,
            conflicts='proceed',
            slices="auto",
            requests_per_second=-1,
        )

        # Update entity type object with new values.
        entity_type.attribute_types[replace_idx] = new_attribute_type
        return entity_type

    def check_deletion(self, entity_type, name):
        """
        Checks deletion operation and raises if it is invalid. See `delete_alias` for argument
        description.
        """
        # Retrieve UUID, raise error if it doesn't exist.
        uuid = entity_type.project.attribute_type_uuids.get(name)
        if uuid is None:
            raise ValueError(f"Could not find attribute name {name} in entity type "
                             f"{type(entity_type).__name__} ID {entity_type.id}")

        # Find old attribute type and create new attribute type.
        for idx, attribute_type in enumerate(entity_type.attribute_types):
            if attribute_type['name'] == name:
                delete_idx = idx
                mapping_type = _get_alias_type(attribute_type)
                mapping_name = f'{uuid}_{mapping_type}'
                old_dtype = attribute_type['dtype']
                break
        else:
            raise ValueError(f"Could not find attribute name {name} in entity type "
                             f"{type(entity_type).__name__} ID {entity_type.id}")

        return uuid, delete_idx, mapping_name

    def delete_alias(self, entity_type, name):
        """
        Deletes existing alias.

        :param entity_type: *Type object.
        :param name: Name of attribute type being deleted.
        :returns: Entity type with updated attribute_types.
        """
        # Check deletion before performing atomically
        uuid, delete_idx, mapping_name = self.check_deletion(entity_type, name)

        # Replace values in mapping with null.
        body = {
            'script': f"ctx._source['{mapping_name}']=null;",
            "query": {"exists": {"field": mapping_name}},
        }
        self.es.update_by_query(
            index=self.index_name(entity_type.project.pk),
            body=body,
            conflicts='proceed',
            slices="auto",
            requests_per_second=-1,
        )

        # Remove attribute from entity type object.
        del entity_type.attribute_types[delete_idx]
        return entity_type

    def bulk_add_documents(self, listOfDocs):
        bulk(self.es, listOfDocs, raise_on_error=False)

    def create_document(self, entity, wait=False):
        """ Indicies an element into ES """
        docs = self.build_document(entity, 'single')
        for doc in docs:
            logger.info(f"Making Doc={doc}")
            res = self.es.index(index=self.index_name(entity.project.pk),
                                id=doc['_id'],
                                refresh=wait,
                                routing=1,
                                body={**doc['_source']})

    def build_document(self, entity, mode='index'):
        """ Returns a list of documents representing the entity to be
            used with the es.helpers.bulk functions
            if mode is 'single', then one can use the 'doc' member
            as the parameters to the es.index function.
        """
        aux = {}
        aux['_meta'] = entity.meta.pk
        aux['_dtype'] = entity.meta.dtype
        aux['_postgres_id'] = entity.pk # Same as ID but indexed/sortable. Use of _id for this
                                        # purpose is not recommended by ES.
        aux['_created_datetime'] = entity.created_datetime.isoformat()
        aux['_created_by'] = str(entity.created_by)
        aux['_modified_datetime'] = entity.modified_datetime.isoformat()
        aux['_modified_by'] = str(entity.modified_by)
        tzinfo = entity.created_datetime.tzinfo
        aux['_indexed_datetime'] = datetime.datetime.now(tzinfo).isoformat()
        duplicates = []
        if entity.meta.dtype in ['image', 'video', 'multi', 'live']:
            aux['_media_relation'] = 'media'
            aux['filename'] = entity.name
            aux['_exact_name'] = entity.name
            aux['_md5'] = entity.md5
            aux['_gid'] = entity.gid
            aux['_uid'] = entity.uid
            aux['_archive_state'] = entity.archive_state

            # Get total size and download size of this file.
            total_size, download_size = entity.get_file_sizes()
            aux['_total_size'] = total_size
            aux['_download_size'] = download_size

            # Get total duration of this file.
            aux['_duration'] = 0.0
            if entity.meta.dtype == 'video':
                if entity.num_frames is not None and entity.fps is not None:
                    aux['_duration'] = entity.num_frames / entity.fps

            # Copy section name.
            if entity.attributes is not None:
                if 'tator_user_sections' in entity.attributes:
                    aux['tator_user_sections'] = entity.attributes['tator_user_sections']
        elif entity.meta.dtype in ['box', 'line', 'dot']:
            aux['_media_relation'] = {
                'name': 'annotation',
                'parent': f"{entity.media.meta.dtype}_{entity.media.pk}",
            }
            if entity.version:
                aux['_annotation_version'] = entity.version.pk
            aux['_modified'] = entity.modified
            aux['_user'] = entity.user.pk
            aux['_email'] = entity.user.email
            aux['_meta'] = entity.meta.pk
            aux['_frame'] = entity.frame
            aux['_x'] = entity.x
            aux['_y'] = entity.y
            if entity.thumbnail_image:
                aux['_thumbnail_image'] = entity.thumbnail_image.pk
            else:
                aux['_thumbnail_image'] = None
            if entity.meta.dtype == 'box':
                aux['_width'] = entity.width
                aux['_height'] = entity.height
            elif entity.meta.dtype == 'line':
                aux['_u'] = entity.u
                aux['_v'] = entity.v
            elif entity.meta.dtype == 'dot':
                pass
        elif entity.meta.dtype in ['state']:
            media = entity.media.all()
            if media.exists():
                aux['_media_relation'] = {
                    'name': 'annotation',
                    'parent': f"{media[0].meta.dtype}_{media[0].pk}",
                }
                for media_idx in range(1, media.count()):
                    duplicate = deepcopy(aux)
                    duplicate['_media_relation'] = {
                        'name': 'annotation',
                        'parent': f"{media[media_idx].meta.dtype}_{media[media_idx].pk}",
                    }
                    duplicates.append(duplicate)
            try:
                # If the state has an extracted image, its a
                # duplicated entry in ES.
                extracted_image = entity.extracted
                if extracted_image:
                    duplicate = deepcopy(aux)
                    duplicate['_media_relation'] = {
                        'name': 'annotation',
                        'parent': f"{extracted_image.meta.dtype}_{extracted_image.pk}",
                    }
                    duplicates.append(duplicate)
            except:
                pass
            if entity.version:
                aux['_annotation_version'] = entity.version.pk
            aux['_modified'] = entity.modified
        elif entity.meta.dtype in ['leaf']:
            aux['_exact_treeleaf_name'] = entity.name
            aux['tator_treeleaf_name'] = entity.name
            aux['_treeleaf_depth'] = entity.depth()
            aux['_treeleaf_path'] = entity.computePath()
        if entity.attributes is None:
            entity.attributes = {}
            entity.save()

        # Index attributes for all supported dtype mutations.
        mapping_values = _get_mapping_values(entity.meta, entity.attributes)

        results=[]
        results.append({
            '_index':self.index_name(entity.project.pk),
            '_op_type': mode,
            '_source': {
                **mapping_values,
                **aux,
            },
            '_id': f"{aux['_dtype']}_{entity.pk}",
            '_routing': 1,
        })

        # Load in duplicates, if any
        for idx,duplicate in enumerate(duplicates):
            # duplicate_id needs to be unique we use the upper
            # 8 bits of the id field to indicate which duplicate
            # it is. This won't create collisions until there are
            # more than 2^256 elements in the database or more than
            # 256 duplicates for a given type
            duplicate_id = entity.pk + ((idx + 1) << id_bits)
            results.append({
            '_index':self.index_name(entity.project.pk),
            '_op_type': mode,
            '_source': {
                **mapping_values,
                **duplicate,
            },
            '_id': f"{aux['_dtype']}_{duplicate_id}",
            '_routing': 1,
            })
        return results


    def delete_document(self, entity):
        # If project is null, the entire index should have been deleted.
        if not entity.project is None:
            index = self.index_name(entity.project.pk)
            if entity.meta:
                if self.es.exists(index=index, id=f'{entity.meta.dtype}_{entity.pk}'):
                    self.es.delete(index=index, id=f'{entity.meta.dtype}_{entity.pk}')

    def search_raw(self, project, query):
        return self.es.search(
            index=self.index_name(project),
            body=query,
            stored_fields=[],
        )

    def search(self, project, query):
        if 'sort' not in query:
            query['sort'] = {'_doc': 'asc'}
        size = query.get('size', None)
        if (size is None) or (size >= 10000):
            query['size'] = 10000
            result = self.es.search(
                index=self.index_name(project),
                body=query,
                scroll='1m',
                stored_fields=[],
            )
            scroll_id = result['_scroll_id']
            result = result['hits']
            data = result['hits']
            count = result['total']['value']

            if size:
                count = size
            ids = drop_dupes([int(obj['_id'].split('_')[1]) & id_mask for obj in data])
            while len(ids) < count:
                result = self.es.scroll(
                    scroll_id=scroll_id,
                    scroll='1m',
                )
                if len(result['hits']['hits']) == 0:
                    break
                ids += drop_dupes([int(obj['_id'].split('_')[1]) & id_mask for obj in result['hits']['hits']])
            ids = ids[:count]
            self.es.clear_scroll(scroll_id=scroll_id)
        else:
            # TODO: This will NOT return the requested number of results if there are
            # duplicates in the dataset.
            result = self.search_raw(project, query)
            result = result['hits']
            data = result['hits']
            count = result['total']['value']
            ids = drop_dupes([int(obj['_id'].split('_')[1]) & id_mask for obj in data])
        return ids, count

    def count(self, project, query):
        index = self.index_name(project)
        count_query = dict(query)
        count_query.pop('sort', None)
        count_query.pop('aggs', None)
        count_query.pop('size', None)
        return self.es.count(index=index, body=count_query)['count']

    def refresh(self, project):
        """Force refresh on an index.
        """
        self.es.indices.refresh(index=self.index_name(project))

    def delete(self, project, query):
        """Bulk delete on search results.
        """
        self.es.delete_by_query(
            index=self.index_name(project),
            body=query,
            conflicts='proceed',
        )

    def update(self, project, entity_type, query, attrs):
        """Bulk update on search results.
        """
        query['script'] = ''
        mapping_values = _get_mapping_values(entity_type, attrs)
        for key, val in mapping_values.items():
            if isinstance(val, bool):
                if val:
                    val = 'true'
                else:
                    val = 'false'
            if isinstance(val, list): # This is a list geopos type
                lon, lat = val # Lists are lon first
                val = f'{lat},{lon}' # Convert to string geopos type, lat first
            query['script'] += f"ctx._source['{key}']='{val}';"
        self.es.update_by_query(
            index=self.index_name(project),
            body=query,
            conflicts='proceed',
        )

TatorSearch.setup_elasticsearch()
