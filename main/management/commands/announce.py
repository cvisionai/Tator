import datetime
import logging

from django.core.management.base import BaseCommand
from main.models import Announcement
from main.models import AnnouncementToUser
from main.models import User
from main.models import Membership

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = ('Creates an announcement, optionally scoped to a project or user. Either '
            '--markdown or --file must be supplied.')

    def add_arguments(self, parser):
        parser.add_argument('--markdown', type=str,
                            help="Text of the announcement in markdown format.")
        parser.add_argument('--file', type=str,
                            help="Path to file containing markdown.")
        parser.add_argument('--expires_in', type=int, default=7,
                            help="Number of days before announcement expires and is deleted.")
        parser.add_argument('--project', type=int,
                            help="Optional project ID. If given, announcement will only be "
                                 "shown to users in this project.")
        parser.add_argument('--user', type=int,
                            help="Optional user ID. If given, announcement will only be "
                                 "shown to this specific user.")

    def handle(self, **options):
        if options['markdown']:
            markdown = options['markdown']
        elif options['file']:
            with open(options['file'], 'r') as f:
                markdown = f.read()
        else:
            raise ValueError("Either --markdown or --file must be supplied!")
        eol_datetime = datetime.datetime.now() + datetime.timedelta(days=options['expires_in'])
        announcement = Announcement.objects.create(markdown=markdown,
                                                   eol_datetime=eol_datetime)
        users = User.objects.all()
        if options['project']:
            memberships = Membership.objects.filter(project=options['project'])
            user_ids = memberships.values_list('user', flat=True).distinct()
            users = User.objects.filter(pk__in=user_ids)
        if options['user']:
            users = User.objects.filter(pk=options['user'])
        to_users = [AnnouncementToUser(announcement=announcement, user=user)
                    for user in users]
        AnnouncementToUser.objects.bulk_create(to_users)
        logger.info(f"Created announcement {announcement.id}, sent to {len(to_users)} users.")
