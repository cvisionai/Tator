""" TODO: add documenation for this """
import logging
import datetime
from django.utils import timezone

from ..models import Version
from ..models import Project
from ..models import State
from ..models import Localization
from ..serializers import VersionSerializer
from ..schema import VersionListSchema
from ..schema import VersionDetailSchema

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectEditPermission

logger = logging.getLogger(__name__)

class VersionListAPI(BaseListView):
    """ Interact with a list of versions.

        Versions allow for multiple "layers" of annotations on the same media. Versions
        are created at the project level, but are only displayed for a given media
        if that media contains annotations in that version. The version of an annotation
        can be set by providing it in a POST operation. Currently only localizations
        and states can have versions.

        Versions are used in conjunction with the `modified` flag to determine whether
        an annotation should be displayed for a given media while annotating.
    """
    schema = VersionListSchema()
    queryset = Version.objects.all()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'post']

    def _post(self, params):
        name = params['name']
        description = params.get('description', None)
        project = params['project']

        number = max([obj.number for obj in Version.objects.filter(project=project)]) + 1

        obj = Version(
            name=name,
            description=description,
            show_empty=params['show_empty'],
            number=number,
            project=Project.objects.get(pk=project),
            created_by=self.request.user,
        )
        obj.save()

        if 'bases' in params:
            qs = Version.objects.filter(pk__in=params['bases'])
            if qs.count() < len(params['bases']):
                obj.delete()
            else:
                obj.bases.set(qs)

        return {'message': 'Created version successfully!', 'id': obj.id}

    def _get(self, params):
        media = params.get('media_id', None)
        project = params['project']

        qs = Version.objects.filter(project=project).order_by('number')
        data = VersionSerializer(
            qs,
            context=self.get_renderer_context(),
            many=True,
        ).data

        # We augment each version with 'num_created', 'created_datetime'
        # 'num_modified', 'modified_datetime', 'modified_by'
        response = []
        type_objects = [State, Localization]
        for datum in data:
            datum['num_created'] = 0
            datum['num_modified'] = 0
            earliest_ctime = timezone.now()
            latest_mtime = timezone.make_aware(datetime.datetime.fromtimestamp(0))
            for obj in type_objects:
                created_qs = obj.objects.filter(project=project, version=datum['id'])
                modified_qs = obj.objects.filter(project=project,
                                                 version=datum['id'], modified=True)
                if media:
                    created_qs = created_qs.filter(media=media)
                    modified_qs = modified_qs.filter(media=media)
                created_qs = created_qs.order_by('created_datetime')
                modified_qs = modified_qs.order_by('-modified_datetime')

                # Generate return structure
                num_created = created_qs.count()
                num_modified = modified_qs.count()
                datum['num_created'] += num_created
                datum['num_modified'] += modified_qs.count()
                if num_created:
                    if created_qs[0].created_datetime < earliest_ctime:
                        earliest_ctime = created_qs[0].created_datetime
                        datum['created_by'] = str(created_qs[0].created_by)
                        datum['created_datetime'] = earliest_ctime.isoformat()
                else:
                    datum['created_by'] = '---'
                    datum['created_datetime'] = '---'
                if num_modified:
                    if created_qs[0].modified_datetime > latest_mtime:
                        latest_mtime = created_qs[0].modified_datetime
                        datum['modified_by'] = str(created_qs[0].created_by)
                        datum['modified_datetime'] = earliest_ctime.isoformat()
                else:
                    datum['modified_by'] = '---'
                    datum['modified_datetime'] = '---'

            response.append(datum)

        return response

class VersionDetailAPI(BaseDetailView):
    """ Interact with individual version.

        Versions allow for multiple "layers" of annotations on the same media. Versions
        are created at the project level, but are only displayed for a given media
        if that media contains annotations in that version. The version of an annotation
        can be set by providing it in a POST operation. Currently only localizations
        and states can have versions.

        Versions are used in conjunction with the `modified` flag to determine whether
        an annotation should be displayed for a given media while annotating.
    """
    schema = VersionDetailSchema()
    permission_classes = [ProjectEditPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        version = Version.objects.get(pk=params['id'])
        return VersionSerializer(version).data

    def _patch(self, params):
        version = Version.objects.get(pk=params['id'])
        if 'name' in params:
            version.name = params['name']
        if 'description' in params:
            version.description = params['description']
        if 'show_empty' in params:
            version.show_empty = params['show_empty']
        version.save()
        if 'bases' in params:
            qs = Version.objects.filter(pk__in=params['bases'])
            if qs.count() < len(params['bases']):
                raise version.bases.set(qs)
        return {'message': f'Version {params["id"]} updated successfully!'}

    def _delete(self, params):
        Version.objects.get(pk=params['id']).delete()
        return {'message': f'Version {params["id"]} deleted successfully!'}

    def get_queryset(self):
        """ TODO: add documenation for this """
        return Version.objects.all()
