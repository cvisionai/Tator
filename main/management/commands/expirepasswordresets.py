import datetime
import logging

from django.core.management.base import BaseCommand
from main.models import PasswordReset

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Sets password resets to expired based on age.'

    def add_arguments(self, parser):
        parser.add_argument('--min_age_days', type=int, default=1,
                            help="Minimum age in days of password reset objects for expiration.")

    def handle(self, **options):
        min_delta = datetime.timedelta(days=options['min_age_days'])
        max_datetime = datetime.datetime.now(datetime.timezone.utc) - min_delta
        qs = PasswordReset.objects.filter(created_datetime__lte=max_datetime)
        num_expired = qs.count()
        qs.delete()
        logger.info(f"Deleted {num_expired} password resets that were older than "
                    f"{options['min_age_days']} days!")
