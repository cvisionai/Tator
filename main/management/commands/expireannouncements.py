import datetime
import logging

from django.core.management.base import BaseCommand
from main.models import Announcement

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Deletes announcements for which eol_datetime is older than current datetime.'

    def handle(self, **options):
        announcements = Announcement.objects.all()
        num_deleted = 0
        for announcement in list(announcements):
            if announcement.eol_datetime < datetime.datetime.now(datetime.timezone.utc):
                announcement.delete()
                logger.info(f"Deleted announcement {announcement.id}, "
                            f"EOL was {announcement.eol_datetime}.")
                num_deleted += 1
        logger.info(f"Deleted {num_deleted} announcements.")
