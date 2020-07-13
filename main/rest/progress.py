""" TODO: add documentation for this """
import logging
import datetime

from ..consumers import ProgressProducer
from ..schema import ProgressSchema

from ._base_views import BaseListView

logger = logging.getLogger(__name__)

class ProgressAPI(BaseListView):
    """ Broadcast progress update.

        Progress messages are sent in the web UI via WebSocket, and are displayed as progress
        bars associated with individual media files and as a summary in the webpage header. All
        members of a project can see progress bars from uploads and background jobs initiated
        by other users within the project. This endpoint accepts an array of messages, allowing
        for progress messages to be batched into a single request.
    """
    schema = ProgressSchema()
    http_method_names = ['post']

    def _post(self, params):
        for req_object in params['body']:
            aux = {}
            if req_object['job_type'] == 'upload':
                if 'swid' in req_object:
                    aux['swid'] = str(req_object['swid'])

                if 'section' in req_object:
                    aux['section'] = req_object['section']

                aux['updated'] = str(datetime.datetime.now(datetime.timezone.utc))

            if req_object['job_type'] == 'algorithm':
                if 'sections' in req_object:
                    aux['sections'] = req_object['sections']
                if 'media_ids' in req_object:
                    aux['media_ids'] = req_object['media_ids']

            prog = ProgressProducer(
                req_object['job_type'],
                params['project'],
                str(req_object['gid']),
                req_object['uid'],
                req_object['name'],
                self.request.user,
                aux,
            )

            if req_object['state'] == 'failed':
                prog.failed(req_object['message'])
            elif req_object['state'] == 'queued':
                prog.queued(req_object['message'])
            elif req_object['state'] == 'started':
                prog.progress(req_object['message'], float(req_object['progress']))
            elif req_object['state'] == 'finished':
                prog.finished(req_object['message'])
            else:
                logger.info(f"Received invalid progress state {req_object['state']}")
                raise Exception(f"Invalid progress state {req_object['state']}")

        return {'message': "Progress sent successfully!"}
