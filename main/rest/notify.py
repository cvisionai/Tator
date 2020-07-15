""" TODO: add documentation for this """
import traceback

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from ..notify import Notify
from ..schema import NotifySchema
from ..schema import parse

class NotifyAPI(APIView):
    """ Send a notification to administrators.

        Uses the Slack API to send a notification to system administrators. This
        endpoint can only be used by system administrators and must be configured
        in a Tator deployment's settings.
    """
    schema = NotifySchema()

    def post(self, request):
        """ TODO: add documentation for this """
        response = Response({'message' : str("Not Found")},
                            status=status.HTTP_404_NOT_FOUND)
        try:
            params = parse(request)

            send_as_file = params.get('sendAsFile', 0)

            response = None
            if send_as_file == 1:
                response = Notify.notify_admin_file(f"Message from {request.user}",
                                                    params['message'])
            else:
                response = Notify.notify_admin_msg(f"_{request.user}_ : {params['message']}")

            if response is True:
                response = Response({'message' : "Processed"},
                                    status=status.HTTP_200_OK)
            else:
                response = Response({'message': "Not Processed"},
                                    status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as exc: #pylint: disable=broad-except
            response = Response({'message' : str(exc),
                                 'details': traceback.format_exc()},
                                status=status.HTTP_400_BAD_REQUEST)
        return response
