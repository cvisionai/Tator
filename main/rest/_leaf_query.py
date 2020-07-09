""" TODO: add documentation for this """
from collections import defaultdict
import logging

from ..search import TatorSearch

from ._attributes import KV_SEPARATOR

logger = logging.getLogger(__name__)

def get_leaf_queryset(query_params):
    """ TODO: add documentation for this """

    # Get parameters.
    project = query_params['project']
    filter_type = query_params.get('type', None)
    start = query_params.get('start', None)
    stop = query_params.get('stop', None)
    after = query_params.get('after', None)

    # Set up initial query.
    query = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict))))
    query['sort']['_postgres_id'] = 'asc'
    bools = [{'match': {'_dtype': 'leaf'}}]

    if filter_type is not None:
        bools.append({'match': {'_meta': {'query': int(filter_type)}}})

    if start is not None:
        query['from'] = int(start)
        if start > 10000:
            raise ValueError("Parameter 'start' must be less than 10000! Try using 'after'.")

    if start is None and stop is not None:
        query['size'] = int(stop)
        if stop > 10000:
            raise ValueError("Parameter 'stop' must be less than 10000! Try using 'after'.")

    if start is not None and stop is not None:
        query['size'] = int(stop) - int(start)
        if start + stop > 10000:
            raise ValueError("Parameter 'start' plus 'stop' must be less than 10000! Try using "
                             "'after'.")

    if after is not None:
        bools.append({'range': {'_postgres_id': {'gt': after}}})

    # Get attribute filter parameters.
    attr_filter_params = {
        'attribute_eq': query_params.get('attribute', None),
        'attribute_lt': query_params.get('attribute_lt', None),
        'attribute_lte': query_params.get('attribute_lte', None),
        'attribute_gt': query_params.get('attribute_gt', None),
        'attribute_gte': query_params.get('attribute_gte', None),
        'attribute_contains': query_params.get('attribute_contains', None),
        'attribute_distance': query_params.get('attribute_distance', None),
        'attribute_null': query_params.get('attribute_null', None),
    }
    attr_query = {
        'must_not': [],
        'filter': [],
    }
    for o_p in attr_filter_params:
        if attr_filter_params[o_p] is not None:
            for kv_pair in attr_filter_params[o_p].split(','):
                if o_p == 'attribute_distance':
                    key, dist_km, lat, lon = kv_pair.split(KV_SEPARATOR)
                    attr_query['filter'].append({
                        'geo_distance': {
                            'distance': f'{dist_km}km',
                            key: {'lat': float(lat), 'lon': float(lon)},
                        }
                    })
                else:
                    key, val = kv_pair.split(KV_SEPARATOR)
                    if o_p == 'attribute_eq':
                        attr_query['filter'].append({'match': {key: val}})
                    elif o_p == 'attribute_lt':
                        attr_query['filter'].append({'range': {key: {'lt': val}}})
                    elif o_p == 'attribute_lte':
                        attr_query['filter'].append({'range': {key: {'lte': val}}})
                    elif o_p == 'attribute_gt':
                        attr_query['filter'].append({'range': {key: {'gt': val}}})
                    elif o_p == 'attribute_gte':
                        attr_query['filter'].append({'range': {key: {'gte': val}}})
                    elif o_p == 'attribute_contains':
                        attr_query['filter'].append({'wildcard': {key: {'value': f'*{val}*'}}})
                    elif o_p == 'attribute_null':
                        check = {'exists': {'field': key}}
                        if val.lower() == 'false':
                            attr_query['filter'].append(check)
                        elif val.lower() == 'true':
                            attr_query['must_not'].append(check)
                        else:
                            raise Exception("Invalid value for attribute_null operation, must"
                                            " be <field>::<value> where <value> is true or false.")
    attr_query['filter'] += bools

    for key in ['must_not', 'filter']:
        if len(attr_query[key]) > 0:
            query['query']['bool'][key] = attr_query[key]

    search = query_params.get('search', None)
    if search is not None:
        search_query = {'query_string': {'query': search}}
        query['query']['bool']['filter'].append(search_query)

    leaf_ids, leaf_count = TatorSearch().search(project, query)
    return leaf_ids, leaf_count, query
