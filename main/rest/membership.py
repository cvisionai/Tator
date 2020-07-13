""" TODO: add documentation for this """
from ..models import Membership
from ..models import Project
from ..models import User
from ..serializers import MembershipSerializer
from ..schema import MembershipListSchema
from ..schema import MembershipDetailSchema

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectFullControlPermission

class MembershipListAPI(BaseListView):
    """ Create or retrieve a list of project memberships.

        Memberships specify a permission level of a user to a project. There are currently
        five cumulative permission levels. `View Only` can only view a project and not change
        any data. `Can Edit` can create, modify, and delete annotations. `Can Transfer` can
        upload and download media. `Can Execute` can launch algorithm workflows. `Full Control`
        can change project settings, including inviting new members, project name, and
        project metadata schema.
    """
    schema = MembershipListSchema()
    permission_classes = [ProjectFullControlPermission]
    http_method_names = ['get', 'post']

    def _get(self, params):
        members = Membership.objects.filter(project=params['project'])
        return MembershipSerializer(members, many=True).data

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
        """ TODO: add documentation for this """
        project_id = self.kwargs['project']
        members = Membership.objects.filter(project__id=project_id)
        return members

class MembershipDetailAPI(BaseDetailView):
    """ Interact with an individual project membership.

        Memberships specify a permission level of a user to a project. There are currently
        five cumulative permission levels. `View Only` can only view a project and not change
        any data. `Can Edit` can create, modify, and delete annotations. `Can Transfer` can
        upload and download media. `Can Execute` can launch algorithm workflows. `Full Control`
        can change project settings, including inviting new members, project name, and
        project metadata schema.
    """
    schema = MembershipDetailSchema()
    permission_classes = [ProjectFullControlPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        member = Membership.objects.get(pk=params['id'])
        return MembershipSerializer(member).data

    def _patch(self, params):
        membership = Membership.objects.get(pk=params['id'])
        if 'permission' in params:
            membership.permission = params['permission']
        membership.save()
        return {'message': f"Membership of {membership.user} to {membership.project} "
                           f"permissions updated to {params['permission']}!"}

    def _delete(self, params):
        Membership.objects.get(pk=params['id']).delete()
        return {'message': f'Membership {params["id"]} successfully deleted!'}

    def get_queryset(self):
        """ TODO: add documentation for this """
        return Membership.objects.all()
