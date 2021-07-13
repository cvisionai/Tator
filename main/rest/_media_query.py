""" TODO: add documentation for this """
from collections import defaultdict
import logging
from urllib import parse as urllib_parse

from ..search import TatorSearch
from ..models import Section
from ..models import Media
from ..models import State

from ._attribute_query import get_attribute_es_query
from ._attribute_query import get_attribute_filter_ops
from ._attribute_query import get_attribute_psql_queryset
from ._attributes import KV_SEPARATOR

logger = logging.getLogger(__name__)


def _get_archived_filter(params):
    archive_lifecycle = params.get("archive_lifecycle", "live")
    if archive_lifecycle == "archived":
        return ["to_archive", "archived", "to_live"]
    if archive_lifecycle == "all":
        return None
    if archive_lifecycle == "live":
        return ["live"]

    raise ValueError(
        f"Received invalid value '{archive_lifecycle}' for 'archive_lifecycle'. Valid values are "
        f"['archived', 'live', 'all']."
    )


def get_media_es_query(project, params):
    """ Constructs an elasticsearch query.
    """
    # Get query parameters.
    media_id = params.get('media_id')
    media_id_put = params.get('ids') # PUT request only
    localization_ids = params.get('localization_ids') # PUT request only
    state_ids = params.get('state_ids') # PUT request only
    filter_type = params.get('type')
    name = params.get('name')
    section = params.get('section')
    dtype = params.get('dtype')
    md5 = params.get('md5')
    gid = params.get('gid')
    uid = params.get('uid')
    start = params.get('start')
    stop = params.get('stop')
    after = params.get('after')
    archive_state = _get_archived_filter(params)

    query = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(dict))))
    query['sort']['_exact_name'] = 'asc'
    bools = [{'bool': {
        'should': [
            {'match': {'_dtype': 'image'}},
            {'match': {'_dtype': 'video'}},
            {'match': {'_dtype': 'multi'}},
        ],
        'minimum_should_match': 1,
    }}]
    annotation_bools = []

    media_ids = []
    if media_id_put is not None:
        media_ids += [f'image_{id_}' for id_ in media_id_put]\
                   + [f'video_{id_}' for id_ in media_id_put]\
                   + [f'multi_{id_}' for id_ in media_id_put]

    if media_id is not None:
        media_ids += [f'image_{id_}' for id_ in media_id]\
                   + [f'video_{id_}' for id_ in media_id]\
                   + [f'multi_{id_}' for id_ in media_id]
    if media_ids:
        bools.append({'ids': {'values': media_ids}})

    annotation_ids = []
    if localization_ids is not None:
        annotation_ids += [f'box_{id_}' for id_ in localization_ids]\
                        + [f'line_{id_}' for id_ in localization_ids]\
                        + [f'dot_{id_}' for id_ in localization_ids]
    if state_ids is not None:
        annotation_ids += [f'state_{id_}' for id_ in state_ids]
    if annotation_ids:
        annotation_bools.append({'ids': {'values': annotation_ids}})

    if filter_type is not None:
        bools.append({'match': {'_meta': {'query': int(filter_type)}}})

    if name is not None:
        bools.append({'match': {'_exact_name': {'query': name}}})

    if section is not None:
        section_object = Section.objects.get(pk=section)
        if section_object.lucene_search:
            bools.append({'bool': {
                'should': [
                    {'query_string': {'query': section_object.lucene_search}},
                    {'has_child': {
                        'type': 'annotation',
                        'query': {'query_string': {'query': section_object.lucene_search}},
                        },
                    },
                ],
                'minimum_should_match': 1,
            }})
        if section_object.media_bools:
            bools.append(section_object.media_bools)
        if section_object.annotation_bools:
            annotation_bools.append(section_object.annotation_bools)
        if section_object.tator_user_sections:
            bools.append({'match': {'tator_user_sections': {
                'query': section_object.tator_user_sections,
            }}})

    if dtype is not None:
        bools.append({'match': {'_dtype': {'query': dtype}}})

    if md5 is not None:
        bools.append({'match': {'_md5': {'query': md5}}})

    if gid is not None:
        bools.append({'match': {'_gid': {'query': gid}}})

    if uid is not None:
        bools.append({'match': {'_uid': {'query': uid}}})

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
        if stop > 10000:
            raise ValueError("Parameter 'stop' must be less than 10000! Try using "
                             "'after'.")

    if after is not None:
        bools.append({'range': {'_exact_name': {'gt': after}}})

    if archive_state is not None:
        bools.append(
            {
                "bool": {
                    "should": [{"match": {"_archive_state": state}} for state in archive_state],
                    "minimum_should_match": 1,
                }
            }
        )

    query = get_attribute_es_query(params, query, bools, project, is_media=True,
                                   annotation_bools=annotation_bools)
    return query

def _get_media_psql_queryset(project, section_uuid, filter_ops, params):
    """ Constructs a psql queryset.
    """
    # Get query parameters.
    media_id = params.get('media_id')
    media_id_put = params.get('ids') # PUT request only
    localization_ids = params.get('localization_ids') # PUT request only
    state_ids = params.get('state_ids') # PUT request only
    filter_type = params.get('type')
    name = params.get('name')
    dtype = params.get('dtype')
    md5 = params.get('md5')
    gid = params.get('gid')
    uid = params.get('uid')
    after = params.get('after')
    start = params.get('start')
    stop = params.get('stop')
    archive_states = _get_archived_filter(params)

    qs = Media.objects.filter(project=project, deleted=False)
    media_ids = []
    if media_id_put is not None:
        media_ids += media_id_put
    if media_id is not None:
        media_ids += media_id
    if state_ids is not None:
        media_ids += list(State.media.through.objects\
                          .filter(state__in=state_ids)\
                          .values_list('media_id', flat=True).distinct())
    if media_ids:
        qs = qs.filter(pk__in=media_ids)

    if localization_ids is not None:
        qs = qs.filter(localization__in=localization_ids).distinct()

    if filter_type is not None:
        qs = qs.filter(meta=filter_type)

    if name is not None:
        qs = qs.filter(name__iexact=name)

    if section_uuid is not None:
        qs = qs.filter(attributes__tator_user_sections=section_uuid)

    if dtype is not None:
        qs = qs.filter(meta__dtype=dtype)

    if md5 is not None:
        qs = qs.filter(md5=md5)

    if gid is not None:
        qs = qs.filter(gid=gid)

    if uid is not None:
        qs = qs.filter(uid=uid)

    if after is not None:
        qs = qs.filter(name__gt=after)

    if archive_states is not None:
        qs = qs.filter(archive_state__in=archive_states)

    qs = get_attribute_psql_queryset(qs, params, filter_ops)

    qs = qs.order_by('name')
    if start is not None and stop is not None:
        qs = qs[start:stop]
    elif start is not None:
        qs = qs[start:]
    elif stop is not None:
        qs = qs[:stop]

    return qs

def _use_es(project, params):
    ES_ONLY_PARAMS = ['search', 'annotation_search']
    use_es = False
    for es_param in ES_ONLY_PARAMS:
        if es_param in params:
            use_es = True
            break
    section_uuid = None
    if 'section' in params:
        section = Section.objects.get(pk=params['section'])
        if not((section.lucene_search is None)
               and (section.media_bools is None)
               and (section.annotation_bools is None)):
            use_es = True
        section_uuid = section.tator_user_sections

    # Look up attribute dtypes if necessary.
    use_es_for_attributes, filter_ops = get_attribute_filter_ops(project, params)
    use_es = use_es or use_es_for_attributes

    return use_es, section_uuid, filter_ops

def get_media_queryset(project, params):
    # Determine whether to use ES or not.
    use_es, section_uuid, filter_ops = _use_es(project, params)

    if use_es:
        # If using ES, do the search and construct the queryset.
        query = get_media_es_query(project, params)
        media_ids, _  = TatorSearch().search(project, query)
        qs = Media.objects.filter(pk__in=media_ids).order_by('name')
    else:
        # If using PSQL, construct the queryset.
        qs = _get_media_psql_queryset(project, section_uuid, filter_ops, params)
    return qs

def get_media_count(project, params):
    # Determine whether to use ES or not.
    use_es, section_uuid, filter_ops = _use_es(project, params)

    if use_es:
        # If using ES, do the search and get the count.
        query = get_media_es_query(project, params)
        media_ids, _  = TatorSearch().search(project, query)
        count = len(media_ids)
    else:
        # If using PSQL, construct the queryset.
        qs = _get_media_psql_queryset(project, section_uuid, filter_ops, params)
        count = qs.count()
    return count

def query_string_to_media_ids(project_id, url):
    """ TODO: add documentation for this """
    params = dict(urllib_parse.parse_qsl(urllib_parse.urlsplit(url).query))
    media_ids = get_media_queryset(project_id, params).values_list('id', flat=True)
    return media_ids
