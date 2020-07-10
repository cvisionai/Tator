""" TODO: add documentation for this """
from ..models import Analysis
from ..models import Project
from ..models import database_qs
from ..schema import AnalysisListSchema
from ..schema import parse

from ._base_views import BaseListView
from ._permissions import ProjectFullControlPermission

class AnalysisListAPI(BaseListView):
    """ Define and list analyses for a project.

        Analysis objects are used to display information about filtered media lists
        and/or annotations on the project detail page of the web UI. Currently only
        counting analysis is supported.
    """
    schema = AnalysisListSchema()
    permission_classes = [ProjectFullControlPermission]
    http_method_names = ['get', 'post']

    def _get(self, params):
        return database_qs(Analysis.objects.filter(project=params['project']))

    def _post(self, params):
        # Convert pk to objects.
        params['project'] = Project.objects.get(pk=params['project'])

        # Create the object.
        obj = Analysis(**params)
        obj.save()
        return {'message': 'Analysis created successfully!', 'id': obj.id}

    def get_queryset(self):
        """ TODO: add documentation for this """
        params = parse(self.request)
        q_s = Analysis.objects.filter(project__id=params['project'])
        return q_s
