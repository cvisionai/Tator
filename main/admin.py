""" TODO: add documentation for this """
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from rest_framework.authtoken.admin import TokenAdmin

from .models import Organization
from .models import User
from .models import Project
from .models import Membership
from .models import Media
from .models import Localization
from .models import State
from .models import Leaf
from .models import MediaType
from .models import LocalizationType
from .models import StateType
from .models import LeafType
from .models import JobCluster
from .models import Algorithm
from .models import Analysis
from .models import Version

admin.site.register(Organization)
admin.site.register(User, UserAdmin)
admin.site.register(Project)
admin.site.register(Membership)
admin.site.register(Media)
admin.site.register(Localization)
admin.site.register(State)
admin.site.register(Leaf)
admin.site.register(MediaType)
admin.site.register(LocalizationType)
admin.site.register(StateType)
admin.site.register(LeafType)
admin.site.register(JobCluster)
admin.site.register(Algorithm)
admin.site.register(Analysis)
admin.site.register(Version)

TokenAdmin.raw_id_fields = ('user',)
