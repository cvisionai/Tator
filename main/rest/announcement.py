import datetime

from dateutil.parser import parse

from ..models import Announcement
from ..models import AnnouncementToUser
from ..models import database_qs
from ..schema import AnnouncementListSchema
from ..schema import AnnouncementDetailSchema

from ._base_views import BaseListView
from ._base_views import BaseDetailView

class AnnouncementListAPI(BaseListView):
    """ Create or retrieve a list of announcements.
    """
    schema = AnnouncementListSchema()
    http_method_names = ['get']

    def _get(self, params):
        response_data = []
        last_announcement = self.request.session.get('last_announcement')
        announce = False
        if last_announcement is None:
            announce = True
        else:
            last_announcement = parse(last_announcement)
            if (datetime.datetime.now() - last_announcement) > datetime.timedelta(days=1):
                announce = True
        if announce:
            self.request.session['last_announcement'] = datetime.datetime.now().isoformat()
            response_data = database_qs(self.get_queryset())
        return response_data

    def get_queryset(self):
        unread = AnnouncementToUser.objects.filter(user=self.request.user)\
                 .values_list('announcement', flat=True)\
                 .distinct()
        announcements = Announcement.objects.filter(pk__in=unread)
        return announcements

class AnnouncementDetailAPI(BaseDetailView):
    """ Interact with an individual announcement.
    """
    schema = AnnouncementDetailSchema()
    lookup_field = 'id'
    http_method_names = ['delete']

    def _delete(self, params):
        # This only deletes the announcement for the user.
        unread = AnnouncementToUser.objects.get(user=self.request.user,
                                                announcement=params['id'])
        unread.delete()
        return {'message': f'Announcement {params["id"]} successfully deleted!'}

    def get_queryset(self):
        unread = AnnouncementToUser.objects.filter(user=self.request.user)\
                 .values_list('announcement', flat=True)\
                 .distinct()
        announcements = Announcement.objects.filter(pk__in=unread)
        return announcements
