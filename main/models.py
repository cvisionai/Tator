""" TODO: add documentaion for this """
import os
import traceback
import uuid
import shutil
import logging
import datetime

from django.db import connection
from django.contrib.gis.db.models import Model
from django.contrib.gis.db.models import ForeignKey
from django.contrib.gis.db.models import ManyToManyField
from django.contrib.gis.db.models import OneToOneField
from django.contrib.gis.db.models import CharField
from django.contrib.gis.db.models import TextField
from django.contrib.gis.db.models import SlugField
from django.contrib.gis.db.models import BooleanField
from django.contrib.gis.db.models import IntegerField
from django.contrib.gis.db.models import BigIntegerField
from django.contrib.gis.db.models import PositiveIntegerField
from django.contrib.gis.db.models import FloatField
from django.contrib.gis.db.models import DateTimeField
from django.contrib.gis.db.models import FileField
from django.contrib.gis.db.models import FilePathField
from django.contrib.gis.db.models import ImageField
from django.contrib.gis.db.models import PROTECT
from django.contrib.gis.db.models import CASCADE
from django.contrib.gis.db.models import SET_NULL
from django.contrib.auth.models import AbstractUser
from django.contrib.postgres.fields import JSONField
from django.core.validators import MinValueValidator
from django.db.models import Transform
from django.db.models.signals import post_save
from django.db.models.signals import pre_delete
from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.conf import settings
import pytz
from enumfields import Enum
from enumfields import EnumField
from django_ltree.fields import PathField
from .search import TatorSearch

# Load the main.view logger
logger = logging.getLogger(__name__)

class Depth(Transform):
    """ TODO: add documentation for this """
    lookup_name = "depth"
    function = "nlevel"

    @property
    def output_field(self):
        return IntegerField()

PathField.register_lookup(Depth)

FileFormat = [('mp4', 'mp4'), ('webm', 'webm'), ('mov', 'mov')]
ImageFileFormat = [('jpg', 'jpg'), ('png', 'png'), ('bmp', 'bmp'), ('raw', 'raw')]

## Describes different association models in the database
AssociationTypes = [('Media', 'Relates to one or more media items'),
                    ('Frame', 'Relates to a specific frame in a video'),
                    #Relates to one or more frames in a video
                    ('Localization', 'Relates to localization(s)')]
#Relates to one-to-many localizations

class MediaAccess(Enum):
    """ TODO: add documentation for this """
    VIEWABLE = 'viewable'
    DOWNLOADABLE = 'downloadable'
    ARCHIVAL = 'archival'
    REMOVE = 'remove'

class Marker(Enum):
    """ TODO: add documentation for this """
    NONE = 'none'
    CROSSHAIR = 'crosshair'
    SQUARE = 'square'
    CIRCLE = 'circle'

class InterpolationMethods(Enum):
    """ TODO: add documentation for this """
    NONE = 'none'
    LATEST = 'latest'
    NEAREST = 'nearest'
    LINEAR = 'linear'
    SPLINE = 'spline'

class JobResult(Enum):
    """ TODO: add documentation for this """
    FINISHED = 'finished'
    FAILED = 'failed'

class JobStatus(Enum): # Keeping for migration compatibility
    """ TODO: add documentation for this """

class JobChannel(Enum): # Keeping for migration compatibility
    """ TODO: add documentation for this """

class Permission(Enum):
    """ TODO: add documentation for this """
    VIEW_ONLY = 'r'
    CAN_EDIT = 'w'
    CAN_TRANSFER = 't'
    CAN_EXECUTE = 'x'
    FULL_CONTROL = 'a'

class HistogramPlotType(Enum):
    """ TODO: add documentation for this """
    PIE = 'pie'
    BAR = 'bar'

class TwoDPlotType(Enum):
    """ TODO: add documentation for this """
    LINE = 'line'
    SCATTER = 'scatter'

class Organization(Model):
    """ TODO: add documentation for this """
    name = CharField(max_length=128)
    def __str__(self):
        return self.name

class User(AbstractUser):
    """ TODO: add documentation for this """
    middle_initial = CharField(max_length=1)
    initials = CharField(max_length=3)
    organization = ForeignKey(Organization, on_delete=SET_NULL, null=True, blank=True)
    last_login = DateTimeField(null=True, blank=True)
    last_failed_login = DateTimeField(null=True, blank=True)
    failed_login_count = IntegerField(default=0)

    def __str__(self):
        if self.first_name or self.last_name:
            return f"{self.first_name} {self.last_name}"
        else:
            return "---"

class Project(Model):
    """ TODO: add documentation for this """
    name = CharField(max_length=128)
    creator = ForeignKey(User, on_delete=PROTECT, related_name='creator')
    created = DateTimeField(auto_now_add=True)
    size = BigIntegerField(default=0)
    """Size of all media in project in bytes.
    """
    num_files = IntegerField(default=0)
    summary = CharField(max_length=1024)
    filter_autocomplete = JSONField(null=True, blank=True)
    def has_user(self, user_id):
        """ TODO: add documentation for this """
        return self.membership_set.filter(user_id=user_id).exists()
    def user_permission(self, user_id):
        """ TODO: add documentation for this """
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
    """ TODO: add documentation for this """
    name = CharField(max_length=128)
    description = CharField(max_length=1024, blank=True)
    number = PositiveIntegerField()
    project = ForeignKey(Project, on_delete=CASCADE)
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True,
                            blank=True, related_name='version_created_by')
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
    """ TODO: add documentation for this """
    return Version.objects.create(
        name="Baseline",
        description="Initial version",
        project=instance,
        number=0,
        show_empty=True,
    )

@receiver(post_save, sender=Project)
def project_save(instance, created):
    """ TODO: add documentation for this """
    TatorSearch().create_index(instance.pk)
    if created:
        make_default_version(instance)

@receiver(pre_delete, sender=Project)
def delete_index_project(instance):
    """ TODO: add documentation for this """
    TatorSearch().delete_index(instance.pk)

class Membership(Model):
    """Stores a user and their access level for a project.
    """
    project = ForeignKey(Project, on_delete=CASCADE)
    user = ForeignKey(User, on_delete=CASCADE)
    permission = EnumField(Permission, max_length=1, default=Permission.CAN_EDIT)
    def __str__(self):
        return f'{self.user} | {self.permission} | {self.project}'

def get_video_definition(path, codec, resolution, **kwargs):
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

def project_based_file_location(instance, filename):
    """ TODO: add documentation for this """
    return os.path.join(f"{instance.project.id}", filename)

class JobCluster(Model):
    """ TODO: add documentation for this """
    name = CharField(max_length=128)
    owner = ForeignKey(User, null=True, blank=True, on_delete=SET_NULL)
    host = CharField(max_length=1024)
    port = PositiveIntegerField()
    token = CharField(max_length=1024)
    cert = TextField(max_length=2048)

    def __str__(self):
        """ TODO: add documentation for this """
        return self.name

# Algorithm models

class Algorithm(Model):
    """ TODO: add documentation for this """
    name = CharField(max_length=128)
    project = ForeignKey(Project, on_delete=CASCADE)
    user = ForeignKey(User, on_delete=PROTECT)
    description = CharField(max_length=1024, null=True, blank=True)
    manifest = FileField(upload_to=project_based_file_location, null=True, blank=True)
    cluster = ForeignKey(JobCluster, null=True, blank=True, on_delete=SET_NULL)
    files_per_job = PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1),]
    )
    max_concurrent = PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1),]
    )

    def __str__(self):
        return self.name

class TemporaryFile(Model):
    """ Represents a temporary file in the system"""
    """ can be used for algorithm results or temporary outputs """
    name = CharField(max_length=128)
    """ Human readable name for display purposes """
    project = ForeignKey(Project, on_delete=CASCADE)
    """ Project the temporary file resides in """
    user = ForeignKey(User, on_delete=PROTECT)
    """ User who created the temporary file """
    path = FilePathField(path=settings.MEDIA_ROOT, null=True, blank=True)
    """ Path to file on storage """
    lookup = SlugField(max_length=32)
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

    def from_local(self, path, name, project, user, lookup, hours):
        """ Given a local file create a temporary file storage object
        :returns A saved TemporaryFile:
        """
        extension = os.path.splitext(name)[-1]
        destination_fp = os.path.join(settings.MEDIA_ROOT, f"{project.id}",
                                      f"{uuid.uuid1()}{extension}")
        os.makedirs(os.path.dirname(destination_fp), exist_ok=True)
        shutil.copyfile(path, destination_fp)

        now = datetime.datetime.utcnow()
        eol = now + datetime.timedelta(hours=hours)

        temp_file = TemporaryFile(name=name,
                                  project=project,
                                  user=user,
                                  path=destination_fp,
                                  lookup=lookup,
                                  created_datetime=now,
                                  eol_datetime=eol)
        temp_file.save()
        return temp_file

@receiver(pre_delete, sender=TemporaryFile)
def temporary_file_delete(instance):
    """ TODO: add documentation for this """
    if os.path.exists(instance.path):
        os.remove(instance.path)

# Entity types

class MediaType(Model):
    """ TODO: add documentation for this """
    dtype = CharField(max_length=16, choices=[('image', 'image'), ('video', 'video')])
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
    keep_original = BooleanField(default=True, null=True, blank=True)
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
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=MediaType)
def media_type_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_mapping(instance)

class LocalizationType(Model):
    """ TODO: add documentation for this """
    dtype = CharField(max_length=16,
                      choices=[('box', 'box'), ('line', 'line'), ('dot', 'dot')])
    project = ForeignKey(Project, on_delete=CASCADE, null=True, blank=True, db_column='project')
    name = CharField(max_length=64)
    description = CharField(max_length=256, blank=True)
    visible = BooleanField(default=True)
    """ Whether this type should be displayed in the UI."""
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
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=LocalizationType)
def localization_type_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_mapping(instance)

class StateType(Model):
    """ TODO: add documentation for this """
    dtype = CharField(max_length=16, choices=[('state', 'state')], default='state')
    project = ForeignKey(Project, on_delete=CASCADE, null=True, blank=True, db_column='project')
    name = CharField(max_length=64)
    description = CharField(max_length=256, blank=True)
    visible = BooleanField(default=True)
    """ Whether this type should be displayed in the UI."""
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
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=StateType)
def state_type_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_mapping(instance)

class LeafType(Model):
    """ TODO: add documentation for this """
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
    """
    def __str__(self):
        return f'{self.name} | {self.project}'

@receiver(post_save, sender=LeafType)
def leaf_type_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_mapping(instance)


# Entities (stores actual data)

class Media(Model):
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
    project = ForeignKey(Project, on_delete=SET_NULL, null=True, blank=True, db_column='project')
    meta = ForeignKey(MediaType, on_delete=SET_NULL, null=True, blank=True, db_column='meta')
    """ Meta points to the defintion of the attribute field. That is
        a handful of AttributeTypes are associated to a given MediaType
        that is pointed to by this value. That set describes the `attribute`
        field of this structure. """
    attributes = JSONField(null=True, blank=True)
    """ Values of user defined attributes. """
    created_datetime = DateTimeField(auto_now_add=True, null=True, blank=True)
    created_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                            related_name='media_created_by', db_column='created_by')
    modified_datetime = DateTimeField(auto_now=True, null=True, blank=True)
    modified_by = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True,
                             related_name='media_modified_by', db_column='modified_by')
    name = CharField(max_length=256)
    md5 = SlugField(max_length=32)
    """ md5 hash of the originally uploaded file. """
    file = FileField(null=True, blank=True)
    last_edit_start = DateTimeField(null=True, blank=True)
    """ Start datetime of a session in which the media's annotations were edited.
    """
    last_edit_end = DateTimeField(null=True, blank=True)
    """ End datetime of a session in which the media's annotations were edited.
    """
    original = FilePathField(path=settings.RAW_ROOT, null=True, blank=True)
    thumbnail = ImageField(null=True, blank=True)
    thumbnail_gif = ImageField(null=True, blank=True)
    num_frames = IntegerField(null=True, blank=True)
    fps = FloatField(null=True, blank=True)
    codec = CharField(null=True, blank=True, max_length=256)
    width = IntegerField(null=True)
    height = IntegerField(null=True)
    segment_info = FilePathField(path=settings.MEDIA_ROOT, null=True,
                                 blank=True)
    media_files = JSONField(null=True, blank=True)

@receiver(post_save, sender=Media)
def media_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_document(instance)

def safe_delete(path):
    """ TODO: add documentation for this """
    try:
        logger.info(f"Deleting {path}")
        os.remove(path)
    except:
        logger.warning(f"Could not remove {path}")
        logger.warning(f"{traceback.format_exc()}")

@receiver(pre_delete, sender=Media)
def media_delete(instance):
    """ TODO: add documentation for this """
    if instance.project:
        TatorSearch().delete_document(instance)
    instance.file.delete(False)
    if instance.original is not None:
        path = str(instance.original)
        safe_delete(path)

    # Delete all the files referenced in media_files
    if not instance.media_files is None:
        files = instance.media_files.get('streaming', [])
        if files is None:
            files = []
        for obj in files:
            path = "/data" + obj['path']
            safe_delete(path)
            path = "/data" + obj['segment_info']
            safe_delete(path)
        files = instance.media_files.get('archival', [])
        if files is None:
            files = []
        for obj in files:
            safe_delete(obj['path'])
    instance.thumbnail.delete(False)
    instance.thumbnail_gif.delete(False)

class Localization(Model):
    """ TODO: add documentation for this """
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
    modified = BooleanField(null=True, blank=True)
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
    parent = ForeignKey("self", on_delete=SET_NULL, null=True, blank=True, db_column='parent')
    """ Pointer to localization in which this one was generated from """

@receiver(post_save, sender=Localization)
def localization_save(instance):
    """ TODO: add documentation for this """
    if getattr(instance, '_inhibit', False) == False:
        TatorSearch().create_document(instance)
    else:
        pass

@receiver(pre_delete, sender=Localization)
def localization_delete(instance):
    """ TODO: add documentation for this """
    TatorSearch().delete_document(instance)
    if instance.thumbnail_image:
        instance.thumbnail_image.delete()

class State(Model):
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
    modified = BooleanField(null=True, blank=True)
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
    def select_on_media(self, media_id):
        """ TODO: add documentation for this """
        return State.objects.filter(media__in=media_id)

@receiver(post_save, sender=State)
def state_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_document(instance)

@receiver(pre_delete, sender=State)
def state_delete(instance):
    """ TODO: add documentation for this """
    TatorSearch().delete_document(instance)

@receiver(m2m_changed, sender=State.localizations.through)
def calc_segments(**kwargs):
    """ TODO: add documentation for this """
    instance = kwargs['instance']
    sorted_localizations = Localization.objects.filter(pk__in=instance.localizations.all()).order_by('frame')

    #Bring up related media to association
    instance.media.set(sorted_localizations.all().values_list('media', flat=True))
    segment_list = []
    current = [None, None]
    last = None
    for localization in sorted_localizations:
        if current[0] is None:
            current[0] = localization.frame
            last = current[0]
        else:
            if localization.frame - 1 == last:
                last = localization.frame
            else:
                current[1] = last
                segment_list.append(current.copy())
                current[0] = localization.frame
                current[1] = None
                last = localization.frame
    if current[1] is None:
        current[1] = last
        segment_list.append(current)
    instance.segments = segment_list

class Leaf(Model):
    """ TODO: add documentation for this """
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
    parent = ForeignKey('self', on_delete=SET_NULL, blank=True, null=True, db_column='parent')
    path = PathField(unique=True)
    name = CharField(max_length=255)

    class Meta:
        verbose_name_plural = "Leaves"

    def __str__(self):
        return str(self.path)

    def depth(self):
        """ TODO: add documentation for this """
        return Leaf.objects.annotate(depth=Depth('path')).get(pk=self.pk).depth

    def subcategories(self, min_level=1):
        """ TODO: add documentation for this """
        return Leaf.objects.select_related('parent').filter(
            path__descendants=self.path,
            path__depth__gte=self.depth()+min_level
        )

    def compute_path(self):
        """ Returns the string representing the path element """
        path_str = self.name.replace(" ", "_").replace("-", "_").replace("(", "_").replace(")", "_")
        if self.parent:
            path_str = self.parent.computePath()+"."+path_str
        elif self.project:
            proj_name = self.project.name.replace(" ", "_").replace("-", "_").replace("(", "_").replace(")", "_")
            path_str = proj_name+"."+path_str
        return path_str

@receiver(post_save, sender=Leaf)
def leaf_save(instance):
    """ TODO: add documentation for this """
    TatorSearch().create_document(instance)

@receiver(pre_delete, sender=Leaf)
def leaf_delete(instance):
    """ TODO: add documentation for this """
    TatorSearch().delete_document(instance)

class Analysis(Model):
    """ TODO: add documentation for this """
    project = ForeignKey(Project, on_delete=CASCADE, db_column='project')
    name = CharField(max_length=64)
    data_query = CharField(max_length=1024, default='*')
    def __str__(self):
        return f"{self.project} | {self.name}"

def type_to_obj(type_obj):
    """Returns a data object for a given type object"""
    _dict = {
        MediaType: Media,
        LocalizationType: Localization,
        StateType: State,
        LeafType: Leaf,
    }

    if type_obj in _dict:
        return _dict[type_obj]
    else:
        return None

def make_dict(keys, row):
    """ TODO: add documentation for this """
    d = {} #pylint: disable=invalid-name
    for idx, col in enumerate(keys):
        d[col.name] = row[idx]
    return d

def database_qs(qs):
    """ TODO: add documentation for this """
    return database_query(str(qs.query))

def database_query(query):
    """ TODO: add documentation for this """
    with connection.cursor() as d_cursor:
        cursor = d_cursor.cursor
        b_q = datetime.datetime.now()
        cursor.execute(query)
        a_q = datetime.datetime.now()
        l = [make_dict(cursor.description, x) for x in cursor] #pylint: disable=invalid-name
        a_f = datetime.datetime.now()
        logger.info(f"Query = {a_q-b_q}")
        logger.info(f"List = {a_f-a_q}")
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
