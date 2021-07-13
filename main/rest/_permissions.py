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
from ..models import Organization
from ..models import Affiliation
from ..models import Algorithm
from ..kube import TatorTranscode
from ..kube import TatorAlgorithm
from ..cache import TatorCache

logger = logging.getLogger(__name__)

def _for_schema_view(request, view):
    """ Returns true if permission is being requested for the schema view. This is 
        necessary since there is no way to check project based permissions when
        no URL parameters are given.
    """
    return (
        view.kwargs == {}
        and type(request.authenticators[0]) == SessionAuthentication
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
            pk = view.kwargs['id']
            obj = get_object_or_404(view.get_queryset(), pk=pk)
            project = self._project_from_object(obj)
            if project is None:
                raise Http404
        elif 'uid' in view.kwargs:
            uid = view.kwargs['uid']
            try:
                cache = TatorCache().get_jobs_by_uid(uid)
                project = cache[0]['project']
            except:
                raise Http404
        else:
            # If this is a request from schema view, show all endpoints.
            return _for_schema_view(request, view)

        return self._validate_project(request, project)

    def has_object_permission(self, request, view, obj):
        # Get the project from the object
        project = self._project_from_object(obj)
        return self._validate_project(request, project)

    def _project_from_object(self, obj):
        project=None
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
            # If user is anonymous but request contains a reset token and password, allow it.
            has_password = 'password' in request.data 
            logger.info(f"HAS PASSWORD: {has_password}")
            has_token = 'reset_token' in request.data
            logger.info(f"HAS TOKEN: {has_token}")
            has_two = len(list(request.data.values())) == 2
            logger.info(f"HAS TWO: {has_two}")
            is_patch = request.method == 'PATCH'
            logger.info(f"IS PATCH: {is_patch}")
            if has_password and has_token and has_two and is_patch:
                return True
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
        user_projects=Membership.objects.filter(user=user).values('project')
        cousins=Membership.objects.filter(project__in = user_projects).values('user').distinct()
        is_cousin = cousins.filter(user=finger_user).count() > 0
        if is_cousin and request.method == 'GET':
            # Cousins have read-only permission
            return True

        return False

class UserListPermission(BasePermission):
    """ 1.) Reject anonymous GET requests
        2.) Allow any read-only requests
        3.) Always allow POST since permissions are determined in the endpoint
    """
    def has_permission(self, request, view):
        if request.method == 'POST':
            return True

        if isinstance(request.user, AnonymousUser):
            return False

        if _for_schema_view(request, view):
            return True

        if request.method == 'GET':
            # All users have read-only permission, POST is validated by registration
            # token.
            return True

        return False

class ClonePermission(ProjectPermissionBase):
    """ Special permission that checks for transfer permission in two
        projects.
    """
    message = "Insufficient permission to clone media between these projects."
    insufficient_permissions = [Permission.VIEW_ONLY, Permission.CAN_EDIT]

    def has_permission(self, request, view):
        if 'project' in view.kwargs:
            src_project = view.kwargs['project']
            src_project = get_object_or_404(Project, pk=int(src_project))
            dst_project = request.data['dest_project']
            dst_project = get_object_or_404(Project, pk=int(dst_project))
        else:
            # If this is a request from schema view, show all endpoints.
            return _for_schema_view(request, view)

        return (self._validate_project(request, src_project)
                and self._validate_project(request, dst_project))

    def has_object_permission(self, request, view, obj):
        return False
    
class OrganizationPermissionBase(BasePermission):
    """Base class for requiring organization permissions.
    """
    def has_permission(self, request, view):
        # Get the organization from the URL parameters
        if 'organization' in view.kwargs:
            organization_id = view.kwargs['organization']
            organization = get_object_or_404(Organization, pk=int(organization_id))
        elif 'id' in view.kwargs:
            pk = view.kwargs['id']
            obj = get_object_or_404(view.get_queryset(), pk=pk)
            organization = self._organization_from_object(obj)
            if organization is None:
                raise Http404
        else:
            # If this is a request from schema view, show all endpoints.
            return _for_schema_view(request, view)

        return self._validate_organization(request, organization)

    def has_object_permission(self, request, view, obj):
        # Get the organization from the object
        organization = self._organization_from_object(obj)
        return self._validate_organization(request, organization)

    def _organization_from_object(self, obj):
        organization=None
        if hasattr(obj, 'organization'):
            organization = obj.organization
        # Object is a organization
        elif isinstance(obj, Organization):
            organization = obj
        return organization

    def _validate_organization(self, request, organization):
        granted = True

        if isinstance(request.user, AnonymousUser):
            granted = False
        else:
            # Find affiliation for this user and organization
            affiliation = Affiliation.objects.filter(
                user=request.user,
                organization=organization
            )

            # If user is not part of organization, deny access
            if affiliation.count() == 0:
                granted = False
            else:
                # If user has insufficient permission, deny access
                permission = affiliation[0].permission
                insufficient = permission in self.insufficient_permissions
                is_edit = request.method not in SAFE_METHODS
                if is_edit and insufficient:
                    granted = False
        return granted

class OrganizationMemberPermission(OrganizationPermissionBase):
    """Checks whether a user has member access to an organization. This
       is just to check whether a user is a member of an organization.
    """
    message = "Not a member of this organization."
    insufficient_permissions = []

class OrganizationAdminPermission(OrganizationPermissionBase):
    """Checks whether a user has admin access to an organization. This
       is just to check whether a user is a member of an organization.
    """
    message = "User does not have admin access to organization."
    insufficient_permissions = ['Member']

