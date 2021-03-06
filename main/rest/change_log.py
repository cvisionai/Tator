import logging

from django.contrib.contenttypes.models import ContentType

from ..models import ChangeLog
from ..models import ChangeToObject
from ..schema import ChangeLogListSchema

from ._base_views import BaseListView
from ._permissions import ProjectFullControlPermission

logger = logging.getLogger(__name__)

CHANGE_LOG_PROPERTIES = ["id", "project", "user", "description_of_change"]

class ChangeLogListAPI(BaseListView):
    """
    Interact with list of change logs.

    ChangeLog objects represent a singe change applied to one or more objects. They contain the old
    and new values, as well as the modifying user and time of modification.
    """

    schema = ChangeLogListSchema()
    permission_classes = [ProjectFullControlPermission]
    http_method_names = ["get"]

    def _get(self, params):
        response_data = []
        # Get query parameters.
        project = params["project"]
        user_id = params.get("user_id")
        entity_id = params.get("entity_id")

        if all(value is None for value in [user_id, entity_id]):
            raise ValueError(
                f"At least one of the following fields need to be set: user_id, entity_id"
            )

        cl_qs = ChangeLog.objects.filter(project=project)

        if user_id is not None:
            cl_qs = cl_qs.filter(user=user_id)

        if entity_id is not None:
            cto_qs = ChangeToObject.objects.filter(ref_id=entity_id)
            cl_qs = cl_qs.filter(pk__in=[cto.change_id.id for cto in cto_qs if cto.change_id])

        response_data = list(cl_qs.values(*CHANGE_LOG_PROPERTIES))
        return response_data
