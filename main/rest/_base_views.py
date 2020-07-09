""" TODO: add documentation for this """
import traceback
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework import status
from django.core.exceptions import ObjectDoesNotExist
from django.http import response

from ..schema import parse

logger = logging.getLogger(__name__)

""" TODO: add documentation for this """
def process_exception(exc):
    """ TODO: add documentation for this """
    logger.info("Handling Exception!")
    logger.info(type(exc))
    if isinstance(exc, response.Http404):
        resp = Response({'message' : str(exc)},
                        status=status.HTTP_404_NOT_FOUND)
    elif isinstance(exc, ObjectDoesNotExist):
        logger.error(f"Not found in GET request: {str(exc)}")
        resp = Response({'message' : str(exc)},
                        status=status.HTTP_404_NOT_FOUND)
    elif isinstance(exc, PermissionDenied):
        logger.error(f"Permission denied error: {str(exc)}")
        resp = Response({'message': str(exc)},
                        status=status.HTTP_403_FORBIDDEN)
    else:
        logger.error(f"Exception in request: {traceback.format_exc()}")
        resp = Response({'message' : str(exc),
                         'details': traceback.format_exc()},
                        status=status.HTTP_400_BAD_REQUEST)
    return resp
class GetMixin:
    #pylint: disable=redefined-builtin,unused-argument
    """ TODO: add documentation for this """
    def get(self, request, format=None, **kwargs):
        """ TODO: add documentation for this """
        resp = Response({})
        params = parse(request)
        response_data = self._get(params)
        resp = Response(response_data, status=status.HTTP_200_OK)
        return resp

class PostMixin:
    #pylint: disable=redefined-builtin,unused-argument
    """ TODO: add documentation for this """
    def post(self, request, format=None, **kwargs):
        """ TODO: add documentation for this """
        resp = Response({})
        params = parse(request)
        response_data = self._post(params)
        resp = Response(response_data, status=status.HTTP_201_CREATED)
        return resp

class PatchMixin:
    #pylint: disable=redefined-builtin,unused-argument
    """ TODO: add documentation for this """
    def patch(self, request, format=None, **kwargs):
        """ TODO: add documentation for this """
        params = parse(request)
        response_data = self._patch(params)
        resp = Response(response_data, status=status.HTTP_200_OK)
        return resp

class DeleteMixin:
    #pylint: disable=redefined-builtin,unused-argument
    """ TODO: add documentation for this """
    def delete(self, request, format=None, **kwargs):
        """ TODO: add documentation for this """
        params = parse(request)
        response_data = self._delete(params)
        resp = Response(response_data, status=status.HTTP_200_OK)
        return resp

class BaseListView(APIView, GetMixin, PostMixin, PatchMixin, DeleteMixin):
    """ Base class for list views.
    """
    http_method_names = ['get', 'post', 'patch', 'delete']

    def handle_exception(self, exc):
        return process_exception(exc)

class BaseDetailView(APIView, GetMixin, PatchMixin, DeleteMixin):
    """ Base class for detail views.
    """
    http_method_names = ['get', 'patch', 'delete']

    def handle_exception(self, exc):
        return process_exception(exc)
