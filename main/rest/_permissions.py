""" TODO: add documentation for this """
import logging
import os
import json

from rest_framework.permissions import BasePermission
from rest_framework.permissions import SAFE_METHODS
from rest_framework.authentication import SessionAuthentication
from django.contrib.auth.models import AnonymousUser
from django.shortcuts import get_object_or_404
from django.http import Http404
from redis import Redis

from ..models import Permission
from ..models import Project
from ..models import Membership

logger = logging.getLogger(__name__)

def _for_schema_view(request, view):
    """ Returns true if permission is being requested for the schema view. This is
        necessary since there is no way to check project based permissions when
        no URL parameters are given.
    """
    return (
        view.kwargs == {}
        and isinstance(request.authenticators[0]) == SessionAuthentication
        and request.META['HTTP_HOST'] == f"{os.getenv('MAIN_HOST')}"
        and request.META['RAW_URI'].startswith('/schema/')
    )

class ProjectPermissionBase(BasePermission):
    """Base class for requiring project permissions.
    """
    def has_permission(self, request, view):
        # Get the project from the URL parameters
        if 'project' in view.kwargs:
            project_id = view.kwargs['project']
            project = get_object_or_404(Project, pk=int(project_id))
        elif 'id' in view.kwargs:
            p_k = view.kwargs['id']
            obj = get_object_or_404(view.get_queryset(), p_k=p_k)
            project = self._project_from_object(obj)
            if project is None:
                raise Http404
        elif 'run_uid' in view.kwargs:
            uid = view.kwargs['run_uid']
            rds = Redis(host=os.getenv('REDIS_HOST'))
            if rds.hexists('uids', uid):
                msg = json.loads(rds.hget('uids', uid))
                project = msg['project_id']
        elif 'group_id' in view.kwargs:
            group_id = view.kwargs['group_id']
            rds = Redis(host=os.getenv('REDIS_HOST'))
            if rds.hexists('gids', group_id):
                msg = json.loads(rds.hget('gids', group_id))
                project = msg['project_id']
        else:
            # If this is a request from schema view, show all endpoints.
            return _for_schema_view(request, view)

        return self._validate_project(request, project)

    def has_object_permission(self, request, view, obj):
        # Get the project from the object
        project = self._project_from_object(obj)
        return self._validate_project(request, project)

    def _project_from_object(self, obj):
        project = None
        if hasattr(obj, 'project'):
            project = obj.project
        # Object is a project
        elif isinstance(obj, Project):
            project = obj
        return project

    def _validate_project(self, request, project):
        granted = True

        if isinstance(request.user, AnonymousUser):
            granted = False
        else:
            # Find membership for this user and project
            membership = Membership.objects.filter(
                user=request.user,
                project=project
            )

            # If user is not part of project, deny access
            if membership.count() == 0:
                granted = False
            else:
                # If user has insufficient permission, deny access
                permission = membership[0].permission
                insufficient = permission in self.insufficient_permissions
                is_edit = request.method not in SAFE_METHODS
                if is_edit and insufficient:
                    granted = False
        return granted

class ProjectViewOnlyPermission(ProjectPermissionBase):
    """Checks whether a user has view only access to a project. This
       is just to check whether a user is a member of a project.
    """
    message = "Not a member of this project."
    insufficient_permissions = []

class ProjectEditPermission(ProjectPermissionBase):
    """Checks whether a user has edit access to a project.
    """
    message = "Insufficient permission to modify this project."
    insufficient_permissions = [Permission.VIEW_ONLY]

class ProjectTransferPermission(ProjectPermissionBase):
    """Checks whether a user has transfer access to a project.
    """
    message = "Insufficient permission to transfer media within this project."
    insufficient_permissions = [Permission.VIEW_ONLY, Permission.CAN_EDIT]

class ProjectExecutePermission(ProjectPermissionBase):
    """Checks whether a user has execute access to a project.
    """
    message = "Insufficient permission to execute within this project."
    insufficient_permissions = [
        Permission.VIEW_ONLY,
        Permission.CAN_EDIT,
        Permission.CAN_TRANSFER,
    ]

class ProjectFullControlPermission(ProjectPermissionBase):
    """Checks if user has full control over a project.
    """
    message = "Insufficient permission to edit project settings."
    insufficient_permissions = [
        Permission.VIEW_ONLY,
        Permission.CAN_EDIT,
        Permission.CAN_TRANSFER,
        Permission.CAN_EXECUTE,
    ]

class UserPermission(BasePermission):
    """ 1.) Reject all anonymous requests
        2.) Allow all super-user requests
        3.) Allow any cousin requests (users on a common project) (read-only)
        4.) Allow any request if user id = pk
    """
    def has_permission(self, request, view):
        if isinstance(request.user, AnonymousUser):
            return False

        if _for_schema_view(request, view):
            return True

        user = request.user
        finger_user = view.kwargs['id']
        if user.is_staff:
            return True
        if user.id == finger_user:
            return True

        # find out if user is a cousin
        user_projects = Membership.objects.filter(user=user).values('project')
        cousins = Membership.objects.filter(project__in=user_projects).values('user').distinct()
        is_cousin = cousins.filter(user=finger_user).count() > 0
        if is_cousin and request.method == 'GET':
            # Cousins have read-only permission
            return True

        return False
