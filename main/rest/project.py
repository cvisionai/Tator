import os

from rest_framework.exceptions import PermissionDenied
from django.db import transaction
from django.shortcuts import get_object_or_404

from ..models import Project
from ..models import Membership
from ..models import Organization
from ..models import Affiliation
from ..models import Permission
from ..models import Media
from ..models import Bucket
from ..models import database_qs
from ..models import safe_delete
from ..models import Resource
from ..schema import ProjectListSchema
from ..schema import ProjectDetailSchema
from ..store import get_tator_store

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import ProjectFullControlPermission

def _serialize_projects(projects, user_id):
    project_data = database_qs(projects)
    for idx, project in enumerate(projects):
        store = get_tator_store(project.bucket)
        if project.creator.pk == user_id:
            project_data[idx]['permission'] = 'Creator'
        else:
            project_data[idx]['permission'] = str(project.user_permission(user_id))
        del project_data[idx]['attribute_type_uuids']
        if project_data[idx]['thumb']:
            project_data[idx]['thumb'] = store.get_download_url(project_data[idx]['thumb'], 28800)
    return project_data

class ProjectListAPI(BaseListView):
    """ Interact with a list of projects.

        Projects are the object under which all data in Tator is grouped, including user
        access, metadata definitions, media, and annotations. Data does not cross boundaries
        between projects.

        Project lists return all projects that the requesting user has access to.
    """
    schema = ProjectListSchema()
    http_method_names = ['get', 'post']

    def _get(self, params):
        projects = self.get_queryset()
        organization = params.get('organization')
        if organization is not None:
            projects = projects.filter(organization=organization)
        return _serialize_projects(projects, self.request.user.pk)

    def _post(self, params):
        # If user does not have admin privileges within the organization, raise a 403.
        affiliation = Affiliation.objects.filter(organization=params['organization'],
                                                 user=self.request.user)
        if affiliation.exists():
            if affiliation[0].permission != 'Admin':
                raise PermissionDenied
        else:
            raise PermissionDenied

        if Project.objects.filter(
            membership__user=self.request.user).filter(name__iexact=params['name']).exists():
            raise Exception("Project with this name already exists!")

        # Make sure bucket can be set by this user.
        if 'bucket' in params:
            params['bucket'] = get_object_or_404(Bucket, pk=params['bucket'])
            if params['bucket'].organization.pk != params['organization']:
                raise PermissionDenied

        params['organization'] = get_object_or_404(Organization, pk=params['organization'])
        del params['body']
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
        memberships = Membership.objects.filter(user=self.request.user)
        project_ids = memberships.values_list('project', flat=True)
        projects = Project.objects.filter(pk__in=project_ids).order_by('id')
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
        projects = Project.objects.filter(pk=params['id'])
        return _serialize_projects(projects, self.request.user.pk)[0]

    @transaction.atomic
    def _patch(self, params):
        project = Project.objects.get(pk=params['id'])
        if 'name' in params:
            if Project.objects.filter(
                membership__user=self.request.user).filter(name__iexact=params['name']).exists():
                raise Exception("Project with this name already exists!")
            project.name = params['name']
        if 'summary' in params:
            project.summary = params['summary']
        if 'thumb' in params:
            project_from_key = int(params['thumb'].split('/')[1])
            if project.pk != project_from_key:
                raise Exception("Invalid thumbnail path for this project!")

            tator_store = get_tator_store(project.bucket)
            if not tator_store.check_key(params["thumb"]):
                raise ValueError(f"Key {params['thumb']} not found in bucket")

            if project.thumb:
                safe_delete(project.thumb)
            project.thumb = params['thumb']
        if 'enable_downloads' in params:
            project.enable_downloads = params['enable_downloads']
        if 'bucket' in params:
            project.bucket = get_object_or_404(Bucket, pk=params['bucket'])
            if project.bucket.organization != project.organization:
                raise PermissionDenied
        project.save()
        return {'message': f"Project {params['id']} updated successfully!"}

    def _delete(self, params):
        # Check for permission to delete first.
        project = Project.objects.get(pk=params['id'])
        if self.request.user != project.creator:
            raise PermissionDenied

        # Mark media for deletion rather than actually deleting it.
        qs = Media.objects.filter(project=params['id'])
        qs.update(project=None)
        project.delete()
        return {'message': f'Project {params["id"]} deleted successfully!'}

    def get_queryset(self):
        return Project.objects.all()
