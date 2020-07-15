""" TODO: add documentation for this """
import logging
import datetime
import itertools

from django.contrib.postgres.aggregates import ArrayAgg
import numpy as np

from ..models import State
from ..models import StateType
from ..models import Media
from ..models import Localization
from ..models import Project
from ..models import Version
from ..models import InterpolationMethods
from ..models import database_qs
from ..models import database_query_ids
from ..search import TatorSearch
from ..schema import StateListSchema
from ..schema import StateDetailSchema
from ..schema import parse

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._annotation_query import get_annotation_queryset
from ._attributes import AttributeFilterMixin
from ._attributes import patch_attributes
from ._attributes import bulk_patch_attributes
from ._attributes import validate_attributes
from ._util import check_required_fields
from ._permissions import ProjectEditPermission

logger = logging.getLogger(__name__)

class StateListAPI(BaseListView, AttributeFilterMixin):
    """ Interact with list of states.

        A state is a description of a collection of other objects. The objects a state describes
        could be media (image or video), video frames, or localizations. A state referring
        to a collection of localizations is often referred to as a track. States are
        a type of entity in Tator, meaning they can be described by user defined attributes.

        This endpoint supports bulk patch of user-defined state attributes and bulk delete.
        Both are accomplished using the same query parameters used for a GET request.

        It is importarant to know the fields required for a given entity_type_id as they are
        expected in the request data for this function. As an example, if the entity_type_id has
        attribute types associated with it named time and position, the JSON object must have
        them specified as keys.
    """
    schema = StateListSchema()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'post', 'patch', 'delete']
    entity_type = StateType # Needed by attribute filter mixin

    def _get(self, params):
        self.validate_attribute_filter(params)
        postgres_params = ['project', 'media_id', 'type', 'version', 'modified', 'operation']
        use_es = any([key not in postgres_params for key in params])

        # Get the state list.
        t_0 = datetime.datetime.now()
        if use_es:
            response_data = []
            annotation_ids, _, _ = get_annotation_queryset(
                params['project'],
                params,
                'state',
            )
            if self.operation == 'count':
                response_data = {'count': len(annotation_ids)}
            elif len(annotation_ids) > 0:
                response_data = database_query_ids('main_state', annotation_ids, 'id')

        else:
            qs = State.objects.filter(project=params['project'])
            if 'media_id' in params:
                qs = qs.filter(media__in=params['media_id'])
            if 'type' in params:
                qs = qs.filter(meta=params['type'])
            if 'version' in params:
                qs = qs.filter(version__in=params['version'])
            if 'modified' in params:
                qs = qs.exclude(modified=(not params['modified']))
            if self.operation == 'count':
                response_data = {'count': qs.count()}
            else:
                response_data = database_qs(qs.order_by('id'))
        t_1 = datetime.datetime.now()
        if self.operation != 'count':
            # Get many to many fields.
            state_ids = [state['id'] for state in response_data]
            localizations = {obj['state_id']:obj['localizations'] for obj in
                             State.localizations.through.objects\
                .filter(state__in=state_ids)\
                .values('state_id').order_by('state_id')\
                .annotate(localizations=ArrayAgg('localization_id')).iterator()}
            media = {obj['state_id']:obj['media'] for obj in
                     State.media.through.objects\
                .filter(state__in=state_ids)\
                .values('state_id').order_by('state_id')\
                .annotate(media=ArrayAgg('media_id')).iterator()}
            # Copy many to many fields into response data.
            for state in response_data:
                state['localizations'] = localizations.get(state['id'], [])
                state['media'] = media.get(state['id'], [])
        if (self.request.accepted_renderer.format == 'csv'
                and self.operation != 'count'
                and 'type' in params):
            type_object = StateType.objects.get(pk=params['type'])
            if (type_object.association == 'Frame'
                    and type_object.interpolation == InterpolationMethods.LATEST):
                for idx, e_l in enumerate(response_data):
                    media_el = Media.objects.get(pk=e_l['media'])
                    end_frame = 0
                    if idx + 1 < len(response_data):
                        next_element = response_data[idx+1]
                        end_frame = next_element['frame']
                    else:
                        end_frame = media_el.num_frames
                    e_l['media'] = media_el.name

                    e_l['endFrame'] = end_frame
                    e_l['startSeconds'] = int(e_l['frame']) * media_el.fps
                    e_l['endSeconds'] = int(e_l['end_frame']) * media_el.fps
        t_2 = datetime.datetime.now()
        logger.info(f"Number of states: {len(response_data)}")
        logger.info(f"Time to get states: {t_1-t_0}")
        logger.info(f"Time to get states many to many fields: {t_2-t_1}")
        return response_data

    def _post(self, params):
        # Check that we are getting a state list.
        if 'body' in params:
            state_specs = params['body']
        else:
            raise Exception('State creation requires list of states!')

        # Get a default version.
        default_version = Version.objects.filter(project=params['project'], number=0)
        if default_version.exists():
            default_version = default_version[0]
        else:
            # If version 0 does not exist, create it.
            default_version = Version.objects.create(
                name="Baseline",
                description="Initial version",
                project=Project.objects.get(pk=params['project']),
                number=0,
            )

        # Find unique foreign keys.
        meta_ids = {state['type'] for state in state_specs}
        version_ids = {state.get('version', None) for state in state_specs}

        # Make foreign key querysets.
        meta_qs = StateType.objects.filter(pk__in=meta_ids)
        version_qs = Version.objects.filter(pk__in=version_ids)

        # Construct foreign key dictionaries.
        project = Project.objects.get(pk=params['project'])
        metas = {obj.id:obj for obj in meta_qs.iterator()}
        versions = {obj.id:obj for obj in version_qs.iterator()}
        versions[None] = default_version

        # Get required fields for attributes.
        required_fields = {id_:(metas[id_]) for id_ in meta_ids}
        attr_specs = [check_required_fields(required_fields[state['type']][0],
                                            required_fields[state['type']][2],
                                            state)
                      for state in state_specs]

        # Create the state objects.
        states = []
        create_buffer = []
        for state_spec, attrs in zip(state_specs, attr_specs):
            state = State(project=project,
                          meta=metas[state_spec['type']],
                          attributes=attrs,
                          modified=state_spec.get('modified', None),
                          created_by=self.request.user,
                          modified_by=self.request.user,
                          version=versions[state_spec.get('version', None)],
                          frame=state_spec.get('frame', None))
            create_buffer.append(state)
            if len(create_buffer) > 1000:
                states += State.objects.bulk_create(create_buffer)
                create_buffer = []
        states += State.objects.bulk_create(create_buffer)

        # Create media relations.
        media_relations = []
        for state, state_spec in zip(states, state_specs):
            for media_id in state_spec['media_ids']:
                media_states = State.media.through(
                    state_id=state.id,
                    media_id=media_id,
                )
                media_relations.append(media_states)
                if len(media_relations) > 1000:
                    State.media.through.objects.bulk_create(media_relations)
                    media_relations = []
        State.media.through.objects.bulk_create(media_relations)

        # Create localization relations.
        loc_relations = []
        for state, state_spec in zip(states, state_specs):
            if 'localization_ids' in state_spec:
                for localization_id in state_spec['localization_ids']:
                    loc_states = State.localizations.through(
                        state_id=state.id,
                        localization_id=localization_id,
                    )
                    loc_relations.append(loc_states)
                    if len(loc_relations) > 1000:
                        State.localizations.through.objects.bulk_create(loc_relations)
                        loc_relations = []
        State.localizations.through.objects.bulk_create(loc_relations)

        # Calculate segments (this is not triggered for bulk created m2m).
        localization_ids = itertools.chain(*[state_spec.get('localization_ids', [])
                                             for state_spec in state_specs])
        loc_id_to_frame = {loc['id']:loc['frame'] for loc in
                           Localization.objects.filter(pk__in=localization_ids)\
                           .values('id', 'frame').iterator()}
        for state, state_spec in zip(states, state_specs):
            frames = [loc_id_to_frame[loc_id] for loc_id in state_spec.get('localization_ids', [])]
            if len(frames) > 0:
                frames = np.sort(frames)
                segments = np.split(frames, np.where(np.diff(frames) != 1)[0] + 1)
                state.segments = [[int(segment[0]), int(segment[-1])] for segment in segments]
        State.objects.bulk_update(states, ['segments'])

        # Build ES documents.
        t_s = TatorSearch()
        documents = []
        for state in states:
            documents += t_s.build_document(state)
            if len(documents) > 1000:
                t_s.bulk_add_documents(documents)
                documents = []
        t_s.bulk_add_documents(documents)

        # Return created IDs.
        ids = [state.id for state in states]
        return {'message': f'Successfully created {len(ids)} states!', 'id': ids}

    def _delete(self, params):
        self.validate_attribute_filter(params)
        annotation_ids, _, query = get_annotation_queryset(
            params['project'],
            params,
            'state',
        )
        if len(annotation_ids) > 0:
            # Delete media many to many
            media_qs = State.media.through.objects.filter(state__in=annotation_ids)
            media_qs._raw_delete(media_qs.db) #pylint: disable=protected-access

            # Delete localization many to many
            loc_qs = State.localizations.through.objects.filter(state__in=annotation_ids)
            loc_qs._raw_delete(loc_qs.db) #pylint: disable=protected-access

            # Delete states.
            qs = State.objects.filter(pk__in=annotation_ids)
            qs._raw_delete(qs.db) #pylint: disable=protected-access
            TatorSearch().delete(self.kwargs['project'], query)
        return {'message': f'Successfully deleted {len(annotation_ids)} states!'}

    def _patch(self, params):
        self.validate_attribute_filter(params)
        annotation_ids, _, query = get_annotation_queryset(
            params['project'],
            params,
            'state',
        )
        if len(annotation_ids) > 0:
            qs = State.objects.filter(pk__in=annotation_ids)
            new_attrs = validate_attributes(params, qs[0])
            bulk_patch_attributes(new_attrs, qs)
            qs.update(modified_by=self.request.user)
            TatorSearch().update(self.kwargs['project'], query, new_attrs)
        return {'message': f'Successfully updated {len(annotation_ids)} states!'}

    def get_queryset(self):
        """ TODO: add documentation for this """
        params = parse(self.request)
        self.validate_attribute_filter(params)
        annotation_ids, _, _ = get_annotation_queryset(
            params['project'],
            params,
            'state',
        )
        queryset = State.objects.filter(pk__in=annotation_ids)
        return queryset


class StateDetailAPI(BaseDetailView):
    """ Interact with an individual state.

        A state is a description of a collection of other objects. The objects a state describes
        could be media (image or video), video frames, or localizations. A state referring
        to a collection of localizations is often referred to as a track. States are
        a types of entity in Tator, meaning they can be described by user defined attributes.
    """
    schema = StateDetailSchema()
    permission_classes = [ProjectEditPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        state = database_qs(State.objects.filter(pk=params['id']))[0]
        # Get many to many fields.
        state['localizations'] = list(State.localizations.through.objects\
                                      .filter(state_id=state['id'])\
                                      .aggregate(localizations=ArrayAgg('localization_id'))\
                                      ['localizations'])
        state['media'] = list(State.media.through.objects\
                              .filter(state_id=state['id'])\
                              .aggregate(media=ArrayAgg('media_id'))\
                              ['media'])
        return state

    def _patch(self, params):
        obj = State.objects.get(pk=params['id'])
        # Patch modified fields
        if 'modified' in params:
            obj.modified = params['modified']

        if 'frame' in params:
            obj.frame = params['frame']

        if 'media_ids' in params:
            media_elements = Media.objects.filter(pk__in=params['media_ids'])
            obj.media.set(media_elements)

        if 'localization_ids' in params:
            localizations = Localization.objects.filter(pk__in=params['localization_ids'])
            obj.localizations.set(localizations)

        new_attrs = validate_attributes(params, obj)
        obj = patch_attributes(new_attrs, obj)
        # Update modified_by to be the last user
        obj.modified_by = self.request.user

        obj.save()
        return {'message': f'State {params["id"]} successfully updated!'}

    def _delete(self, params):
        State.objects.get(pk=params['id']).delete()
        return {'message': f'State {params["id"]} successfully deleted!'}

    def get_queryset(self):
        """ TODO: add documentation for this """
        return State.objects.all()
