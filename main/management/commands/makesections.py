from django.core.management.base import BaseCommand
from main.util import makeSections

class Command(BaseCommand):
		def add_arguments(self, parser):
				parser.add_argument('project_id', type=int)

		def handle(self, **options):
				makeSections(options['project_id'])
