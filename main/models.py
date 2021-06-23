import json
import os
import traceback

from django.contrib.contenttypes.models import ContentType
from django.contrib.gis.db.models import Model
from django.contrib.gis.db.models import ForeignKey
from django.contrib.gis.db.models import ManyToManyField
from django.contrib.gis.db.models import OneToOneField
from django.contrib.gis.db.models import CharField
from django.contrib.gis.db.models import TextField
from django.contrib.gis.db.models import URLField
from django.contrib.gis.db.models import SlugField
from django.contrib.gis.db.models import BooleanField
from django.contrib.gis.db.models import IntegerField
from django.contrib.gis.db.models import BigIntegerField
from django.contrib.gis.db.models import PositiveIntegerField
from django.contrib.gis.db.models import FloatField
from django.contrib.gis.db.models import DateTimeField
from django.contrib.gis.db.models import PointField
from django.contrib.gis.db.models import FileField
from django.contrib.gis.db.models import FilePathField
from django.contrib.gis.db.models import EmailField
from django.contrib.gis.db.models import PROTECT
from django.contrib.gis.db.models import CASCADE
from django.contrib.gis.db.models import SET_NULL
from django.contrib.gis.geos import Point
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.fields import JSONField
from django.core.validators import MinValueValidator
from django.core.validators import RegexValidator
from django.db.models import FloatField, Transform,UUIDField
from django.db.models.signals import post_save
from django.db.models.signals import pre_delete
from django.db.models.signals import post_delete
from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.conf import settings
from django.forms.models import model_to_dict
from enumfields import Enum
from enumfields import EnumField
from django_ltree.fields import PathField
from django.db import transaction

from .search import TatorSearch
from .download import download_file
from .store import get_tator_store, ObjectStore, get_storage_lookup
from .cognito import TatorCognito

from collections import UserDict

import pytz
import datetime
import logging
import os
import shutil
import uuid

# Load the main.view logger
logger = logging.getLogger(__name__)


class ModelDiffMixin(object):
    """
    A model mixin that tracks model fields' values and provide some useful api
    to know what fields have been changed.

    Based on the code in https://stackoverflow.com/a/13842223.
    """

    @staticmethod
    def _diff(old, new):
        """
        Calculates the difference between two model dicts from the same object after a change was
        applied.
        """
        for name, v in old.items():
            new_v = new[name]
            if name != "attributes" and v != new_v:
                yield (f"_{name}", v, new_v)

        old_attributes = old.get("attributes", {})
        new_attributes = new.get("attributes", {})
        for name, v in new_attributes.items():
            old_v = old_attributes.get(name)
            if v != old_v:
                yield (name, old_v, v)

    @property
    def model_dict(self):
        """
        Returns the dictionary representation of the model for comparison.
        """
        model_fields = [field.name for field in self._meta.fields]
        model_dict = model_to_dict(self, fields=model_fields)
        for field in model_fields:
            if (
                field in model_dict
                and self._meta.get_field(field).get_internal_type() == "JSONField"
            ):
                model_dict[field] = dict(model_dict[field]) if model_dict[field] else {}
        for k, v in model_dict.items():
            if type(v) == datetime.datetime:
                model_dict[k] = v.strftime("%Y_%m_%d__%H_%M_%S")
        return model_dict

    @staticmethod
    def _init_change_dict():
        return {"old": [], "new": []}

    def change_dict(self, old):
        """
        Returns the dictionary that is stored in the `description_of_change` field of the ChangeLog
        table.
        """
        change_dict = self._init_change_dict()

        for name, old_val, new_val in self._diff(old, self.model_dict):
            change_dict["old"].append({"name": name, "value": old_val})
            change_dict["new"].append({"name": name, "value": new_val})

        return change_dict

    @property
    def delete_dict(self):
        """
        Returns the dictionary that is stored in the `description_of_change` field of the ChangeLog
        table when a row is deleted.
        """
        change_dict = self._init_change_dict()

        old = self.model_dict
        new = {key: None for key in old.keys() if key != "attributes"}
        new["attributes"] = {key: None for key in old.get("attributes", {})}

        for name, old_val, new_val in self._diff(old, new):
            change_dict["old"].append({"name": name, "value": old_val})
            change_dict["new"].append({"name": name, "value": new_val})

        return change_dict

    @property
    def create_dict(self):
        """
        Returns the dictionary that is stored in the `description_of_change` field of the ChangeLog
        table when a row is created.
        """
        change_dict = self._init_change_dict()

        new = self.model_dict
        old = {key: None for key in new.keys() if key != "attributes"}
        old["attributes"] = {key: None for key in new.get("attributes", {})}

        for name, old_val, new_val in self._diff(old, new):
            change_dict["old"].append({"name": name, "value": old_val})
            change_dict["new"].append({"name": name, "value": new_val})

        return change_dict


class Depth(Transform):
    lookup_name = "depth"
    function = "nlevel"

    @property
    def output_field(self):
        return IntegerField()

PathField.register_lookup(Depth)

FileFormat= [('mp4','mp4'), ('webm','webm'), ('mov', 'mov')]
ImageFileFormat= [('jpg','jpg'), ('png','png'), ('bmp', 'bmp'), ('raw', 'raw')]

## Describes different association models in the database
AssociationTypes = [('Media','Relates to one or more media items'),
                    ('Frame', 'Relates to a specific frame in a video'), #Relates to one or more frames in a video
                    ('Localization', 'Relates to localization(s)')] #Relates to one-to-many localizations

class MediaAccess(Enum):
    VIEWABLE = 'viewable'
    DOWNLOADABLE = 'downloadable'
    ARCHIVAL = 'archival'
    REMOVE = 'remove'

class Marker(Enum):
    NONE = 'none'
    CROSSHAIR = 'crosshair'
    SQUARE = 'square'
    CIRCLE = 'circle'

class InterpolationMethods(Enum):
    NONE = 'none'
    LATEST = 'latest'
    NEAREST = 'nearest'
    LINEAR = 'linear'
    SPLINE = 'spline'

class JobResult(Enum):
    FINISHED = 'finished'
    FAILED = 'failed'

class JobStatus(Enum): # Keeping for migration compatiblity
    pass

class JobChannel(Enum): # Keeping for migration compatiblity
    pass

class Permission(Enum):
    VIEW_ONLY = 'r'
    CAN_EDIT = 'w'
    CAN_TRANSFER = 't'
    CAN_EXECUTE = 'x'
    FULL_CONTROL = 'a'

class HistogramPlotType(Enum):
    PIE = 'pie'
    BAR = 'bar'

class TwoDPlotType(Enum):
    LINE = 'line'
    SCATTER = 'scatter'

class Organization(Model):
    name = CharField(max_length=128)
    def user_permission(self, user_id):
        permission = None
        qs = self.affiliation_set.filter(user_id=user_id)
        if qs.exists():
            permission = qs[0].permission
        return permission
    def __str__(self):
        return self.name

class TatorUserManager(UserManager):
    def get_or_create_for_cognito(self, payload):
        cognito_id = payload['sub']

        try:
            return self.get(cognito_id=cognito_id)
        except self.model.DoesNotExist:
            pass

        first_name = payload['given_name']
        last_name = payload['family_name']
        initials = f"{first_name[0]}{last_name[0]}"
        user = User(
            username=payload['email'],
            cognito_id=cognito_id,
            first_name=first_name,
            last_name=last_name,
            initials=initials,
            email=payload['email'],
            is_active=True)
        user.save()

        return user

class User(AbstractUser):
    objects=TatorUserManager()
    cognito_id = UUIDField(primary_key=False,db_index=True,null=True,blank=True, editable=False)
    middle_initial = CharField(max_length=1)
    initials = CharField(max_length=3)
    last_login = DateTimeField(null=True, blank=True)
    last_failed_login = DateTimeField(null=True, blank=True)
    failed_login_count = IntegerField(default=0)
    confirmation_token = UUIDField(primary_key=False, db_index=True, null=True, blank=True)
    """ Used for email address confirmation for anonymous registrations. """

    def move_to_cognito(self, email_verified=False, temp_pw=None):
        cognito = TatorCognito()
        response = cognito.create_user(self, email_verified, temp_pw)
        for attribute in response['User']['Attributes']:
            if attribute['Name'] == 'sub':
                self.cognito_id = attribute['Value']
        self.save()

    def set_password_cognito(self, password, permanent=False):
        cognito = TatorCognito()
        cognito.set_password(self, password, permanent)

    def reset_password_cognito(self):
        cognito = TatorCognito()
        cognito.reset_password(self)

    def set_password(self, password):
        super().set_password(password)
        if os.getenv('COGNITO_ENABLED') == 'TRUE':
            self.set_password_cognito(password, True)

    def __str__(self):
        if self.first_name or self.last_name:
            return f"{self.first_name} {self.last_name}"
        else:
            return f"{self.username}"

@receiver(post_save, sender=User)
def user_save(sender, instance, created, **kwargs):
    if os.getenv('COGNITO_ENABLED') == 'TRUE':
        if created:
            instance.move_to_cognito()
        else:
            TatorCognito().update_attributes(instance)
    if created:
        invites = Invitation.objects.filter(email=instance.email, status='Pending')
        if invites.count() == 0:
            organization = Organization.objects.create(name=f"{instance}'s Team")
            Affiliation.objects.create(organization=organization,
                                       user=instance,
                                       permission='Admin')

class PasswordReset(Model):
    user = ForeignKey(User, on_delete=CASCADE)
    reset_token = UUIDField(primary_key=False, db_index=True, editable=False,
                            default=uuid.uuid1)
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)

class Invitation(Model):
    email = EmailField()
    organization = ForeignKey(Organization, on_delete=CASCADE)
    permission = CharField(max_length=16,
                           choices=[('Member', 'Member'), ('Admin', 'Admin')],
                           default='Member')
    registration_token = UUIDField(primary_key=False, db_index=True, editable=False,
                                   default=uuid.uuid1)
    status = CharField(max_length=16,
                       choices=[('Pending', 'Pending'), ('Expired', 'Expired'),
                                ('Accepted', 'Accepted')],
                       default='Pending')
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True)
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        return (f'{self.email} | {self.organization} | {self.created_by} | '
                f'{self.created_datetime} | {self.status}')

class Affiliation(Model):
    """Stores a user and their permissions in an organization.
    """
    organization = ForeignKey(Organization, on_delete=CASCADE)
    user = ForeignKey(User, on_delete=CASCADE)
    permission = CharField(max_length=16,
                           choices=[('Member', 'Member'), ('Admin', 'Admin')],
                           default='Member')
    def __str__(self):
        return f'{self.user} | {self.organization}'

class Bucket(Model):
    """ Stores info required for remote S3 buckets.
    """
    organization = ForeignKey(Organization, on_delete=SET_NULL, null=True, blank=True)
    name = CharField(max_length=63)
    access_key = CharField(max_length=128, null=True, blank=True)
    secret_key = CharField(max_length=40, null=True, blank=True)
    endpoint_url = CharField(max_length=1024, null=True, blank=True)
    region = CharField(max_length=16, null=True, blank=True)
    archive_sc = CharField(
        max_length=16,
        choices=[
            ("STANDARD", "STANDARD"),
            ("DEEP_ARCHIVE", "DEEP_ARCHIVE"),
            ("COLDLINE", "COLDLINE"),
        ],
    )
    live_sc = CharField(max_length=16, choices=[("STANDARD", "STANDARD")])
    gcs_key_info = TextField(null=True, blank=True)

    @classmethod
    def validate_kwargs(cls, **kwargs):
        """ Checks for the existence of keys that define S3 or GCS access, but not both. """
        gcs_keys = "gcs_key_info" in kwargs
        s3_keys = all(
            key in kwargs for key in ["access_key", "secret_key", "endpoint_url", "region"]
        )

        if gcs_keys == s3_keys:
            raise ValueError(
                f"Must specify S3 or GCS params, not {'both' if gcs_keys else 'neither'}."
            )

        if gcs_keys:
            try:
                json.loads(kwargs["gcs_key_info"])
            except json.JSONDecodeError:
                logger.warning("Received invalid json while creating bucket.")
                raise

    @staticmethod
    def _sc_validator(
        params,
        sc_type,
        valid_storage_classes,
        default_storage_class,
        storage_type,
    ):
        new_params = dict(params)
        storage_class = new_params.setdefault(sc_type, default_storage_class)
        if storage_class not in valid_storage_classes:
            raise ValueError(
                f"{sc_type[:-3].title()} storage class '{storage_class}' invalid for {storage_type} store"
            )

        return new_params

    def validate_storage_classes(self, params):
        """
        Checks for the existence of `live_sc` and `archive_sc` and validates them if they exist. If
        they are invalid for the given `endpoint_url`, raises a `ValueError`. If they do not exist,
        they are set in a copy of the `params` dict and this copy is returned.
        """
        server = get_tator_store(self).server

        if server is ObjectStore.GCP:
            valid_archive_storage_classes = ["STANDARD", "COLDLINE"]
            default_archive_storage_class = "COLDLINE"
            valid_live_storage_classes = ["STANDARD"]
            default_live_storage_class = "STANDARD"
            storage_type = "Google Cloud Storage"
        elif server is ObjectStore.AWS:
            valid_archive_storage_classes = ["STANDARD", "DEEP_ARCHIVE"]
            default_archive_storage_class = "DEEP_ARCHIVE"
            valid_live_storage_classes = ["STANDARD"]
            default_live_storage_class = "STANDARD"
            storage_type = "Amazon AWS"
        elif server is ObjectStore.MINIO:
            valid_archive_storage_classes = ["STANDARD"]
            default_archive_storage_class = "STANDARD"
            valid_live_storage_classes = ["STANDARD"]
            default_live_storage_class = "STANDARD"
            storage_type = "MinIO"
        else:
            raise ValueError(f"Found unknown server type {server}")

        new_params = self._sc_validator(
            params,
            "archive_sc",
            valid_archive_storage_classes,
            default_archive_storage_class,
            storage_type,
        )
        return self._sc_validator(
            new_params,
            "live_sc",
            valid_live_storage_classes,
            default_live_storage_class,
            storage_type,
        )


class Project(Model):
    name = CharField(max_length=128)
    creator = ForeignKey(User, on_delete=PROTECT, related_name='creator', db_column='creator')
    organization = ForeignKey(Organization, on_delete=SET_NULL, null=True, blank=True, db_column='organization')
    created = DateTimeField(auto_now_add=True)
    size = BigIntegerField(default=0)
    """Size of all media in project in bytes.
    """
    num_files = IntegerField(default=0)
    duration = BigIntegerField(default=0)
    """ Duration of all videos in this project.
    """
    summary = CharField(max_length=1024)
    filter_autocomplete = JSONField(null=True, blank=True)
    attribute_type_uuids = JSONField(default=dict, null=True, blank=True)
    enable_downloads = BooleanField(default=True)
    thumb = CharField(max_length=1024, null=True, blank=True)
    usernames = ArrayField(CharField(max_length=256), default=list)
    """ Mapping between attribute type names and UUIDs. Used internally for
        maintaining elasticsearch field aliases.
    """
    bucket = ForeignKey(Bucket, null=True, blank=True, on_delete=SET_NULL)
    """ If set, media will use this bucket by default.
    """
    default_media = ForeignKey('MediaType', null=True, blank=True, on_delete=SET_NULL,
                               related_name='+')
    """ Default media type for uploads.
    """
    def has_user(self, user_id):
        return self.membership_set.filter(user_id=user_id).exists()
    def user_permission(self, user_id):
        permission = None
        qs = self.membership_set.filter(user_id=user_id)
        if qs.exists():
            permission = qs[0].permission
        return permission
    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        Version.objects.filter(project=self).delete()
        MediaType.objects.filter(project=self).delete()
        LocalizationType.objects.filter(project=self).delete()
        StateType.objects.filter(project=self).delete()
        LeafType.objects.filter(project=self).delete()
        super().delete(*args, **kwargs)

class Version(Model):
    name = CharField(max_length=128)
    description = CharField(max_length=1024, blank=True)
    number = IntegerField()
    project = ForeignKey(Project, on_delete=CASCADE)
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True, related_name='version_created_by')
    show_empty = BooleanField(default=True)
    """ Tells the UI to show this version even if the current media does not
        have any annotations.
    """
    bases = ManyToManyField('self', symmetrical=False, blank=True)
    """ This version is a patch to an existing version. A use-case here is using one version
        for each generation of a state-based inference algorithm; all referencing localizations
        in another layer.
    """

    def __str__(self):
        out = f"{self.name}"
        if self.description:
            out += f" | {self.description}"
        return out

def make_default_version(instance):
    return Version.objects.create(
        name="Baseline",
        description="Initial version",
        project=instance,
        number=0,
        show_empty=True,
    )

@receiver(post_save, sender=Project)
def project_save(sender, instance, created, **kwargs):
    TatorSearch().create_index(instance.pk)
    if created:
        make_default_version(instance)
    if instance.thumb:
        Resource.add_resource(instance.thumb, None)

@receiver(post_delete, sender=Project)
def project_delete(sender, instance, **kwargs):
    if instance.thumb:
        safe_delete(instance.thumb)

@receiver(pre_delete, sender=Project)
def delete_index_project(sender, instance, **kwargs):
    TatorSearch().delete_index(instance.pk)

class Membership(Model):
    """Stores a user and their access level for a project.
    """
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    user = ForeignKey(User, on_delete=PROTECT, db_column='user')
    permission = EnumField(Permission, max_length=1, default=Permission.CAN_EDIT)
    default_version = ForeignKey(Version, null=True, blank=True, on_delete=SET_NULL)
    def __str__(self):
        return f'{self.user} | {self.permission} | {self.project}'

def getVideoDefinition(path, codec, resolution, **kwargs):
    """ Convenience function to generate video definiton dictionary """
    obj = {"path": path,
           "codec": codec,
           "resolution": resolution}
    for arg in kwargs:
        if arg in ["segment_info",
                   "host",
                   "http_auth",
                   "codec_meme",
                   "codec_description"]:
            obj[arg] = kwargs[arg]
        else:
            raise TypeError(f"Invalid argument '{arg}' supplied")
    return obj

def ProjectBasedFileLocation(instance, filename):
    return os.path.join(f"{instance.project.id}", filename)

class JobCluster(Model):
    name = CharField(max_length=128)
    organization = ForeignKey(Organization, null=True, blank=True, on_delete=SET_NULL)
    host = CharField(max_length=1024)
    port = PositiveIntegerField()
    token = CharField(max_length=1024)
    cert = TextField(max_length=2048)

    def __str__(self):
        return self.name

# Algorithm models

class Algorithm(Model):
    name = CharField(max_length=128)
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    user = ForeignKey(User, on_delete=PROTECT, db_column='user')
    description = CharField(max_length=1024, null=True, blank=True)
    manifest = FileField(upload_to=ProjectBasedFileLocation, null=True, blank=True)
    cluster = ForeignKey(JobCluster, null=True, blank=True, on_delete=SET_NULL, db_column='cluster')
    files_per_job = PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1),]
    )
    categories = ArrayField(CharField(max_length=128), default=list, null=True)
    parameters = JSONField(default=list, null=True, blank=True)

    def __str__(self):
        return self.name

class TemporaryFile(Model):
    """ Represents a temporary file in the system, can be used for algorithm results or temporary outputs """
    name = CharField(max_length=128)
    """ Human readable name for display purposes """
    project = ForeignKey(Project, on_delete=CASCADE)
    """ Project the temporary file resides in """
    user = ForeignKey(User, on_delete=PROTECT)
    """ User who created the temporary file """
    path = FilePathField(path=settings.MEDIA_ROOT, null=True, blank=True)
    """ Path to file on storage """
    lookup = SlugField(max_length=256)
    """ unique lookup (md5sum of something useful) """
    created_datetime = DateTimeField()
    """ Time that the file was created """
    eol_datetime = DateTimeField()
    """ Time the file expires (reaches EoL) """

    def expire(self):
        """ Set a given temporary file as expired """
        past = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        past = pytz.timezone("UTC").localize(past)
        self.eol_datetime = past
        self.save()

    def from_local(path, name, project, user, lookup, hours, is_upload=False):
        """ Given a local file create a temporary file storage object
        :returns A saved TemporaryFile:
        """
        extension = os.path.splitext(name)[-1]
        destination_fp=os.path.join(settings.MEDIA_ROOT, f"{project.id}", f"{uuid.uuid1()}{extension}")
        os.makedirs(os.path.dirname(destination_fp), exist_ok=True)
        if is_upload:
            download_file(path, destination_fp)
        else:
            shutil.copyfile(path, destination_fp)

        now = datetime.datetime.utcnow()
        eol =  now + datetime.timedelta(hours=hours)

        temp_file = TemporaryFile(name=name,
                                  project=project,
                                  user=user,
                                  path=destination_fp,
                                  lookup=lookup,
                                  created_datetime=now,
                                  eol_datetime = eol)
        temp_file.save()
        return temp_file

@receiver(pre_delete, sender=TemporaryFile)
def temporary_file_delete(sender, instance, **kwargs):
    if os.path.exists(instance.path):
        os.remove(instance.path)

# Entity types

class MediaType(Model):
    dtype = CharField(max_length=16, choices=[('image', 'image'), ('video', 'video'), ('multi','multi'), ('live','live')])
    project = ForeignKey(Project, on_delete=CASCADE, null=True, blank=True, db_column='project')
    name = CharField(max_length=64)
    description = CharField(max_length=256, blank=True)
    visible = BooleanField(default=True)
    """ Whether this type should be displayed in the UI."""
    editTriggers = JSONField(null=True,
                             blank=True)
    file_format = CharField(max_length=4,
                            null=True,
                            blank=True,
                            default=None)
    default_volume = IntegerField(default=0)
    """ Default Volume for Videos (default is muted) """
    attribute_types = JSONField(default=list, null=True, blank=True)
    """ User defined attributes.

        An array of objects, each containing the following fields:

        name: Name of the attribute.
        description: (optional) Description of the attribute.
        order: Order that the attribute should appear in web UI. Negative means
               do not display.
        dtype: Data type of the attribute. Valid values are bool, int, float,
               string, enum, datetime, geopos.
        default: (optional) Default value. Valid for all dtypes except datetime.
                 The type should correspond to the dtype (string/enum are strings,
                 int/float are numbers, geopos is a [lon, lat] list).
        minimum: (optional) Minimum value. Valid for int and float dtypes.
        maximum: (optional) Maximum value. Valid for int and float dtypes.
        choices: (optional) Available choices for enum dtype.
        labels: (optional) Labels for available choices for enum dtype.
        autocomplete: (optional) Object of the form {'serviceUrl': '<url>'} that
                      specifies URL of the autocomplete service. Valid for string
                      dtype only.
        use_current: (optional) Boolean indicating whether to use the current time
                     as the default for datetime dtype.
        style: (optional) String of GUI-related styles.
    """
    archive_config = JSONField(default=None, null=True, blank=True)
    streaming_config = JSONField(default=None, null=True,blank=True)
    overlay_config = JSONField(default=None,null=True,blank=True)
    """
    Overlay configuration provides text overlay on video / image based on
    configruation examples:
    Example: {"mode": "constant", "source": "name"} Overlays file name
    Time example:
             {"mode": "datetime", "locale": [locale], "options" : [options]}
            options can contain 'timeZone' which comes from the TZ database name
            https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
            Example: America/Los_Angeles or America/New_York

    Overlay can optionally be a list of multiple overlays
    """
    default_box = ForeignKey('LocalizationType', null=True, blank=True, on_delete=SET_NULL,
                             related_name='+')
    """ Box type used as default in UI. """
    default_line = ForeignKey('LocalizationType', null=True, blank=True, on_delete=SET_NULL,
                             related_name='+')
    """ Line type used as default in UI. """
    default_dot = ForeignKey('LocalizationType', null=True, blank=True, on_delete=SET_NULL,
                             related_name='+')
    """ Dot type used as default in UI. """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=MediaType)
def media_type_save(sender, instance, **kwargs):
    TatorSearch().create_mapping(instance)

class LocalizationType(Model):
    dtype = CharField(max_length=16,
                      choices=[('box', 'box'), ('line', 'line'), ('dot', 'dot')])
    project = ForeignKey(Project, on_delete=CASCADE, null=True, blank=True, db_column='project')
    name = CharField(max_length=64)
    description = CharField(max_length=256, blank=True)
    visible = BooleanField(default=True)
    """ Whether this type should be displayed in the UI."""
    drawable = BooleanField(default=True)
    """ Whether this type can be drawn in the UI."""
    grouping_default = BooleanField(default=True)
    """ Whether to group elements in the UI by default."""
    media = ManyToManyField(MediaType)
    colorMap = JSONField(null=True, blank=True)
    line_width = PositiveIntegerField(default=3)
    attribute_types = JSONField(default=list, null=True, blank=True)
    """ User defined attributes.

        An array of objects, each containing the following fields:

        name: Name of the attribute.
        description: Description of the attribute.
        order: Order that the attribute should appear in web UI. Negative means
               do not display.
        dtype: Data type of the attribute. Valid values are bool, int, float,
               string, enum, datetime, geopos.
        default: (optional) Default value. Valid for all dtypes except datetime.
                 The type should correspond to the dtype (string/enum are strings,
                 int/float are numbers, geopos is a [lon, lat] list).
        minimum: (optional) Minimum value. Valid for int and float dtypes.
        maximum: (optional) Maximum value. Valid for int and float dtypes.
        choices: (optional) Available choices for enum dtype.
        labels: (optional) Labels for available choices for enum dtype.
        autocomplete: (optional) Object of the form {'serviceUrl': '<url>'} that
                      specifies URL of the autocomplete service. Valid for string
                      dtype only.
        use_current: (optional) Boolean indicating whether to use the current time
                     as the default for datetime dtype.
        style: (optional) String of GUI-related styles.
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=LocalizationType)
def localization_type_save(sender, instance, **kwargs):
    TatorSearch().create_mapping(instance)

class StateType(Model):
    dtype = CharField(max_length=16, choices=[('state', 'state')], default='state')
    project = ForeignKey(Project, on_delete=CASCADE, null=True, blank=True, db_column='project')
    name = CharField(max_length=64)
    description = CharField(max_length=256, blank=True)
    visible = BooleanField(default=True)
    """ Whether this type should be displayed in the UI."""
    grouping_default = BooleanField(default=True)
    """ Whether to group elements in the UI by default."""
    media = ManyToManyField(MediaType)
    interpolation = CharField(max_length=16,
                              choices=[('none', 'none'), ('latest', 'latest')],
                              default='latest')
    association = CharField(max_length=64,
                            choices=AssociationTypes,
                            default=AssociationTypes[0][0])
    attribute_types = JSONField(default=list, null=True, blank=True)
    """ User defined attributes.

        An array of objects, each containing the following fields:

        name: Name of the attribute.
        description: Description of the attribute.
        order: Order that the attribute should appear in web UI. Negative means
               do not display.
        dtype: Data type of the attribute. Valid values are bool, int, float,
               string, enum, datetime, geopos.
        default: (optional) Default value. Valid for all dtypes except datetime.
                 The type should correspond to the dtype (string/enum are strings,
                 int/float are numbers, geopos is a [lon, lat] list).
        minimum: (optional) Minimum value. Valid for int and float dtypes.
        maximum: (optional) Maximum value. Valid for int and float dtypes.
        choices: (optional) Available choices for enum dtype.
        labels: (optional) Labels for available choices for enum dtype.
        autocomplete: (optional) Object of the form {'serviceUrl': '<url>'} that
                      specifies URL of the autocomplete service. Valid for string
                      dtype only.
        use_current: (optional) Boolean indicating whether to use the current time
                     as the default for datetime dtype.
        style: (optional) String of GUI-related styles.
    """
    delete_child_localizations = BooleanField(default=False)
    """ If enabled, child localizations will be deleted when states of this
        type are deleted.
    """
    default_localization = ForeignKey(LocalizationType, on_delete=SET_NULL, null=True,
                                      blank=True, related_name='+')
    """ If this is a track type, this is the default localization that is created when
        a track is created via the UI.
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=StateType)
def state_type_save(sender, instance, **kwargs):
    TatorSearch().create_mapping(instance)

class LeafType(Model):
    dtype = CharField(max_length=16, choices=[('leaf', 'leaf')], default='leaf')
    project = ForeignKey(Project, on_delete=CASCADE, null=True, blank=True, db_column='project')
    name = CharField(max_length=64)
    description = CharField(max_length=256, blank=True)
    visible = BooleanField(default=True)
    """ Whether this type should be displayed in the UI."""
    attribute_types = JSONField(null=True, blank=True)
    """ User defined attributes.

        An array of objects, each containing the following fields:

        name: Name of the attribute.
        description: Description of the attribute.
        order: Order that the attribute should appear in web UI. Negative means
               do not display.
        dtype: Data type of the attribute. Valid values are bool, int, float,
               string, enum, datetime, geopos.
        default: (optional) Default value. Valid for all dtypes except datetime.
                 The type should correspond to the dtype (string/enum are strings,
                 int/float are numbers, geopos is a [lon, lat] list).
        minimum: (optional) Minimum value. Valid for int and float dtypes.
        maximum: (optional) Maximum value. Valid for int and float dtypes.
        choices: (optional) Available choices for enum dtype.
        labels: (optional) Labels for available choices for enum dtype.
        autocomplete: (optional) Object of the form {'serviceUrl': '<url>'} that
                      specifies URL of the autocomplete service. Valid for string
                      dtype only.
        use_current: (optional) Boolean indicating whether to use the current time
                     as the default for datetime dtype.
        style: (optional) String of GUI-related styles.
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=LeafType)
def leaf_type_save(sender, instance, **kwargs):
    TatorSearch().create_mapping(instance)


# Entities (stores actual data)

class Media(Model, ModelDiffMixin):
    """
    Fields:

    original: Originally uploaded file. Users cannot interact with it except
              by downloading it.

              .. deprecated :: Use media_files object

    segment_info: File for segment files to support MSE playback.

                  .. deprecated :: Use meda_files instead

    media_files: Dictionary to contain a map of all files for this media.
                 The schema looks like this:

                 .. code-block ::

                     map = {"archival": [ VIDEO_DEF, VIDEO_DEF,... ],
                            "streaming": [ VIDEO_DEF, VIDEO_DEF, ... ],
                            <"audio": [AUDIO_DEF]>}
                     video_def = {"path": <path_to_disk>,
                                  "codec": <human readable codec>,
                                  "resolution": [<vertical pixel count, e.g. 720>, width]
                     audio_def = {"path": <path_to_disk>,
                                  "codec": <human readable codec>}


                                  ###################
                                  # Optional Fields #
                                  ###################

                                  # Path to the segments.json file for streaming files.
                                  # not expected/required for archival. Required for
                                  # MSE playback with seek support for streaming files.
                                  segment_info = <path_to_json>

                                  # If supplied will use this instead of currently
                                  # connected host. e.g. https://example.com
                                  "host": <host url>
                                  # If specified will be used for HTTP authorization
                                  # in the request for media. I.e. "bearer <token>"
                                  "http_auth": <http auth header>

                                  # Example mime: 'video/mp4; codecs="avc1.64001e"'
                                  # Only relevant for straming files, will assume
                                  # example above if not present.
                                  "codec_mime": <mime for MSE decode>

                                  "codec_description": <description other than codec>}


    """
    project = ForeignKey(Project, on_delete=SET_NULL, null=True, blank=True,
                         db_column='project', related_name='media_project')
    meta = ForeignKey(MediaType, on_delete=SET_NULL, null=True, blank=True, db_column='meta')
    """ Meta points to the defintion of the attribute field. That is
        a handful of AttributeTypes are associated to a given MediaType
        that is pointed to by this value. That set describes the `attribute`
        field of this structure. """
    attributes = JSONField(null=True, blank=True)
    """ Values of user defined attributes. """
    gid = CharField(max_length=36, null=True, blank=True)
    """ Group ID for the upload that created this media. Note we intentionally do
        not use UUIDField because this field is provided by the uploader and not
        guaranteed to be an actual UUID. """
    uid = CharField(max_length=36, null=True, blank=True)
    """ Unique ID for the upload that created this media. Note we intentionally do
        not use UUIDField because this field is provided by the uploader and not
        guaranteed to be an actual UUID. """
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                            related_name='media_created_by', db_column='created_by')
    modified_datetime = DateTimeField(auto_now=True, null=True, blank=True)
    modified_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                             related_name='media_modified_by', db_column='modified_by')
    name = CharField(max_length=256, db_index=True)
    md5 = SlugField(max_length=32)
    """ md5 hash of the originally uploaded file. """
    last_edit_start = DateTimeField(null=True, blank=True)
    """ Start datetime of a session in which the media's annotations were edited.
    """
    last_edit_end = DateTimeField(null=True, blank=True)
    """ End datetime of a session in which the media's annotations were edited.
    """
    num_frames = IntegerField(null=True, blank=True)
    fps = FloatField(null=True, blank=True)
    codec = CharField(null=True, blank=True, max_length=256)
    width=IntegerField(null=True)
    height=IntegerField(null=True)
    media_files = JSONField(null=True, blank=True)
    deleted = BooleanField(default=False)
    restoration_requested = BooleanField(default=False)
    archive_state = CharField(
        max_length=16,
        choices=[
            ("live", "live"),
            ("to_live", "to_live"),
            ("archived", "archived"),
            ("to_archive", "to_archive"),
        ],
        default="live",
    )
    recycled_from = ForeignKey(
        Project, on_delete=SET_NULL, null=True, blank=True, related_name='recycled_from'
    )

    def get_file_sizes(self):
        """ Returns total size and download size for this media object.
        """
        total_size = 0
        download_size = None
        if not self.media_files:
            return (total_size, download_size)

        resources = Resource.objects.filter(media__in=[self])
        store_lookup = get_storage_lookup(resources)
        store_default = get_tator_store(self.project.bucket)

        for key in ["archival", "streaming", "image", "audio", "thumbnail", "thumbnail_gif", "attachment"]:
            if key not in self.media_files:
                continue

            for media_def in self.media_files[key]:
                tator_store = store_lookup.get(media_def["path"], store_default)
                size = tator_store.get_size(media_def["path"])
                total_size += size
                if key in ["archival", "streaming", "image"] and download_size is None:
                    download_size = size
                if key == "streaming":
                    total_size += tator_store.get_size(media_def.get('segment_info'))
        return (total_size, download_size)

class Resource(Model):
    path = CharField(db_index=True, max_length=256)
    media = ManyToManyField(Media, related_name='resource_media')
    bucket = ForeignKey(Bucket, on_delete=PROTECT, null=True, blank=True)

    @transaction.atomic
    def add_resource(path_or_link, media):
        if os.path.islink(path_or_link):
            path = os.readlink(path_or_link)
        else:
            path = path_or_link
        if media is None:
            obj, created = Resource.objects.get_or_create(path=path, bucket=None)
        else:
            obj, created = Resource.objects.get_or_create(path=path, bucket=media.project.bucket)
            obj.media.add(media)

    @transaction.atomic
    def delete_resource(path_or_link):
        path=path_or_link
        if os.path.exists(path_or_link):
            if os.path.islink(path_or_link):
                path=os.readlink(path_or_link)
                os.remove(path_or_link)
        obj = Resource.objects.get(path=path)
        if obj.media.all().count() == 0:
            logger.info(f"Deleting object {path}")
            obj.delete()
            tator_store = get_tator_store(obj.bucket)
            tator_store.delete_object(path)

    @transaction.atomic
    def archive_resource(path):
        """
        Moves the object into archive storage. If True is returned by every call to
        Resource.archive_resource on each path in a media object, the following should be executed
        by the management command that called this method:

            media.archive_state = "archived"
            media.save()
        """
        obj = Resource.objects.get(path=path)
        logger.info(f"Archiving object {path}")
        bucket = obj.bucket
        tator_store = get_tator_store(bucket)
        return tator_store.archive_object(path, bucket.archive_sc if bucket else "")


    @transaction.atomic
    def request_restoration(path, min_exp_days):
        """
        Requests object restortation from archive storage. If True is returned by every call to
        Resource.request_restoration on each path in a media object, the following should be
        executed by the management command that called this method:

            media.restoration_requested = True
            media.save()
        """
        obj = Resource.objects.get(path=path)
        logger.info(f"Requesting restoration of object {path}")
        bucket = obj.bucket
        tator_store = get_tator_store(bucket)
        return tator_store.request_restoration(path, bucket.live_sc if bucket else "", min_exp_days)

    @transaction.atomic
    def restore_resource(path):
        """
        Performs the final copy operation that makes a restoration request permanent. Returns True
        if the copy operation succeeds or if it has succeeded previously. If True is returned by
        every call to Resource.restore_resource on each path in a media object, the following should
        be executed by the management command that called this method:

            media.restoration_requested = False
            media.archive_state = "live"
            media.save()
        """
        obj = Resource.objects.get(path=path)
        logger.info(f"Restoring object {path}")
        bucket = obj.bucket
        tator_store = get_tator_store(bucket)
        if bucket:
            archive_sc = bucket.archive_sc
            live_sc = bucket.live_sc
        else:
            archive_sc = ""
            live_sc = ""
        return tator_store.restore_resource(path, archive_sc, live_sc)


@receiver(post_save, sender=Media)
def media_save(sender, instance, created, **kwargs):
    TatorSearch().create_document(instance)
    if instance.media_files and created:
        for key in ['streaming', 'archival', 'audio', 'image', 'thumbnail', 'thumbnail_gif', 'attachment']:
            for fp in instance.media_files.get(key, []):
                Resource.add_resource(fp['path'], instance)
                if key == 'streaming':
                    Resource.add_resource(fp['segment_info'], instance)

def safe_delete(path):
    try:
        logger.info(f"Deleting resource for {path}")
        Resource.delete_resource(path)
    except:
        logger.warning(f"Could not remove {path}")
        logger.warning(f"{traceback.format_exc()}")

def drop_media_from_resource(path, media):
    """ Drops the specified media from the resource. This should be called when
        removing a resource from a Media object's media_files but the Media is
        not being deleted.
    """
    try:
        logger.info(f"Dropping media {media} from resource {path}")
        obj = Resource.objects.get(path=path)
        obj.media.remove(media)
    except:
        logger.warning(f"Could not remove {media} from {path}")
        logger.warning(f"{traceback.format_exc()}")

@receiver(pre_delete, sender=Media)
def media_delete(sender, instance, **kwargs):
    if instance.project:
        TatorSearch().delete_document(instance)

@receiver(post_delete, sender=Media)
def media_post_delete(sender, instance, **kwargs):
    # Delete all the files referenced in media_files
    if not instance.media_files is None:
        for key in ['streaming', 'archival', 'audio', 'image', 'thumbnail', 'thumbnail_gif', 'attachment']:
            files = instance.media_files.get(key, [])
            if files is None:
                files = []
            for obj in files:
                path = obj['path']
                safe_delete(path)
                if key == 'streaming':
                    path = obj['segment_info']
                    safe_delete(path)

class Localization(Model, ModelDiffMixin):
    project = ForeignKey(Project, on_delete=SET_NULL, null=True, blank=True, db_column='project')
    meta = ForeignKey(LocalizationType, on_delete=SET_NULL, null=True, blank=True, db_column='meta')
    """ Meta points to the defintion of the attribute field. That is
        a handful of AttributeTypes are associated to a given LocalizationType
        that is pointed to by this value. That set describes the `attribute`
        field of this structure. """
    attributes = JSONField(null=True, blank=True)
    """ Values of user defined attributes. """
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                            related_name='localization_created_by', db_column='created_by')
    modified_datetime = DateTimeField(auto_now=True, null=True, blank=True)
    modified_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                             related_name='localization_modified_by', db_column='modified_by')
    user = ForeignKey(User, on_delete=PROTECT, db_column='user')
    media = ForeignKey(Media, on_delete=SET_NULL, null=True, blank=True, db_column='media')
    frame = PositiveIntegerField(null=True, blank=True)
    thumbnail_image = ForeignKey(Media, on_delete=SET_NULL,
                                 null=True, blank=True,
                                 related_name='localization_thumbnail_image',
                                 db_column='thumbnail_image')
    version = ForeignKey(Version, on_delete=SET_NULL, null=True, blank=True, db_column='version')
    modified = BooleanField(default=True, null=True, blank=True)
    """ Indicates whether an annotation is original or modified.
        null: Original upload, no modifications.
        false: Original upload, but was modified or deleted.
        true: Modified since upload or created via web interface.
    """
    x = FloatField(null=True, blank=True)
    """ Horizontal position."""
    y = FloatField(null=True, blank=True)
    """ Vertical position."""
    u = FloatField(null=True, blank=True)
    """ Horizontal vector component for lines."""
    v = FloatField(null=True, blank=True)
    """ Vertical vector component for lines. """
    width = FloatField(null=True, blank=True)
    """ Width for boxes."""
    height = FloatField(null=True, blank=True)
    """ Height for boxes."""
    parent = ForeignKey("self", on_delete=SET_NULL, null=True, blank=True,db_column='parent')
    """ Pointer to localization in which this one was generated from """
    deleted = BooleanField(default=False)

@receiver(post_save, sender=Localization)
def localization_save(sender, instance, created, **kwargs):
    if getattr(instance,'_inhibit', False) == False:
        TatorSearch().create_document(instance)
    else:
        pass

@receiver(pre_delete, sender=Localization)
def localization_delete(sender, instance, **kwargs):
    TatorSearch().delete_document(instance)
    if instance.thumbnail_image:
        instance.thumbnail_image.delete()

class State(Model, ModelDiffMixin):
    """
    A State is an event that occurs, potentially independent, from that of
    a media element. It is associated with 0 (1 to be useful) or more media
    elements. If a frame is supplied it was collected at that time point.
    """
    project = ForeignKey(Project, on_delete=SET_NULL, null=True, blank=True, db_column='project')
    meta = ForeignKey(StateType, on_delete=SET_NULL, null=True, blank=True, db_column='meta')
    """ Meta points to the defintion of the attribute field. That is
        a handful of AttributeTypes are associated to a given EntityType
        that is pointed to by this value. That set describes the `attribute`
        field of this structure. """
    attributes = JSONField(null=True, blank=True)
    """ Values of user defined attributes. """
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                            related_name='state_created_by', db_column='created_by')
    modified_datetime = DateTimeField(auto_now=True, null=True, blank=True)
    modified_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                             related_name='state_modified_by', db_column='modified_by')
    version = ForeignKey(Version, on_delete=SET_NULL, null=True, blank=True, db_column='version')
    modified = BooleanField(default=True, null=True, blank=True)
    """ Indicates whether an annotation is original or modified.
        null: Original upload, no modifications.
        false: Original upload, but was modified or deleted.
        true: Modified since upload or created via web interface.
    """
    media = ManyToManyField(Media, related_name='media')
    localizations = ManyToManyField(Localization)
    segments = JSONField(null=True, blank=True)
    color = CharField(null=True, blank=True, max_length=8)
    frame = PositiveIntegerField(null=True, blank=True)
    extracted = ForeignKey(Media,
                           on_delete=SET_NULL,
                           null=True,
                           blank=True,
                           related_name='extracted',
                           db_column='extracted')
    deleted = BooleanField(default=False)
    def selectOnMedia(media_id):
        return State.objects.filter(media__in=media_id)

@receiver(post_save, sender=State)
def state_save(sender, instance, created, **kwargs):
    TatorSearch().create_document(instance)

@receiver(pre_delete, sender=State)
def state_delete(sender, instance, **kwargs):
    TatorSearch().delete_document(instance)

@receiver(m2m_changed, sender=State.localizations.through)
def calc_segments(sender, **kwargs):
    instance=kwargs['instance']
    sortedLocalizations=Localization.objects.filter(pk__in=instance.localizations.all()).order_by('frame')

    #Bring up related media to association
    instance.media.set(sortedLocalizations.all().values_list('media', flat=True))
    segmentList=[]
    current=[None,None]
    last=None
    for localization in sortedLocalizations:
        if current[0] is None:
            current[0] = localization.frame
            last = current[0]
        else:
            if localization.frame - 1 == last:
                last = localization.frame
            else:
                current[1] = last
                segmentList.append(current.copy())
                current[0] = localization.frame
                current[1] = None
                last = localization.frame
    if current[1] is None:
        current[1] = last
        segmentList.append(current)
    instance.segments = segmentList

class Leaf(Model, ModelDiffMixin):
    project = ForeignKey(Project, on_delete=SET_NULL, null=True, blank=True, db_column='project')
    meta = ForeignKey(LeafType, on_delete=SET_NULL, null=True, blank=True, db_column='meta')
    """ Meta points to the defintion of the attribute field. That is
        a handful of AttributeTypes are associated to a given EntityType
        that is pointed to by this value. That set describes the `attribute`
        field of this structure. """
    attributes = JSONField(null=True, blank=True)
    """ Values of user defined attributes. """
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                            related_name='leaf_created_by', db_column='created_by')
    modified_datetime = DateTimeField(auto_now=True, null=True, blank=True)
    modified_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                             related_name='leaf_modified_by', db_column='modified_by')
    parent=ForeignKey('self', on_delete=SET_NULL, blank=True, null=True, db_column='parent')
    path=PathField(unique=True)
    name = CharField(max_length=255)
    deleted = BooleanField(default=False)

    class Meta:
        verbose_name_plural = "Leaves"

    def __str__(self):
        return str(self.path)

    def depth(self):
        return Leaf.objects.annotate(depth=Depth('path')).get(pk=self.pk).depth

    def subcategories(self, minLevel=1):
        return Leaf.objects.select_related('parent').filter(
            path__descendants=self.path,
            path__depth__gte=self.depth()+minLevel
        )

    def computePath(self):
        """ Returns the string representing the path element """
        pathStr=self.name.replace(" ","_").replace("-","_").replace("(","_").replace(")","_")
        if self.parent:
            pathStr=self.parent.computePath()+"."+pathStr
        elif self.project:
            projName=self.project.name.replace(" ","_").replace("-","_").replace("(","_").replace(")","_")
            pathStr=projName+"."+pathStr
        return pathStr

@receiver(post_save, sender=Leaf)
def leaf_save(sender, instance, **kwargs):
    TatorSearch().create_document(instance)

@receiver(pre_delete, sender=Leaf)
def leaf_delete(sender, instance, **kwargs):
    TatorSearch().delete_document(instance)

class Analysis(Model):
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    name = CharField(max_length=64)
    data_query = CharField(max_length=1024, default='*')
    def __str__(self):
        return f"{self.project} | {self.name}"

class Section(Model):
    """ Stores either a lucene search or raw elasticsearch query.
    """
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    name = CharField(max_length=128)
    """ Name of the section.
    """
    lucene_search = CharField(max_length=1024, null=True, blank=True)
    """ Optional lucene query syntax search string.
    """
    media_bools = JSONField(null=True, blank=True)
    """ Optional list of elasticsearch boolean queries that should be applied
        to media. These are applied to the boolean query "filter" list.
    """
    annotation_bools = JSONField(null=True, blank=True)
    """ Optional list of elasticsearch boolean queries that should be applied
        to annotations. These are applied to the boolean query "filter" list.
    """
    tator_user_sections = CharField(max_length=128, null=True, blank=True)
    """ Identifier used to label media that is part of this section via the
        tator_user_sections attribute. If not set, this search is not scoped
        to a "folder".
    """
    visible = BooleanField(default=True)
    """ Whether this section should be displayed in the UI.
    """

class Favorite(Model):
    """ Stores an annotation saved by a user.
    """
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    user = ForeignKey(User, on_delete=CASCADE, db_column='user')
    meta = ForeignKey(LocalizationType, on_delete=CASCADE, db_column='meta')
    name = CharField(max_length=128)
    page = PositiveIntegerField(default=1)
    values = JSONField()

class Bookmark(Model):
    """ Stores a link saved by a user.
    """
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    user = ForeignKey(User, on_delete=CASCADE, db_column='user')
    name = CharField(max_length=128)
    uri = CharField(max_length=1024)

class ChangeLog(Model):
    """ Stores individual changesets for entities """
    project = ForeignKey(Project, on_delete=CASCADE)
    user = ForeignKey(User, on_delete=SET_NULL, null=True)
    modified_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    description_of_change = JSONField()
    """
    The description of the change applied. A single object with the keys `old` and `new`, each
    containing a list of objects with the keys `name` and `value`. Each object in the `old` list
    should have a pair in the `new` list (i.e. the same value in the `name` field) with different
    values in the `value` field. For example:
    {
      old: [{
        name: "Species",
        value: "Lobster"
      }, {
        name: "Length",
        value: 31
      }],
      new: [{
        name: "Species",
        value: "Cod"
      }, {
        name: "Length",
        value: 52
      }]
    }
    """

class ChangeToObject(Model):
    """ Association table that correlates a ChangeLog object to one or more objects """
    ref_table = ForeignKey(ContentType, on_delete=SET_NULL, null=True)
    """ The model of the changed object """
    ref_id = PositiveIntegerField()
    """ The id of the changed object """
    change_id = ForeignKey(ChangeLog, on_delete=SET_NULL, null=True)
    """ The change that affected the object """

class Announcement(Model):
    """ Message that may be displayed to users.
    """
    markdown = CharField(max_length=2048)
    """ This text will be displayed using a markdown parser. """
    created_datetime = DateTimeField(auto_now_add=True)
    eol_datetime = DateTimeField()

class AnnouncementToUser(Model):
    """ Mapping between announcement and user. The presence of a row in this table
        means an announcement should be displayed to the user.
    """
    announcement = ForeignKey(Announcement, on_delete=CASCADE)
    user = ForeignKey(User, on_delete=CASCADE)

def type_to_obj(typeObj):
    """Returns a data object for a given type object"""
    _dict = {
        MediaType: Media,
        LocalizationType: Localization,
        StateType: State,
        LeafType: Leaf,
    }

    if typeObj in _dict:
        return _dict[typeObj]
    else:
        return None

def make_dict(keys, row):
    d={}
    for idx,col in enumerate(keys):
        d[col.name] = row[idx]
    return d

def database_qs(qs):
    return database_query(str(qs.query))

def database_query(query):
    from django.db import connection
    import datetime
    with connection.cursor() as d_cursor:
        cursor = d_cursor.cursor
        bq=datetime.datetime.now()
        cursor.execute(query)
        aq=datetime.datetime.now()
        l=[make_dict(cursor.description, x) for x in cursor]
        af=datetime.datetime.now()
        logger.info(f"Query = {aq-bq}")
        logger.info(f"List = {af-aq}")
    return l

def database_query_ids(table, ids, order):
    """ Given table name and list of IDs, do query using a subquery expression.
        TODO: Is this faster than just using `database_qs()` in conjunction
        with `database_query()`?
    """
    query = (f'SELECT * FROM \"{table}\" WHERE \"{table}\".\"id\" IN '
             f'(VALUES ({"), (".join([str(id_) for id_ in ids])})) '
             f'ORDER BY {order}')
    return database_query(query)
