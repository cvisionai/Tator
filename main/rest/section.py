from ..models import Section
from ..models import Project
from ..schema import SectionListSchema
from ..schema import SectionDetailSchema

from ._media_query import get_section_info
from ._media_query import get_media_queryset
from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectEditPermission

class SectionListAPI(BaseListView):
    """ List methods for Section endpoint.

        Sections contain information about a group of media.
    """
    schema = MembershipListSchema()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'post']

    def _get(self, params):
        # Get query associated with media filters.
        _, _, query = get_media_queryset(params['project'], params, True)

        # Get additional section info.
        return get_section_info(query, params['project'])

    def _post(self, params):
        project = params['project']
        user = params['user']
        permission = params['permission']
        
        project = Project.objects.get(pk=project)
        user = User.objects.get(pk=user) 
        membership = Membership.objects.create(
            project=project,
            user=user,
            permission=permission,
        )
        membership.save()
        return {'message': f"Membership of {user} to {project} created!",
                'id': membership.id}

    def get_queryset(self):
        project_id = self.kwargs['project']
        members = Membership.objects.filter(project__id=project_id)
        return members

class SectionDetailAPI(BaseDetailView):
    """ Detail methods for Section endpoint.

        Sections contain information about a group of media.
    """
    schema = SectionDetailSchema()
    permission_classes = [ProjectEditPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        section = Section.objects.get(pk=params['id'])
        # Get query associated with media filters.
        query = [{'bool': {
            'should': [
                {'match': {'_dtype': 'image'}},
                {'match': {'_dtype': 'video'}},
            ],
            'minimum_should_match': 1,
        }}, {
          'match': {'_section': {'query': params['id']}},
        }]
        return get_section_info(query, section.project.pk)[0]

    def _patch(self, params):
        section = Section.objects.get(pk=params['id']) 
        if 'name' in params:
            section.name = params['name']
        section.save()
        return {'message': f"Name of section {params['name']} updated!"}

    def _delete(self, params):
        Section.objects.get(pk=params['id']).delete()
        return {'message': f'Section {params["id"]} successfully deleted!'}

    def get_queryset(self):
        return Membership.objects.all()
