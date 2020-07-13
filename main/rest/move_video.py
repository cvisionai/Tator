""" TODO: add documentation for this """
import logging
import os
from uuid import uuid1

from rest_framework.authtoken.models import Token
from django.conf import settings

from ..kube import TatorMove
from ..models import Media
from ..schema import MoveVideoSchema

from ._base_views import BaseListView
from ._permissions import ProjectTransferPermission

logger = logging.getLogger(__name__)

class MoveVideoAPI(BaseListView):
    """ Moves a video file.

        This endpoint creates an Argo workflow that moves an uploaded video file into the
        appropriate project directory. When the move is complete, the workflow will make
        a PATCH request to the Media endpoint for the given media ID using the given
        `media_files` definitions.

        Videos in Tator must be transcoded to a multi-resolution streaming format before they
        can be viewed or annotated. To launch a transcode on raw uploaded video, use the
        `Transcode` endpoint, which will create an Argo workflow to perform the transcode
        and save the video using this endpoint; no further REST calls are required. However,
        if you would like to perform transcodes locally, this endpoint enables that. The
        module `tator.transcode` in the tator pip package provides local transcode capability
        using this endpoint.
    """
    schema = MoveVideoSchema()
    permission_classes = [ProjectTransferPermission]
    http_method_names = ['post']

    def _post(self, params):
        # Get the project
        media = Media.objects.get(pk=params['id'])
        project = media.project.pk

        # Get the token
        token, _ = Token.objects.get_or_create(user=self.request.user)

        # Determine the move paths and update media_files with new paths.
        media_files = params['media_files']
        move_list = []
        if 'archival' in media_files:
            for video_def in media_files['archival']:
                upload_base = os.path.basename(video_def['url'])
                path = f"{project}/{str(uuid1())}.mp4"
                move_list.append({
                    'src': os.path.join(settings.UPLOAD_ROOT, upload_base),
                    'dst': os.path.join(settings.RAW_ROOT, path),
                })
                video_def['path'] = '/data/raw/' + path
                del video_def['url']
        if 'streaming' in media_files:
            for video_def in media_files['streaming']:
                upload_base = os.path.basename(video_def['url'])
                segment_upload_base = os.path.basename(video_def['segments_url'])
                uuid = str(uuid1())
                path = f"{project}/{uuid}.mp4"
                segment_info = f"{project}/{uuid}_segments.json"
                move_list += [{
                    'src': os.path.join(settings.UPLOAD_ROOT, upload_base),
                    'dst': os.path.join(settings.MEDIA_ROOT, path),
                }, {
                    'src': os.path.join(settings.UPLOAD_ROOT, segment_upload_base),
                    'dst': os.path.join(settings.MEDIA_ROOT, segment_info),
                }]
                video_def['path'] = '/media/' + path
                video_def['segment_info'] = '/media/' + segment_info
                del video_def['url']
                del video_def['segments_url']
        if 'audio' in media_files:
            for audio_def in media_files['audio']:
                upload_base = os.path.basename(audio_def['url'])
                path = f"{project}/{str(uuid1())}.mp4"
                move_list.append({
                    'src': os.path.join(settings.UPLOAD_ROOT, upload_base),
                    'dst': os.path.join(settings.MEDIA_ROOT, path),
                })
                audio_def['path'] = '/media/' + path
                del audio_def['url']

        # Create the move workflow
        gid = params.get('gid', None)
        uid = params.get('uid', None)
        response = TatorMove().move_video(project, params['id'], str(token), move_list,
                                          media_files, str(gid), uid)

        response_data = {'message': f"Moving video for media {params['id']} in workflow "
                                    f"{response['metadata']['name']}!",
                         'id': params['id']}
        return response_data

    def get_queryset(self):
        """ TODO: add documentation for this """
        return Media.objects.all()
