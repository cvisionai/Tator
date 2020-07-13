""" TODO: add documentation for this """
from collections import defaultdict
import copy

from ..search import TatorSearch
from ..schema import MediaSectionsSchema

from ._base_views import BaseDetailView
from ._media_query import get_media_queryset
from ._permissions import ProjectViewOnlyPermission

def _search_by_dtype(dtype, query, response_data, params):
    dtype_filter = [{'match': {'_dtype': {'query': dtype}}}]
    query = copy.deepcopy(query)
    if query['query']['bool']['filter']:
        query['query']['bool']['filter'] += dtype_filter
    else:
        query['query']['bool']['filter'] = dtype_filter
    num_elements = TatorSearch().search_raw(params['project'], query)
    num_elements = num_elements['aggregations']['section_counts']['buckets']
    for data in num_elements:
        response_data[data['key']][f'num_{dtype}s'] = data['doc_count']
        response_data[data['key']][f'download_size_{dtype}s'] = data['download_size']['value']
        response_data[data['key']][f'total_size_{dtype}s'] = data['total_size']['value']
    return response_data

class MediaSectionsAPI(BaseDetailView):
    """ Retrieve media counts by section.

        This endpoint accepts the same query parameters as a GET request to the `Medias` endpoint,
        but only returns the number of images and videos per sections.
    """
    schema = MediaSectionsSchema()
    permission_classes = [ProjectViewOnlyPermission]
    http_method_names = ['get']

    def _get(self, params):

        # Get query associated with media filters.
        _, _, query = get_media_queryset(params['project'], params, True)

        # Update query with aggregations.
        query['aggs']['section_counts']['terms']['field'] = 'tator_user_sections'
        query['aggs']['section_counts']['terms']['size'] = 1000 # Return up to 1000 sections
        query['aggs']['section_counts']['aggs']['download_size'] = {'sum': {'field': '_download_size'}} #pylint: disable=line-too-long
        query['aggs']['section_counts']['aggs']['total_size'] = {'sum': {'field': '_total_size'}}
        query['size'] = 0

        # Do queries.
        response_data = defaultdict(dict)
        response_data = _search_by_dtype('image', query, response_data, params)
        response_data = _search_by_dtype('video', query, response_data, params)

        # Fill in zeros.
        for section in response_data:
            for key in ['num_videos', 'download_size_videos', 'total_size_videos',
                        'num_images', 'download_size_images', 'total_size_images']:
                if key not in response_data[section]:
                    response_data[section][key] = 0

        return response_data
