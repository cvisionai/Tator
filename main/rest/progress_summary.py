""" TODO: add documentation for this """
import logging
import os

from redis import Redis

from ._base_views import BaseListView
from ..schema import ProgressSummarySchema

logger = logging.getLogger(__name__)

class ProgressSummaryAPI(BaseListView):
    """ Create or update a progress summary.

        This endpoint sets a key in redis that indicates how many jobs are in
        a job group as well as how many are completed. This is used to display
        summary progress in the progress bar. If not used for a given job group,
        the job completion is computed from the status of individual jobs in
        the group.
    """
    schema = ProgressSummarySchema()
    http_method_names = ['post']

    def _post(self, params):
        rds = Redis(host=os.getenv('REDIS_HOST'))
        rds.hset('num_jobs', str(params['gid']), params['num_jobs'])
        rds.hset('num_complete', str(params['gid']), params['num_complete'])
        return {'message': f"Progress summary sent for group ID {params['gid']}!"}
