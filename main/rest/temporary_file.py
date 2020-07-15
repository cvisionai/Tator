""" TODO: add documentaion for this """
import datetime
import os
import logging

from django.conf import settings

from ..models import TemporaryFile
from ..models import Project
from ..serializers import TemporaryFileSerializer
from ..schema import TemporaryFileDetailSchema
from ..schema import TemporaryFileListSchema
from ..schema import parse

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectEditPermission

# Load the main.view logger
logger = logging.getLogger(__name__)

class TemporaryFileListAPI(BaseListView):
    """ Interact with temporary file list.

        Temporary files are files stored server side for a defined duration. The file must
        first be uploaded via tus, and can subsequently be saved using this endpoint.
    """
    schema = TemporaryFileListSchema()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'post', 'delete']

    def _get(self):
        return TemporaryFileSerializer(self.get_queryset(),
                                       many=True,
                                       context=self.get_renderer_context()).data

    def _delete(self):
        qs = self.get_queryset()
        qs.delete()
        return {'message': 'Delete successful'}

    def _post(self, params):
        url = params['url']
        project = params['project']
        name = params['name']
        hours = params['hours']
        if hours is None:
            hours = 24

        local_file_path = os.path.join(settings.UPLOAD_ROOT, url.split('/')[-1])
        temp_file = TemporaryFile.from_local(path=local_file_path,
                                             name=params['name'],
                                             project=Project.objects.get(pk=project),
                                             user=self.request.user,
                                             lookup=params['lookup'],
                                             hours=hours)
        response = {'message': f"Temporary file of {name} created!",
                    'id': temp_file.id}

        # Delete files from the uploads directory.
        if 'local_file_path' in locals():
            logger.info(f"Removing uploaded file {local_file_path}")
            if os.path.exists(local_file_path):
                logger.info(f"{local_file_path} exists and is being removed!")
                os.remove(local_file_path)
            info_path = os.path.splitext(local_file_path)[0] + '.info'
            if os.path.exists(info_path):
                os.remove(info_path)
        return response

    def get_queryset(self):
        """ TODO: add documentation for this """
        params = parse(self.request)
        qs = TemporaryFile.objects.filter(project__id=params['project'])
        if params['expired'] is None:
            expired = 0
        else:
            expired = params['expired']

        if expired > 0:
            qs = qs.filter(eol_datetime__lte=datetime.datetime.now())

        return qs

class TemporaryFileDetailAPI(BaseDetailView):
    """ Interact with temporary file.

        Temporary files are files stored server side for a defined duration. The file must
        first be uploaded via tus, and can subsequently be saved using this endpoint.
    """
    permission_classes = [ProjectEditPermission]
    schema = TemporaryFileDetailSchema()
    http_method_names = ['get', 'delete']

    def _get(self, params):
        tmp_file = TemporaryFile.objects.get(pk=params['id'])
        return TemporaryFileSerializer(tmp_file, context=self.get_renderer_context()).data

    def _delete(self, params):
        TemporaryFile.objects.get(pk=params['id']).delete()
        return {'message': f'Temporary file {params["id"]} successfully deleted!'}

    def get_queryset(self):
        """ TODO: add documenation for this """
        return TemporaryFile.objects.all()
