from collections import defaultdict

from urllib import parse as urllib_parse

from ..search import TatorSearch

from ._attribute_query import get_attribute_query
from ._attributes import AttributeFilterMixin


def get_media_queryset(project, query_params, dry_run=False):
    """Converts raw media query string into a list of IDs and a count.
    """
    mediaId = query_params.get('media_id', None)
    filterType = query_params.get('type', None)
    name = query_params.get('name', None)
    section = query_params.get('section', None)
    md5 = query_params.get('md5', None)
    start = query_params.get('start', None)
    stop = query_params.get('stop', None)
    after = query_params.get('after', None)

    query = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict))))
    query['sort']['_exact_name'] = 'asc'
    bools = [{'bool': {
        'should': [
            {'match': {'_dtype': 'image'}},
            {'match': {'_dtype': 'video'}},
        ],
        'minimum_should_match': 1,
    }}]

    if mediaId != None:
        ids = [f'image_{id_}' for id_ in mediaId] + [f'video_{id_}' for id_ in mediaId]
        bools.append({'ids': {'values': ids}})

    if filterType != None:
        bools.append({'match': {'_meta': {'query': int(filterType)}}})

    if name != None:
        bools.append({'match': {'_exact_name': {'query': name}}})

    if md5 != None:
        bools.append({'match': {'_md5': {'query': md5}}})

    if section is not None:
        bools.append({'match': {'tator_user_sections': {'query': section}}})

    if start != None:
        query['from'] = int(start)
        if start > 10000:
            raise ValueError("Parameter 'start' must be less than 10000! Try using 'after'.")

    if start == None and stop != None:
        query['size'] = int(stop)
        if stop > 10000:
            raise ValueError("Parameter 'stop' must be less than 10000! Try using 'after'.")

    if start != None and stop != None:
        query['size'] = int(stop) - int(start)
        if start + stop > 10000:
            raise ValueError("Parameter 'start' plus 'stop' must be less than 10000! Try using "
                             "'after'.")

    if after != None:
        bools.append({'range': {'_exact_name': {'gt': after}}})

    query = get_attribute_query(query_params, query, bools, project)

    if dry_run:
        return [], [], query

    media_ids, media_count = TatorSearch().search(project, query)

    return media_ids, media_count, query

def query_string_to_media_ids(project_id, url):
    query_params = dict(urllib_parse.parse_qsl(urllib_parse.urlsplit(url).query))
    attribute_filter = AttributeFilterMixin()
    attribute_filter.validate_attribute_filter(query_params)
    media_ids, _, _ = get_media_queryset(project_id, query_params)
    return media_ids

def search_by_dtype(dtype, query, response_data, project):
    dtype_filter = [{'match': {'_dtype': {'query': dtype}}}]
    query = copy.deepcopy(query)
    if query['query']['bool']['filter']:
        query['query']['bool']['filter'] += dtype_filter
    else:
        query['query']['bool']['filter'] = dtype_filter
    num_elements = TatorSearch().search_raw(project, query)
    num_elements = num_elements['aggregations']['section_counts']['buckets']
    for data in num_elements:
        response_data[data['key']][f'num_{dtype}s'] = data['doc_count']
        response_data[data['key']][f'download_size_{dtype}s'] = data['download_size']['value']
        response_data[data['key']][f'total_size_{dtype}s'] = data['total_size']['value']
    return response_data

def get_section_info(query, project):
    query['aggs']['section_counts']['terms']['field'] = 'tator_user_sections'
    query['aggs']['section_counts']['terms']['size'] = 1000 # Return up to 1000 sections
    query['aggs']['section_counts']['aggs']['download_size'] = {'sum': {'field': '_download_size'}}
    query['aggs']['section_counts']['aggs']['total_size'] = {'sum': {'field': '_total_size'}}
    query['size'] = 0

    # Do queries.
    response_data = defaultdict(dict)
    response_data = search_by_dtype('image', query, response_data, project)
    response_data = search_by_dtype('video', query, response_data, project)

    # Fill in zeros.
    for section in response_data:
        for key in ['num_videos', 'download_size_videos', 'total_size_videos',
                    'num_images', 'download_size_images', 'total_size_images']:
            if key not in response_data[section]:
                response_data[section][key] = 0

