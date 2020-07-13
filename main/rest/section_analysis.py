""" TODO: add documentation for this """
import copy
import logging
from collections import defaultdict

from ..models import Analysis
from ..search import TatorSearch
from ..schema import SectionAnalysisSchema

from ._base_views import BaseDetailView
from ._media_query import get_attribute_query
from ._permissions import ProjectViewOnlyPermission

logger = logging.getLogger(__name__)

class SectionAnalysisAPI(BaseDetailView):
    """ Retrieve analysis results for a media list.

        This endpoint uses objects created with the `Analysis` endpoint to perform analysis
        on filtered media lists.
    """
    schema = SectionAnalysisSchema()
    permission_classes = [ProjectViewOnlyPermission]
    http_method_names = ['get']

    def _get(self, params):
        media_id = params.get('media_id', None)
        analyses = list(Analysis.objects.filter(project=self.kwargs['project']))
        response_data = {}
        for analysis in analyses:
            media_query = defaultdict(lambda:
                                      defaultdict(lambda: defaultdict(lambda: defaultdict(dict))))
            media_query['query']['bool']['filter'] = []
            media_query = get_attribute_query(params, media_query, [], self.kwargs['project'])
            query_str = f'{analysis.data_query}'
            if media_id is not None:
                if not media_query['query']['bool']['filter']:
                    media_query['query']['bool']['filter'] = []
                media_query['query']['bool']['filter'].append(
                    {'ids': {'values': [f'video_{id_}' for id_ in media_id] +
                                       [f'image_{id_}' for id_ in media_id]}}
                )

            # Do the search on all media.
            query = copy.deepcopy(media_query)
            if not query['query']['bool']['filter']:
                query['query']['bool']['filter'] = []
            query['query']['bool']['filter'].append(
                {'query_string': {'query': query_str}},
            )
            media_count = TatorSearch().count(self.kwargs['project'], query)

            # Do the search on all annotations.
            query = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict))))
            query['query']['bool']['filter'] = []
            if media_query:
                query['query']['bool']['filter'].append({
                    'has_parent': {
                        'parent_type': 'media',
                        **media_query,
                    }
                })
            query['query']['bool']['filter'].append({
                'query_string': {'query': query_str}
            })
            annotation_count = TatorSearch().count(self.kwargs['project'], query)

            # Use whichever is higher (media or annotation)
            response_data[analysis.name] = max(annotation_count, media_count)
        return response_data
