""" TODO: add documentation for this """
import tempfile
import hashlib

from ..models import TemporaryFile
from ..models import Media
from ..serializers import TemporaryFileSerializer
from ..schema import GetClipSchema

from ._base_views import BaseDetailView
from ._media_util import MediaUtil
from ._permissions import ProjectViewOnlyPermission

class GetClipAPI(BaseDetailView):
    """ TODO: add documentation for this """
    schema = GetClipSchema()
    permission_classes = [ProjectViewOnlyPermission]
    http_method_names = ['get']

    def get_serializer(self):
        """ This allows the AutoSchema to fill in the response details nicely"""
        return TemporaryFileSerializer()

    def get_queryset(self):
        """ TODO: add documentation for this """
        return Media.objects.all()

    def _get(self, params):
        """ Facility to get a clip from the server.
            Returns a temporary file object that expires in 24 hours.
        """
        # upon success we can return an image
        video = Media.objects.get(pk=params['id'])
        project = video.project
        frame_ranges_str = params.get('frameRanges', None)
        frame_ranges_tuple = [frameRange.split(':') for frameRange in frame_ranges_str]
        frame_ranges = []
        for t in frame_ranges_tuple: #pylint: disable=invalid-name
            frame_ranges.append((int(t[0]), int(t[1])))

        quality = params.get('quality', None)
        h = hashlib.new('md5', f"{params}".encode()) #pylint: disable=invalid-name
        lookup = h.hexdigest()

        # Check to see if we already made this clip
        matches = TemporaryFile.objects.filter(project=project, lookup=lookup)
        if matches.exists():
            temp_file = matches[0]
        else:
            with tempfile.TemporaryDirectory() as temp_dir:
                media_util = MediaUtil(video, temp_dir, quality)
                f_p = media_util.getClip(frame_ranges)

                temp_file = TemporaryFile.from_local(f_p, "clip.mp4",
                                                     project, self.request.user,
                                                     lookup=lookup, hours=24)

        response_data = TemporaryFileSerializer(temp_file, context={"view": self}).data
        return response_data
