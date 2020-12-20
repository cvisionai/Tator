import logging
from django.db.models import Subquery
from django.db import transaction

from ..models import Localization
from ..models import LocalizationType
from ..models import Media
from ..models import MediaType
from ..models import State
from ..models import User
from ..models import Project
from ..models import Version
from ..models import database_qs
from ..models import database_query_ids
from ..search import TatorSearch
from ..schema import LocalizationListSchema
from ..schema import LocalizationDetailSchema
from ..schema import parse

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._annotation_query import get_annotation_queryset
from ._attributes import AttributeFilterMixin
from ._attributes import patch_attributes
from ._attributes import bulk_patch_attributes
from ._attributes import validate_attributes
from ._util import computeRequiredFields
from ._util import check_required_fields
from ._permissions import ProjectEditPermission

logger = logging.getLogger(__name__)

class LocalizationListAPI(BaseListView, AttributeFilterMixin):
    """ Interact with list of localizations.

        Localizations are shape annotations drawn on a video or image. They are currently of type
        box, line, or dot. Each shape has slightly different data members. Localizations are
        a type of entity in Tator, meaning they can be described by user defined attributes.

        This endpoint supports bulk patch of user-defined localization attributes and bulk delete.
        Both are accomplished using the same query parameters used for a GET request.
    """
    schema = LocalizationListSchema()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'post', 'patch', 'delete']
    entity_type = LocalizationType # Needed by attribute filter mixin

    def _get(self, params):
        self.validate_attribute_filter(params)
        postgres_params = ['project', 'media_id', 'type', 'version', 'operation', 'format', 'excludeParents','frame']
        use_es = any([key not in postgres_params for key in params])

        # Get the localization list.
        if use_es:
            response_data = []
            annotation_ids, annotation_count, _ = get_annotation_queryset(
                params['project'],
                params,
                'localization',
            )
            if self.operation == 'count':
                response_data = {'count': len(annotation_ids)}
            elif len(annotation_ids) > 0:
                if params['excludeParents']:
                    qs = Localization.objects.filter(pk__in=annotation_ids)
                    parent_set = Localization.objects.filter(pk__in=Subquery(
                        qs.values('parent')))
                    result_set = qs.difference(parent_set).order_by('id')
                    response_data = database_qs(result_set)
                else:
                    response_data = database_query_ids('main_localization',
                                                       annotation_ids,
                                                       'id')
        else:
            qs = Localization.objects.filter(project=params['project'])
            if 'media_id' in params:
                qs = qs.filter(media__in=params['media_id'])
            if 'type' in params:
                qs = qs.filter(meta=params['type'])
            if 'version' in params:
                qs = qs.filter(version__in=params['version'])
            if 'frame' in params:
                qs = qs.filter(frame=params['frame'])
            # TODO: Remove modified parameter
            qs = qs.exclude(modified=False)
            if self.operation == 'count':
                response_data = {'count': qs.count()}
            else:
                if params['excludeParents']:
                    parent_set = Localization.objects.filter(pk__in=Subquery(qs.values('parent')))
                    result_set = qs.difference(parent_set).order_by('id')
                else:
                    result_set = qs.order_by('id')
                response_data = database_qs(result_set)

        # Adjust fields for csv output.
        if self.request.accepted_renderer.format == 'csv' and self.operation != 'count':
            # CSV creation requires a bit more
            user_ids = set([d['user'] for d in response_data])
            users = list(User.objects.filter(id__in=user_ids).values('id','email'))
            email_dict = {}
            for user in users:
                email_dict[user['id']] = user['email']

            media_ids = set([d['media'] for d in response_data])
            medias = list(Media.objects.filter(id__in=media_ids).values('id','name'))
            filename_dict = {}
            for media in medias:
                filename_dict[media['id']] = media['name']

            for element in response_data:
                del element['meta']

                oldAttributes = element['attributes']
                del element['attributes']
                element.update(oldAttributes)

                user_id = element['user']
                media_id = element['media']

                element['user'] = email_dict[user_id]
                element['media'] = filename_dict[media_id]
        return response_data

    def _post(self, params):
        # Check that we are getting a localization list.
        if 'body' in params:
            loc_specs = params['body']
        else:
            raise Exception('Localization creation requires list of localizations!')

        # Get a default version.
        default_version = Version.objects.filter(project=params['project'], number=0)
        if default_version.exists():
            default_version = default_version[0]
        else:
            # If version 0 does not exist, create it.
            default_version = Version.objects.create(
                name="Baseline",
                description="Initial version",
                project=project,
                number=0,
            )

        # Find unique foreign keys.
        meta_ids = set([loc['type'] for loc in loc_specs])
        media_ids = set([loc['media_id'] for loc in loc_specs])
        version_ids = set([loc.get('version', None) for loc in loc_specs])

        # Make foreign key querysets.
        meta_qs = LocalizationType.objects.filter(pk__in=meta_ids)
        media_qs = Media.objects.filter(pk__in=media_ids)
        version_qs = Version.objects.filter(pk__in=version_ids)

        # Construct foreign key dictionaries.
        project = Project.objects.get(pk=params['project'])
        metas = {obj.id:obj for obj in meta_qs.iterator()}
        medias = {obj.id:obj for obj in media_qs.iterator()}
        versions = {obj.id:obj for obj in version_qs.iterator()}
        versions[None] = default_version

        # Get required fields for attributes.
        required_fields = {id_:computeRequiredFields(metas[id_]) for id_ in meta_ids}
        attr_specs = [check_required_fields(required_fields[loc['type']][0],
                                            required_fields[loc['type']][2],
                                            loc)
                      for loc in loc_specs]
       
        # Create the localization objects.
        localizations = []
        create_buffer = []
        for loc_spec, attrs in zip(loc_specs, attr_specs):
            parent = None
            if loc_spec.get('parent', None):
                parent = Localization.objects.get(pk=loc_spec.get('parent', None))
            loc = Localization(project=project,
                               meta=metas[loc_spec['type']],
                               media=medias[loc_spec['media_id']],
                               user=self.request.user,
                               attributes=attrs,
                               created_by=self.request.user,
                               modified_by=self.request.user,
                               version=versions[loc_spec.get('version', None)],
                               parent=parent,
                               x=loc_spec.get('x', None),
                               y=loc_spec.get('y', None),
                               u=loc_spec.get('u', None),
                               v=loc_spec.get('v', None),
                               width=loc_spec.get('width', None),
                               height=loc_spec.get('height', None),
                               frame=loc_spec.get('frame', None))
            create_buffer.append(loc)
            if len(create_buffer) > 1000:
                localizations += Localization.objects.bulk_create(create_buffer)
                create_buffer = []
        localizations += Localization.objects.bulk_create(create_buffer)

        # Build ES documents.
        ts = TatorSearch()
        documents = []
        for loc in localizations:
            documents += ts.build_document(loc)
            if len(documents) > 1000:
                ts.bulk_add_documents(documents)
                documents = []
        ts.bulk_add_documents(documents)

        # Return created IDs.
        ids = [loc.id for loc in localizations]
        return {'message': f'Successfully created {len(ids)} localizations!', 'id': ids}

    def _delete(self, params):
        self.validate_attribute_filter(params)
        annotation_ids, annotation_count, query = get_annotation_queryset(
            params['project'],
            params,
            'localization',
        )
        if len(annotation_ids) > 0:
            # Delete any state many to many relations to these localizations.
            state_qs = State.localizations.through.objects.filter(localization__in=annotation_ids)
            state_qs._raw_delete(state_qs.db)

            # Delete the localizations.
            qs = Localization.objects.filter(pk__in=annotation_ids)
            qs._raw_delete(qs.db)
            TatorSearch().delete(self.kwargs['project'], query)
        return {'message': f'Successfully deleted {len(annotation_ids)} localizations!'}

    def _patch(self, params):
        self.validate_attribute_filter(params)
        annotation_ids, annotation_count, query = get_annotation_queryset(
            params['project'],
            params,
            'localization',
        )
        if len(annotation_ids) > 0:
            qs = Localization.objects.filter(pk__in=annotation_ids)
            new_attrs = validate_attributes(params, qs[0])
            bulk_patch_attributes(new_attrs, qs)
            qs.update(modified_by=self.request.user)
            TatorSearch().update(self.kwargs['project'], qs[0].meta, query, new_attrs)
        return {'message': f'Successfully updated {len(annotation_ids)} localizations!'}

    def get_queryset(self):
        params = parse(self.request)
        self.validate_attribute_filter(params)
        annotation_ids, annotation_count, _ = get_annotation_queryset(
            params['project'],
            params,
            'localization',
        )
        queryset = Localization.objects.filter(pk__in=annotation_ids)
        return queryset

class LocalizationDetailAPI(BaseDetailView):
    """ Interact with single localization.

        Localizations are shape annotations drawn on a video or image. They are currently of type
        box, line, or dot. Each shape has slightly different data members. Localizations are
        a type of entity in Tator, meaning they can be described by user defined attributes.
    """
    schema = LocalizationDetailSchema()
    permission_classes = [ProjectEditPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        return database_qs(Localization.objects.filter(pk=params['id']))[0]

    @transaction.atomic
    def _patch(self, params):
        obj = Localization.objects.get(pk=params['id'])

        # Patch common attributes.
        frame = params.get("frame", None)
        x = params.get("x", None)
        y = params.get("y", None)
        if frame is not None:
            obj.frame = frame
        if x is not None:
            obj.x = x
        if y is not None:
            obj.y = y

        if obj.meta.dtype == 'box':
            height = params.get("height", None)
            width = params.get("width", None)
            thumbnail_image = params.get("thumbnail_image", None)
            if height:
                obj.height = height
            if width:
                obj.width = width

            # If the localization moved; the thumbnail is expired
            if (x or y or height or width) and obj.thumbnail_image:
                obj.thumbnail_image.delete()

            if thumbnail_image:
                try:
                    thumbnail_obj = Media.objects.get(pk=thumbnail_image)
                    obj.thumbnail_image = thumbnail_obj
                except:
                    logger.error("Bad thumbnail reference given")
        elif obj.meta.dtype == 'line':
            u = params.get("u", None)
            v = params.get("v", None)
            if u:
                obj.u = u
            if v:
                obj.v = v
        elif obj.meta.dtype == 'dot':
            pass
        else:
            # TODO: Handle circles.
            pass

        new_attrs = validate_attributes(params, obj)
        obj = patch_attributes(new_attrs, obj)

        # Update modified_by to be the last user
        obj.modified_by = self.request.user

        # Patch the thumbnail attributes
        if obj.thumbnail_image:
            obj.thumbnail_image = patch_attributes(new_attrs, obj.thumbnail_image)
            obj.thumbnail_image.save()

        obj.save()
        return {'message': f'Localization {params["id"]} successfully updated!'}

    def _delete(self, params):
        Localization.objects.get(pk=params['id']).delete()
        return {'message': f'Localization {params["id"]} successfully deleted!'}

    def get_queryset(self):
        return Localization.objects.all()

