""" TODO: add documentation for this """
import logging
import os
from urllib import parse as urllib_parse

from rest_framework.authtoken.models import Token
from django.conf import settings

from ..kube import TatorTranscode
from ..consumers import ProgressProducer
from ..models import MediaType
from ..schema import TranscodeSchema
from ..notify import Notify

from ._base_views import BaseListView
from ._permissions import ProjectTransferPermission

logger = logging.getLogger(__name__)

class TranscodeAPI(BaseListView):
    """ Start a transcode.

        Videos in Tator must be transcoded to a multi-resolution streaming format before they
        can be viewed or annotated. This endpoint launches a transcode on raw uploaded video by
        creating an Argo workflow. The workflow will download the uploaded raw video, transcode
        it to the proper format, upload the transcoded video, and save the video using the
        `SaveVideo` endpoint. Optionally, depending on the `keep_original` field of the video
        type specified by the `type` parameter, the originally uploaded file may also be saved.
        Note that the raw video must be uploaded first via tus, which is a separate mechanism
        from the REST API. This endpoint requires a group and run UUID associated with this
        upload. If no progress messages were generated during upload, then the group and run
        UUIDs can be newly generated.
    """
    schema = TranscodeSchema()
    permission_classes = [ProjectTransferPermission]
    http_method_names = ['post']

    def _post(self, params):
        entity_type = params['type']
        gid = str(params['gid'])
        uid = params['uid']
        url = params['url']
        section = params['section']
        name = params['name']
        md5 = params['md5']
        project = params['project']
        token, _ = Token.objects.get_or_create(user=self.request.user)

        prog = ProgressProducer(
            'upload',
            project,
            gid,
            uid,
            name,
            self.request.user,
            {'section': section},
        )

        type_objects = MediaType.objects.filter(project=project)
        if entity_type != -1:
            #If we are transcoding and not unpacking we know its a video type we need
            type_objects = type_objects.filter(pk=entity_type, dtype="video")

        # For tar/zip uploads, we can still get an error after this
        # because the tar may contain images or video.
        logger.info(f"Count of type {type_objects.count()}")
        if type_objects.count() == 0:
            raise Exception(f"For project {project} given type {entity_type}, can not find a "
                            "destination media type")

        # Get the file size of the uploaded blob if local
        netloc = urllib_parse.urlsplit(url).netloc
        logger.info(f"{netloc} vs. {self.request.get_host()}")
        if netloc == self.request.get_host():
            upload_uid = url.split('/')[-1]
            upload_path = os.path.join(settings.UPLOAD_ROOT, upload_uid)
            upload_size = os.stat(upload_path).st_size
        else:
            # TODO: get file size of remote
            upload_size = None
        if entity_type == -1:
            TatorTranscode().start_tar_import(
                project,
                entity_type,
                token,
                url,
                name,
                section,
                md5,
                gid,
                uid,
                self.request.user.pk,
                upload_size)
        else:
            TatorTranscode().start_transcode(
                project,
                entity_type,
                token,
                url,
                name,
                section,
                md5,
                gid,
                uid,
                self.request.user.pk,
                upload_size)

        prog.progress("Transcoding...", 60)

        msg = (f"Transcode job {uid} started for file "
               f"{name} on project {type_objects[0].project.name}")
        response_data = {'message': msg,
                         'run_uid': uid,
                         'group_id': gid}

        # Send notification that transcode started.
        logger.info(msg)
        Notify.notify_admin_msg(msg)
        return response_data
