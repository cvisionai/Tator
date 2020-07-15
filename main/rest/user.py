""" TODO: add documentation for this """
from ..models import User
from ..serializers import UserSerializerBasic
from ..schema import UserDetailSchema
from ..schema import CurrentUserSchema

from ._base_views import BaseDetailView
from ._permissions import UserPermission

class UserDetailAPI(BaseDetailView):
    """ Interact with an individual user.
    """
    schema = UserDetailSchema()
    queryset = User.objects.all()
    permission_classes = [UserPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch']

    def _get(self, params):
        user = User.objects.get(pk=params['id'])
        return UserSerializerBasic(user).data

    def _patch(self, params):
        user = User.objects.get(pk=params['id'])
        if 'username' in params:
            user.username = params['username']
        if 'first_name' in params:
            user.first_name = params['first_name']
        if 'last_name' in params:
            user.last_name = params['last_name']
        if 'email' in params:
            user.email = params['email']
        user.save()
        return {'message': f'Updated user {params["id"]} successfully!'}

class CurrentUserAPI(BaseDetailView):
    """ Returns the current user.

        This is the equivalent of a whoami() operation.
    """
    schema = CurrentUserSchema()
    http_method_names = ['get']

    def _get(self):
        return UserSerializerBasic(self.request.user).data
