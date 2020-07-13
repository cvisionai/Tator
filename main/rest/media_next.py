""" TODO: add documentation for this """

from ..models import Media
from ..search import TatorSearch
from ..schema import MediaNextSchema

from ._base_views import BaseDetailView
from ._media_query import get_media_queryset
from ._permissions import ProjectViewOnlyPermission

class MediaNextAPI(BaseDetailView):
    """ Retrieve ID of next media in a media list.

        This endpoint accepts the same query parameters as a GET request to the `Medias` endpoint,
        but only returns the next media ID from the media passed as a path parameter. This allows
        iteration through a media list without serializing the entire list, which may be large.
    """
    schema = MediaNextSchema()
    permission_classes = [ProjectViewOnlyPermission]
    http_method_names = ['get']

    def _get(self, params):

        # Find this object.
        media_id = params['id']
        media = Media.objects.get(pk=media_id)

        # Get query associated with media filters.
        _, _, query = get_media_queryset(media.project.pk, params, True)

        # Modify the query to only retrieve next media.
        range_filter = [{'range': {'_exact_name': {'gt': media.name}}}]
        if query['query']['bool']['filter']:
            query['query']['bool']['filter'] += range_filter
        else:
            query['query']['bool']['filter'] = range_filter
        query['size'] = 1
        media_ids, count = TatorSearch().search(media.project.pk, query)
        if count > 0:
            response_data = {'next': media_ids[0]}
        else:
            response_data = {'next': -1}

        return response_data

    def get_queryset(self):
        """ TODO: add documentation for this """
        return Media.objects.all()
