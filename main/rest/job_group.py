""" TODO: add documentation for this """
import os
import json
import logging

from django.http import Http404
from redis import Redis

from ..models import Algorithm
from ..kube import TatorTranscode
from ..kube import TatorAlgorithm
from ..schema import JobGroupDetailSchema

from ._base_views import BaseDetailView
from ._permissions import ProjectTransferPermission

logger = logging.getLogger(__name__)

class JobGroupDetailAPI(BaseDetailView):
    """ Cancel a group of background jobs.

        Algorithms and transcodes create argo workflows that are annotated with two
        uuid1 strings, one identifying the run and the other identifying the group.
        Jobs that are submitted together have the same group id, but each workflow
        has a unique run id.

        This endpoint allows the user to cancel a group of jobs using the `group_id`
        returned by either the `AlgorithmLaunch` or `Transcode` endpoints.
    """
    schema = JobGroupDetailSchema()
    permission_classes = [ProjectTransferPermission]
    http_method_names = ['delete']

    def _delete(self, params):
        # Parse parameters
        group_id = params['group_id']

        # Find the gid in redis.
        rds = Redis(host=os.getenv('REDIS_HOST'))
        if rds.hexists('gids', group_id):
            msg = json.loads(rds.hget('gids', group_id))

            # Attempt to cancel.
            if msg['prefix'] == 'upload':
                TatorTranscode().cancel_jobs(f'gid={group_id}')
            elif msg['prefix'] == 'algorithm':
                alg = Algorithm.objects.get(project=msg['project_id'], name=msg['name'])
                TatorAlgorithm(alg).cancel_jobs(f'gid={group_id}')
        else:
            raise Http404

        return {'message': f"Jobs with group ID {group_id} deleted!"}
