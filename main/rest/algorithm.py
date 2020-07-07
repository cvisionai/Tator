""" Algorithm REST endpoints """
# pylint: disable=too-many-ancestors

from ..models import Algorithm
from ..models import database_qs
from ..schema import AlgorithmListSchema
from ..schema import parse

from ._base_views import BaseListView
from ._permissions import ProjectViewOnlyPermission

class AlgorithmListAPI(BaseListView):
    """ Interact with algorithms that have been registered to a project.

        For instructions on how to register an algorithm, visit `GitHub`_.

        .. _GitHub:
           https://github.com/cvisionai/tator/tree/master/examples/algorithms
    """
    # pylint: disable=no-member,no-self-use
    schema = AlgorithmListSchema()
    permission_classes = [ProjectViewOnlyPermission]
    http_method_names = ['get']

    def _get(self, params):
        queryset = Algorithm.objects.filter(project=params['project'])
        return database_qs(queryset)

    def get_queryset(self):
        """ TODO: add documentation for this """
        params = parse(self.request)
        queryset = Algorithm.objects.filter(project__id=params['project'])
        return queryset
