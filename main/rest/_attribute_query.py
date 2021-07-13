""" TODO: add documentation for this """
from collections import defaultdict
import copy
import logging

from dateutil.parser import parse as dateutil_parse

from ..models import LocalizationType
from ..models import StateType
from ..search import TatorSearch

from ._attributes import KV_SEPARATOR

logger = logging.getLogger(__name__)

def get_attribute_es_query(query_params, query, bools, project,
                           is_media=True, annotation_bools=None, modified=None):
    """ TODO: add documentation for this """
    if annotation_bools is None:
        annotation_bools = []

    # Construct query for media and annotations
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
    child_attrs = []
    for state_type in StateType.objects.filter(project=project).iterator():
        child_attrs += state_type.attribute_types
    for localization_type in LocalizationType.objects.filter(project=project).iterator():
        child_attrs += localization_type.attribute_types
    child_attrs = [attr['name'] for attr in child_attrs]
    attr_query = {
        'media': {
            'must_not': [],
            'filter': [],
        },
        'annotation': {
            'must_not': [],
            'filter': [],
        },
    }
    for o_p in attr_filter_params: #pylint: disable=too-many-nested-blocks
        if attr_filter_params[o_p] is not None:
            for kv_pair in attr_filter_params[o_p]:
                if o_p == 'attribute_distance':
                    key, dist_km, lat, lon = kv_pair.split(KV_SEPARATOR)
                    relation = 'annotation' if key in child_attrs else 'media'
                    attr_query[relation]['filter'].append({
                        'geo_distance': {
                            'distance': f'{dist_km}km',
                            key: {'lat': float(lat), 'lon': float(lon)},
                        }
                    })
                else:
                    key, val = kv_pair.split(KV_SEPARATOR)
                    relation = 'annotation' if key in child_attrs else 'media'
                    if o_p == 'attribute_eq':
                        attr_query[relation]['filter'].append({'match': {key: val}})
                    elif o_p == 'attribute_lt':
                        attr_query[relation]['filter'].append({'range': {key: {'lt': val}}})
                    elif o_p == 'attribute_lte':
                        attr_query[relation]['filter'].append({'range': {key: {'lte': val}}})
                    elif o_p == 'attribute_gt':
                        attr_query[relation]['filter'].append({'range': {key: {'gt': val}}})
                    elif o_p == 'attribute_gte':
                        attr_query[relation]['filter'].append({'range': {key: {'gte': val}}})
                    elif o_p == 'attribute_contains':
                        attr_query[relation]['filter'].append({'wildcard': {key: {'value': f'*{val}*'}}}) #pylint: disable=line-too-long
                    elif o_p == 'attribute_null':
                        check = {'exists': {'field': key}}
                        if val.lower() == 'false':
                            attr_query[relation]['filter'].append(check)
                        elif val.lower() == 'true':
                            attr_query[relation]['must_not'].append(check)
                        else:
                            raise Exception("Invalid value for attribute_null operation, must be <field>::<value> where <value> is true or false.") #pylint: disable=line-too-long

    attr_query['media']['filter'] += bools
    attr_query['annotation']['filter'] += annotation_bools

    if is_media:
        # Construct query for media
        has_child = False
        child_query = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))) #pylint: disable=line-too-long

        for key in ['must_not', 'filter']:
            if len(attr_query['annotation'][key]) > 0:
                has_child = True
                child_query['query']['bool'][key] = copy.deepcopy(attr_query['annotation'][key])

        if has_child:
            child_query['type'] = 'annotation'
            attr_query['media']['filter'].append({'has_child': child_query})

        for key in ['must_not', 'filter']:
            if len(attr_query['media'][key]) > 0:
                query['query']['bool'][key] = attr_query['media'][key]

        search = query_params.get('search')
        if search is not None:
            search_query = {'query_string': {'query': search}}
            query['query']['bool']['filter'].append(search_query)

        annotation_search = query_params.get('annotation_search')
        if annotation_search is not None:
            annotation_search_query = {'has_child': {'type': 'annotation',
                                                     'query': {'query_string': {'query': annotation_search}}}}
            query['query']['bool']['filter'].append(annotation_search_query)

    else:
        # Construct query for annotations
        has_parent = False
        parent_query = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))) #pylint: disable=line-too-long

        for key in ['must_not', 'filter']:
            if len(attr_query['media'][key]) > 0:
                has_parent = True
                parent_query['query']['bool'][key] = copy.deepcopy(attr_query['media'][key])

        if has_parent:
            parent_query['parent_type'] = 'media'
            attr_query['annotation']['filter'].append({'has_parent': parent_query})
            parent_type_check = [{'bool': {
                'should': [
                    {'match': {'_dtype': 'image'}},
                    {'match': {'_dtype': 'video'}},
                    {'match': {'_dtype': 'multi'}},
                ],
                'minimum_should_match': 1,
            }}]
            if 'filter' in parent_query['query']['bool']:
                parent_query['query']['bool']['filter'] += parent_type_check
            else:
                parent_query['query']['bool']['filter'] = [parent_type_check]

        for key in ['must_not', 'filter']:
            if len(attr_query['annotation'][key]) > 0:
                query['query']['bool'][key] = attr_query['annotation'][key]

        search = query_params.get('search', None)
        if search is not None:
            search_query = {'query_string': {'query': search}}
            query['query']['bool']['filter'].append(search_query)

        media_search = query_params.get('media_search')
        if media_search is not None:
            media_search_query = {'has_parent': {'parent_type': 'media',
                                                 'query': {'query_string': {'query': media_search}}}}
            query['query']['bool']['filter'].append(media_search_query)

        if modified is not None:
            # Get modified + null or not modified + null
            modified_query = {'bool': {
                'should': [
                    {'bool': {'must_not': [{
                        'exists': {'field': '_modified'},
                    }]}},
                    {'match': {'_modified': bool(int(modified))}},
                ],
                'minimum_should_match': 1,
            }}
            query['query']['bool']['filter'].append(modified_query)
        

    return query

ALLOWED_TYPES = {
    'attribute': ('boolean', 'long', 'double', 'date', 'keyword', 'text'),
    'attribute_lt': ('long', 'double', 'date'),
    'attribute_lte': ('long', 'double', 'date'),
    'attribute_gt': ('long', 'double', 'date'),
    'attribute_gte': ('long', 'double', 'date'),
    'attribute_contains': ('keyword', 'text'),
    'attribute_distance': ('geo_point',)
}

OPERATOR_SUFFIXES = {
    'attribute': '',
    'attribute_lt': '__lt',
    'attribute_lte': '__lte',
    'attribute_gt': '__gt',
    'attribute_gte': '__gte',
    'attribute_contains': '__icontains',
    'attribute_distance': '__distance__lte',
}

def _convert_boolean(value):
    if value.lower() == 'false':
        value = False
    elif value.lower() == 'true':
        value = True
    else:
        value = bool(value)
    return value

def _convert_attribute_filter_value(pair, mappings, operation):
    kv = pair.split(KV_SEPARATOR, 1)
    key, value = kv
    if key not in mappings:
        raise ValueError(f"Attribute '{key}' could not be found in project!")
    if 'path' in mappings[key]:
        dtype = mappings[key]['path'].split('_', 1)[1]
    else:
        dtype = mappings[key]['type']
    if dtype not in ALLOWED_TYPES[operation]:
        raise ValueError(f"Filter operation '{operation}' not allowed for dtype '{dtype}'!")
    if dtype == 'boolean':
        value = _convert_boolean(value)
    if dtype == 'double':
        value = float(value)
    elif dtype == 'long':
        value = int(value)
    elif dtype == 'date':
        value = dateutil_parse(value)
    return key, value, dtype

def get_attribute_filter_ops(project, params):
    filter_ops = []
    use_es = False
    if any([(filt in params) for filt in ALLOWED_TYPES.keys()]):
        search = TatorSearch()
        index_name = search.index_name(project)
        mappings = TatorSearch().es.indices.get_mapping(index=index_name)
        mappings = mappings[index_name]['mappings']['properties']

        for op in ALLOWED_TYPES.keys():
            if op in params:
                for kv in params[op]:
                    key, value, dtype = _convert_attribute_filter_value(kv, mappings, op)
                    # Don't deal with type conversions required for date and geo_point filtering
                    # in PSQL
                    if (dtype in ['date', 'geo_point']) or (op == 'attribute_distance'):
                        use_es = True
                    filter_ops.append((key, value, op))
    force_es = params.get('force_es')
    if force_es:
        use_es = True
    return use_es, filter_ops

def get_attribute_psql_queryset(qs, params, filter_ops):
    attribute_null = params.get('attribute_null')

    for key, value, op in filter_ops:
        qs = qs.filter(**{f"attributes__{key}{OPERATOR_SUFFIXES[op]}": value})

    if attribute_null is not None:
        for kv in attribute_null:
            key, value = kv.split(KV_SEPARATOR)
            value = _convert_boolean(value)
            qs = qs.filter(**{f"attributes__{key}__isnull": value})
    return qs

