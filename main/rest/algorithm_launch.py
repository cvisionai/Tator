""" TODO: add documentation for this """
import logging
from uuid import uuid1

from rest_framework.authtoken.models import Token
from django.db.models import Case
from django.db.models import When
from django.http import Http404

from ..models import Algorithm
from ..models import Media
from ..kube import TatorAlgorithm
from ..consumers import ProgressProducer
from ..schema import AlgorithmLaunchSchema

from ._base_views import BaseListView
from ._media_query import query_string_to_media_ids
from ._permissions import ProjectExecutePermission

logger = logging.getLogger(__name__)

def media_batches(media_list, files_per_job):
    """ TODO: add documentation for this """
    for i in range(0, len(media_list), files_per_job):
        yield media_list[i:i + files_per_job]

class AlgorithmLaunchAPI(BaseListView):
    """ Start an algorithm.

        This will create one or more Argo workflows that execute the named algorithm
        registration. To get a list of available algorithms, use the `Algorithms` endpoint.
        A media list will be submitted for processing using either a query string or
        a list of media IDs. If neither are included, the algorithm will be launched on
        all media in the project.

        Media is divided into batches for based on the `files_per_job` field of the
        `Algorithm` object. One batch is submitted to each Argo workflow.

        Submitted algorithm jobs may be cancelled via the `Job` or `JobGroup` endpoints.
    """
    schema = AlgorithmLaunchSchema()
    permission_classes = [ProjectExecutePermission]
    http_method_names = ['post']

    def _post(self, params):

        # Find the algorithm
        project_id = params['project']
        alg_name = params['algorithm_name']
        alg_obj = Algorithm.objects.filter(project__id=project_id)
        alg_obj = alg_obj.filter(name=alg_name)
        if len(alg_obj) != 1:
            raise Http404
        alg_obj = alg_obj[0]
        files_per_job = alg_obj.files_per_job

        media_ids = []
        # Get media IDs
        if 'media_query' in params:
            media_ids = query_string_to_media_ids(project_id, params['media_query'])
        elif 'media_ids' in params:
            media_ids = params['media_ids']
        else:
            media = Media.objects.filter(project=project_id)
            media_ids = list(media.values_list("id", flat=True))
        media_ids = [str(a) for a in media_ids]

        # Create algorithm jobs
        gid = str(uuid1())
        uids = []
        submitter = TatorAlgorithm(alg_obj)
        token, _ = Token.objects.get_or_create(user=self.request.user)
        for batch in media_batches(media_ids, files_per_job):
            run_uid = str(uuid1())
            uids.append(run_uid)
            batch_str = ','.join(batch)
            batch_int = [int(pk) for pk in batch]
            batch_order = Case(*[When(pk=pk, then=pos) for pos, pk in enumerate(batch_int)])
            q_s = Media.objects.filter(pk__in=batch_int).order_by(batch_order)
            sections = q_s.values_list('attributes__tator_user_sections', flat=True)
            sections = ','.join(list(sections))
            submitter.start_algorithm(
                media_ids=batch_str,
                sections=sections,
                gid=gid,
                uid=run_uid,
                token=token,
                project=project_id,
                user=self.request.user.pk,
            )

            # Send out a progress message saying this launch is queued.
            prog = ProgressProducer(
                'algorithm',
                project_id,
                gid,
                run_uid,
                alg_name,
                self.request.user,
                {'media_ids': batch_str, 'sections': sections},
            )
            prog.queued("Queued...")

        return {'message': f"Algorithm {alg_name} started successfully!",
                'run_uids': uids,
                'group_id': gid}
