""" TODO: add documentation for this """
from rest_framework.exceptions import PermissionDenied

from ..models import Project
from ..models import Membership
from ..models import Permission
from ..models import Media
from ..serializers import ProjectSerializer
from ..schema import ProjectListSchema
from ..schema import ProjectDetailSchema

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectFullControlPermission

class ProjectListAPI(BaseListView):
    """ Interact with a list of projects.

        Projects are the object under which all data in Tator is grouped, including user
        access, metadata definitions, media, and annotations. Data does not cross boundaries
        between projects.

        Project lists return all projects that the requesting user has access to.
    """
    schema = ProjectListSchema()
    http_method_names = ['get', 'post']

    def _get(self):
        projects = self.get_queryset()
        return ProjectSerializer(projects, many=True, context=self.get_renderer_context()).data

    def _post(self, params):
        if Project.objects.filter(
                membership__user=self.request.user).filter(name=params['name']).exists():
            raise Exception("Project with this name already exists!")

        project = Project.objects.create(
            **params,
            creator=self.request.user,
            size=0,
            num_files=0,
        )
        project.save()

        member = Membership(
            project=project,
            user=self.request.user,
            permission=Permission.FULL_CONTROL,
        )
        member.save()
        return {'message': f"Project {params['name']} created!", 'id': project.id}

    def get_queryset(self):
        """ TODO: add documentation for this """
        memberships = Membership.objects.filter(user=self.request.user)
        project_ids = memberships.values_list('project', flat=True)
        projects = Project.objects.filter(pk__in=project_ids).order_by("created")
        return projects

class ProjectDetailAPI(BaseDetailView):
    """ Interact with an individual project.

        Projects are the object under which all data in Tator is grouped, including user
        access, metadata definitions, media, and annotations. Data does not cross boundaries
        between projects.

        Only the project owner may patch or delete an individual project.
    """
    schema = ProjectDetailSchema()
    permission_classes = [ProjectFullControlPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        return ProjectSerializer(Project.objects.get(pk=params['id']),
                                 context=self.get_renderer_context()).data

    def _patch(self, params):
        project = Project.objects.get(pk=params['id'])
        if 'name' in params:
            project.name = params['name']
        if 'summary' in params:
            project.summary = params['summary']
        project.save()
        return {'message': f"Project {params['id']} updated successfully!"}

    def _delete(self, params):
        # Check for permission to delete first.
        project = Project.objects.get(pk=params['id'])
        if self.request.user != project.creator:
            raise PermissionDenied

        # Mark media for deletion rather than actually deleting it.
        q_s = Media.objects.filter(project=params['id'])
        q_s.update(project=None)
        project.delete()
        return {'message': f'Project {params["id"]} deleted successfully!'}

    def get_queryset(self):
        """ TODO: add documentation for this """
        return Project.objects.all()
