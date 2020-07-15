""" TODO: add documentation for this """
from django.contrib.postgres.aggregates import ArrayAgg

from ..models import Media
from ..models import MediaType
from ..models import StateType
from ..models import Project
from ..schema import StateTypeListSchema
from ..schema import StateTypeDetailSchema

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectFullControlPermission

fields = ['id', 'project', 'name', 'description', 'dtype', 'attribute_types',
          'interpolation', 'association', 'visible']

class StateTypeListAPI(BaseListView):
    """ Create or retrieve state types.

        A state type is the metadata definition object for a state. It includes association
        type, name, description, and (like other entity types) may have any number of attribute
        types associated with it.
    """
    permission_classes = [ProjectFullControlPermission]
    schema = StateTypeListSchema()
    http_method_names = ['get', 'post']

    def _get(self, params):
        """ Retrieve state types.

            A state type is the metadata definition object for a state. It includes association
            type, name, description, and (like other entity types) may have any number of attribute
            types associated with it.
        """
        media_id = params.get('media_id', None)
        if media_id is not None:
            if len(media_id) != 1:
                raise Exception('Entity type list endpoints expect only one media ID!')
            media_element = Media.objects.get(pk=media_id[0])
            states = StateType.objects.filter(media=media_element.meta)
            for state in states:
                if state.project.id != self.kwargs['project']:
                    raise Exception('State not in project!')
            response_data = states.values(*fields)
        else:
            response_data = StateType.objects.filter(project=self.kwargs['project']).values(*fields)
        # Get many to many fields.
        state_ids = [state['id'] for state in response_data]
        media = {obj['statetype_id']:obj['media'] for obj in
                 StateType.media.through.objects\
            .filter(statetype__in=state_ids)\
            .values('statetype_id').order_by('statetype_id')\
            .annotate(media=ArrayAgg('mediatype_id')).iterator()}
        # Copy many to many fields into response data.
        for state in response_data:
            state['media'] = media.get(state['id'], [])
        return response_data

    def _post(self, params):
        """ Create state type.

            A state type is the metadata definition object for a state. It includes association
            type, name, description, and (like other entity types) may have any number of attribute
            types associated with it.
        """
        params['project'] = Project.objects.get(pk=params['project'])
        media_types = params.pop('media_types')
        obj = StateType(**params)
        obj.save()
        media_qs = MediaType.objects.filter(project=params['project'], pk__in=media_types)
        if media_qs.count() != len(media_types):
            obj.delete()
            raise (f"Could not find media IDs {media_types}"
                   f"when creating state type!")
        for media in media_qs:
            obj.media.add(media)
        obj.save()
        return {'message': 'State type created successfully!', 'id': obj.id}

class StateTypeDetailAPI(BaseDetailView):
    """ Interact with an individual state type.

        A state type is the metadata definition object for a state. It includes association
        type, name, description, and (like other entity types) may have any number of attribute
        types associated with it.
    """
    schema = StateTypeDetailSchema()
    permission_classes = [ProjectFullControlPermission]
    lookup_field = 'id'

    def _get(self, params):
        """ Retrieve state type.

            A state type is the metadata definition object for a state. It includes association
            type, name, description, and (like other entity types) may have any number of attribute
            types associated with it.
        """
        state = StateType.objects.filter(pk=params['id']).values(*fields)[0]
        # Get many to many fields.
        state['media'] = list(StateType.media.through.objects\
                              .filter(statetype_id=state['id'])\
                              .aggregate(media=ArrayAgg('mediatype_id'))\
                              ['media'])
        return state

    def _patch(self, params):
        """ Update state type.

            A state type is the metadata definition object for a state. It includes association
            type, name, description, and (like other entity types) may have any number of attribute
            types associated with it.
        """
        name = params.get('name', None)
        description = params.get('description', None)

        obj = StateType.objects.get(pk=params['id'])
        if name is not None:
            obj.name = name
        if description is not None:
            obj.description = description

        obj.save()
        return {'message': 'State type updated successfully!'}

    def _delete(self, params):
        """ Delete state type.

            A state type is the metadata definition object for a state. It includes association
            type, name, description, and (like other entity types) may have any number of attribute
            types associated with it.
        """
        StateType.objects.get(pk=params['id']).delete()
        return {'message': f'State type {params["id"]} deleted successfully!'}

    def get_queryset(self):
        """ TODO: add documentation for this """
        return StateType.objects.all()
