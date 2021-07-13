""" Algorithm REST endpoints """
# pylint: disable=too-many-ancestors

import logging
import os
from django.db import transaction
from django.conf import settings
import yaml

from ..models import Project
from ..models import Algorithm
from ..models import User
from ..models import JobCluster
from ..models import database_qs
from ..schema import AlgorithmDetailSchema
from ..schema import AlgorithmListSchema
from ..schema.components.algorithm import alg_fields as fields
from ._base_views import BaseDetailView
from ._base_views import BaseListView
from ._permissions import ProjectEditPermission
from ..schema import parse

logger = logging.getLogger(__name__)

class AlgorithmListAPI(BaseListView):
    """ Retrieves registered algorithms and register new algorithm workflows
    """
    # pylint: disable=no-member,no-self-use
    schema = AlgorithmListSchema()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'post']

    def _get(self, params: dict) -> dict:
        """ Returns the full database entries of algorithm registered with this project
        """
        qs = Algorithm.objects.filter(project=params['project'])
        return database_qs(qs)

    def get_queryset(self):
        """ Returns a queryset of algorithms related with the current request's project
        """
        params = parse(self.request)
        qs = Algorithm.objects.filter(project__id=params['project'])
        return qs

    def _post(self, params: dict) -> dict:
        """ Registers a new algorithm argo workflow using the provided parameters

        Parameters are checked first for validity. If there's a problem with any of the
        following, an exception is raised:
        - Unique algorithm name (checked against all algorithms, regardless of project)
        - Unique project ID
        - User ID
        - Saved manifest file (saved to the project) with correct syntax

        Args:
            params: Parameters with request that contains the info for the algorithm registration

        Returns:
            Response with message and ID of registered algorithm
        """

        # Have to check the validity of the provided parameters before committing them
        # to the database

        # Does the project ID exist?
        project_id = params[fields.project]
        try:
            project = Project.objects.get(pk=project_id)
        except Exception as exc:
            log_msg = f'Provided project ID ({project_id}) does not exist'
            logger.error(log_msg)
            raise exc

        # Is the name unique?
        alg_workflow_name = params[fields.name]
        if Algorithm.objects.filter(project=project, name=alg_workflow_name).exists():
            log_msg = f"Provided algorithm workflow name '{alg_workflow_name}' already exists for project '{project_id}'"
            logger.error(log_msg)
            raise ValueError(log_msg)

        # Does the user ID exist?
        user_id = params[fields.user]
        try:
            user = User.objects.get(pk=user_id)
        except Exception as exc:
            log_msg = f'Provided user ID ({user_id}) does not exist'
            logger.error(log_msg)
            raise exc

        # Gather the manifest and verify it exists on the server in the right project
        manifest_file = os.path.basename(params[fields.manifest])
        manifest_url = os.path.join(str(project_id), manifest_file)
        manifest_path = os.path.join(settings.MEDIA_ROOT, manifest_url)
        if not os.path.exists(manifest_path):
            log_msg = f'Provided manifest ({manifest_file}) does not exist in {settings.MEDIA_ROOT}'
            logging.error(log_msg)
            raise ValueError(log_msg)

        try:
            with open(manifest_path, 'r') as fp:
                loaded_yaml = yaml.safe_load(fp)
        except Exception as exc:
            log_msg = 'Provided yaml file has syntax errors'
            logging.error(log_msg)
            raise exc

        # Number of files per job greater than 1?
        files_per_job = int(params[fields.files_per_job])
        if files_per_job < 1:
            log_msg = f'Provided files_per_job ({files_per_job}) must be at least 1'
            logger.error(log_msg)
            raise ValueError(log_msg)

        # Get the optional fields and set to null if need be.
        description = params.get(fields.description, None)
        cluster = params.get(fields.cluster, None)
        categories = params.get(fields.categories, None)
        parameters = params.get(fields.parameters, None)

        # Register the algorithm workflow
        alg_obj = Algorithm(
            name=alg_workflow_name,
            project=project,
            user=user,
            manifest=manifest_url,
            description=description,
            cluster=cluster,
            files_per_job=files_per_job,
            categories=categories,
            parameters=parameters)
        alg_obj.save()

        return {'message': 'Successfully registered algorithm argo workflow.', 'id': alg_obj.id}

class AlgorithmDetailAPI(BaseDetailView):
    """ Interact with a single registered algorithm
    """

    schema = AlgorithmDetailSchema()
    permission_classes = [ProjectEditPermission]
    http_method_names = ['get', 'patch', 'delete']

    def safe_delete(self, path: str) -> None:
        """ Attempts to delete the file at the provided path.

        Args:
            path: Server side path for file to be deleted. If an exception is raised
                  during this delete process, it's caught, logged and the exception
                  is not re-raised.
        """
        try:
            logger.info(f"Deleting {path}")
            os.remove(path)
        except:
            logger.warning(f"Could not remove {path}")

    def _delete(self, params: dict) -> dict:
        """ Deletes the provided registered algorithm and the corresponding manifest file

        Args:
            params: Parameters provided as part of the delete request. Only care about ID

        Returns:
            Returns response message indicating successful deletion of algorithm
        """

        # Grab the algorithm object and delete it from the database
        alg = Algorithm.objects.get(pk=params['id'])
        manifest_file = alg.manifest.name
        alg.delete()

        # Delete the correlated manifest file
        path = os.path.join(settings.MEDIA_ROOT, manifest_file)
        self.safe_delete(path=path)

        msg = 'Registered algorithm deleted successfully!'
        return {'message': msg}

    def _get(self, params):
        """ Retrieve the requested algortihm entry by ID
        """
        return database_qs(Algorithm.objects.filter(pk=params['id']))[0]

    @transaction.atomic
    def _patch(self, params) -> dict:
        """ Patch operation on the algorithm entry
        """
        alg_id = params["id"]
        obj = Algorithm.objects.get(pk=alg_id)

        name = params.get(fields.name, None)
        if name is not None:
            obj.name = name

        user = params.get(fields.user, None)
        if user is not None:
            user_entry = User.objects.get(pk=user)
            obj.user = user_entry

        description = params.get(fields.description, None)
        if description is not None:
            obj.description = description

        categories = params.get(fields.categories, None)
        if categories is not None:
            obj.categories = categories

        parameters = params.get(fields.parameters, None)
        if parameters is not None:
            obj.parameters = parameters

        #TODO Should this delete the manifest if it's not registered to anything else?
        manifest = params.get(fields.manifest, None)
        if manifest is not None:
            obj.manifest = manifest

        #TODO This needs to be updated at some point to actually use the JobCluster objects
        #     Currently, there doesn't exist an endpoint to manage jobclusters
        '''
        cluster = params.get(fields.cluster, None)
        if cluster is not None:
            cluster_obj = JobCluster.objects.get(pk=cluster)
            obj.cluster = cluster_obj
        '''

        files_per_job = params.get(fields.files_per_job, None)
        if files_per_job is not None:
            obj.files_per_job = files_per_job

        obj.save()

        return {'message': f'Algorithm {alg_id} successfully updated!'}

    def get_queryset(self):
        """ Returns a queryset of all registered algorithms
        """
        return Algorithm.objects.all()
