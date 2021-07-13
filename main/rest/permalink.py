import logging
import datetime
import os
import shutil
import mimetypes
import datetime
import tempfile
from uuid import uuid1
from urllib.parse import urlparse

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Case, When
from django.http import Http404
from PIL import Image

from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from ..models import (
    Media,
    Resource
)

from ..schema import PermalinkSchema, parse
from ..schema.components import media as media_schema
from ..download import download_file
from ..store import get_tator_store, get_storage_lookup

from ._base_views import process_exception
from ._permissions import ProjectTransferPermission

import sys

logger = logging.getLogger(__name__)

MEDIA_PROPERTIES = list(media_schema['properties'].keys())

def _presign(expiration, medias, fields=None):
    """ Replaces specified media fields with presigned urls.
    """
    # First get resources referenced by the given media.
    fields = fields or ["archival", "streaming", "audio", "image", "thumbnail", "thumbnail_gif", "attachment"]
    media_ids = [media['id'] for media in medias]
    resources = Resource.objects.filter(media__in=media_ids)
    storage_lookup = get_storage_lookup(resources)

    # Get replace all keys with presigned urls.
    for _, media in enumerate(medias):
        if media.get("media_files") is None:
            continue

        for field in fields:
            if field not in media["media_files"]:
                continue

            for _, media_def in enumerate(media["media_files"][field]):
                tator_store = storage_lookup[media_def["path"]]
                media_def["path"] = tator_store.get_download_url(media_def["path"], expiration)
                if field == "streaming":
                    if "segment_info" in media_def:
                        media_def["segment_info"] = tator_store.get_download_url(
                            media_def["segment_info"], expiration
                        )
                    else:
                        logger.warning(
                            f"No segment file in media {media['id']} for file {media_def['path']}!"
                        )

class PermalinkAPI(APIView):
    """ Provide a permalink to an object-store resource

        Given a media object this endpoint will redirect to a pre-signed URL of the required
        sub-element.
    """
    schema = PermalinkSchema()
    permission_classes = [ProjectTransferPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def get(self, request, format=None, **kwargs):
        """ TODO: add documentation for this """
        params = parse(request)
        url = self._getURL(params)
        if url:
            resp = Response("", status=301, headers={"Location": url})
        else:
            resp = Response({"Message": "Bad Request"}, status=404)
        return resp

    def _getURL(self, params):
        """ Retrieve individual media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.
        """
        qs = Media.objects.filter(pk=params['id'], deleted=False)
        if not qs.exists():
            raise Http404
        response_data = list(qs.values(*MEDIA_PROPERTIES))
        # Use 24-hour URLS
        _presign(24*3600, response_data)

        element = params['element']
        if element == 'auto':
            if qs[0].meta.dtype == 'video':
                element = 'streaming'
            elif qs[0].meta.dtype == 'image':
                element = 'image'
            elif qs[0].meta.dtype == 'multi':
                return None
        if element == 'audio':
            return response_data[0].get('media_files',{}).get('audio',[])[0]['path']
        elif element == 'thumbnail':
            search_in = response_data[0].get('media_files',{}).get('thumbnail',[])
        elif element == 'thumbnail_gif':
            search_in = response_data[0].get('media_files',{}).get('thumbnail_gif',[])
        elif element == 'image':
            search_in = response_data[0].get('media_files',{}).get('image',[])
        elif element == 'streaming':
            search_in = response_data[0].get('media_files',{}).get('streaming',[])
        elif element == 'archival':
            search_in = response_data[0].get('media_files',{}).get('archival',[])
        elif element == 'attachment':
            search_in = response_data[0].get('media_files',{}).get('attachment',[])

        if not search_in:
            return None
        quality = params['quality']
        max_delta = sys.maxsize
        quality_idx = 0
        for idx, info in enumerate(search_in):
            delta = abs(quality-info['resolution'][0])
            if delta < max_delta:
                quality_idx = idx
                max_delta = delta
        return search_in[quality_idx]['path']

    def handle_exception(self, exc):
        return process_exception(exc)

    def get_queryset(self):
        return Media.objects.all()
