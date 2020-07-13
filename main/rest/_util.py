""" TODO: add documentation for this """
import datetime
import logging

from django.utils.http import urlencode
from django.db.models.expressions import Subquery
from rest_framework.reverse import reverse
from rest_framework.exceptions import APIException

from ..models import type_to_obj

from ._attributes import convert_attribute

logger = logging.getLogger(__name__)

class Array(Subquery): #pylint: disable=abstract-method
    """ Class to expose ARRAY SQL function to ORM """
    template = 'ARRAY(%(subquery)s)'

def reverse_query_args(viewname, kwargs=None, queryargs=None):
    """
    Regular reverse doesn't handle query args
    """
    url = reverse(viewname, kwargs=kwargs)
    if queryargs:
        url = '{}?{}'.format(url, urlencode(queryargs))
    return url

class BadQuery(APIException):
    """ TODO: add documentation for this """
    status_code = 403
    default_detail = "A bad query argument was supplied to the service."
    default_code = "bad_query"

def compute_required_fields(type_obj):
    """Given an entity type object, compute the required fields to construct a new entity object,
       returns a tuple where the first are the required 1st order fields,
       and the 2nd are attributes. """
    new_obj_type = type_to_obj(type(type_obj))

    datafields = {}
    for field in new_obj_type._meta.get_fields(include_parents=False):
        if not field.is_relation and not field.blank:
            datafields[field.name] = field.description

    attributes = {}
    for column in type_obj.attribute_types:
        attributes[column['name']] = column.get('description', None)

    return (datafields, attributes, type_obj.attribute_types)

def check_required_fields(datafields, attr_types, body):
    """ Given the output of computeRequiredFields and a request body, assert that required
        fields exist and that attributes are present. Fill in default values if they exist.
        Returns a dictionary containing attribute values.
    """
    # Check for required fields.
    for field in datafields:
        if field not in body:
            raise Exception(f'Missing required field in request body "{field}".')

    # Check for required attributes. Fill in defaults if available.
    attrs = {}
    for attr_type in attr_types:
        field = attr_type['name']
        if field in body:
            convert_attribute(attr_type, body[field]) # Validates attr value
            attrs[field] = body[field]
        elif attr_type['dtype'] == 'datetime':
            if attr_type['use_current']:
                # Fill in current datetime.
                attrs[field] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            elif attr_type.get('required', True):
                # Missing a datetime.
                raise Exception(f'Missing attribute value for "{field}". Set `use_current` to '
                                f'True or supply a value.')
        else:
            if 'default' in attr_type:
                # Fill in default for missing field.
                attrs[field] = attr_type['default']
            elif attr_type.get('required', True):
                # Missing a field and no default.
                raise Exception(f'Missing attribute value for "{field}". Set a `default` on '
                                f'the attribute type or supply a value.')
    return attrs

def paginate(query_params, queryset):
    """ TODO: add documentation for this """
    start = query_params.get('start', None)
    stop = query_params.get('stop', None)
    q_s = queryset
    if start is None and stop is not None:
        stop = int(stop)
        q_s = queryset[:stop]
    elif start is not None and stop is None:
        start = int(start)
        q_s = queryset[start:]
    elif start is not None and stop is not None:
        start = int(start)
        stop = int(stop)
        q_s = queryset[start:stop]
    return q_s
