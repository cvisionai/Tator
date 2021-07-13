import logging
import datetime
import os
import shutil
import mimetypes
import datetime
import tempfile
from uuid import uuid1
from urllib.parse import urlparse

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Case, When
from django.http import Http404
from PIL import Image

from ..models import (
    ChangeLog,
    ChangeToObject,
    Media,
    MediaType,
    Section,
    Localization,
    State,
    Project,
    Resource,
    Bucket,
    database_qs,
    database_query_ids,
)
from ..search import TatorSearch
from ..schema import MediaListSchema, MediaDetailSchema, parse
from ..schema.components import media as media_schema
from ..notify import Notify
from ..download import download_file
from ..store import get_tator_store, get_storage_lookup

from ._util import bulk_create_from_generator, computeRequiredFields, check_required_fields
from ._base_views import BaseListView, BaseDetailView
from ._media_query import get_media_queryset, get_media_es_query
from ._attributes import bulk_patch_attributes, patch_attributes, validate_attributes
from ._permissions import ProjectEditPermission, ProjectTransferPermission

logger = logging.getLogger(__name__)

MEDIA_PROPERTIES = list(media_schema['properties'].keys())


def _get_next_archive_state(desired_archive_state, last_archive_state):
    if desired_archive_state == "to_live":
        if last_archive_state == "archived":
            return "to_live"
        if last_archive_state == "to_archive":
            return "live"
        return None

    if desired_archive_state == "to_archive":
        if last_archive_state == "live":
            return "to_archive"
        if last_archive_state == "to_live":
            return None
        return None

    raise ValueError(f"Received invalid value '{desired_archive_state}' for archive_state")


def _presign(expiration, medias, fields=None):
    """ Replaces specified media fields with presigned urls.
    """
    # First get resources referenced by the given media.
    fields = fields or ["archival", "streaming", "audio", "image", "thumbnail", "thumbnail_gif", "attachment"]
    media_ids = [media['id'] for media in medias]
    resources = Resource.objects.filter(media__in=media_ids)
    store_lookup = get_storage_lookup(resources)

    # Get replace all keys with presigned urls.
    for media_idx, media in enumerate(medias):
        if media.get("media_files") is None:
            continue

        for field in fields:
            if field not in media["media_files"]:
                continue

            for idx, media_def in enumerate(media["media_files"][field]):
                tator_store = store_lookup[media_def["path"]]
                media_def["path"] = tator_store.get_download_url(media_def["path"], expiration)
                if field == "streaming":
                    if "segment_info" in media_def:
                        media_def["segment_info"] = tator_store.get_download_url(
                            media_def["segment_info"], expiration
                        )
                    else:
                        logger.warning(
                            f"No segment file in media {media['id']} for file {media_def['path']}!"
                        )

def _save_image(url, media_obj, project_obj, role):
    """
    Downloads an image, uploads it to the appropriate S3 location and returns an updated media
    object.
    """
    # Download the image file and load it.
    temp_image = tempfile.NamedTemporaryFile(delete=False)
    download_file(url, temp_image.name)
    image = Image.open(temp_image.name)
    image_format = image.format

    # Get filename from url.
    parsed = os.path.basename(urlparse(url).path)

    # Set up S3 client.
    tator_store = get_tator_store(project_obj.bucket)

    # Upload image.
    if media_obj.media_files is None:
        media_obj.media_files = {}
    image_key = f"{project_obj.organization.pk}/{project_obj.pk}/{media_obj.pk}/{parsed}"
    tator_store.put_object(image_key, temp_image)
    media_obj.media_files[role] = [{'path': image_key,
                                    'size': os.stat(temp_image.name).st_size,
                                    'resolution': [image.height, image.width],
                                    'mime': f'image/{image_format.lower()}'}]

    # Cleanup and return.
    image.close()
    os.remove(temp_image.name)
    Resource.add_resource(image_key, media_obj)
    return media_obj

class MediaListAPI(BaseListView):
    """ Interact with list of media.

        A media may be an image or a video. Media are a type of entity in Tator,
        meaning they can be described by user defined attributes.

        This endpoint supports bulk patch of user-defined localization attributes and bulk delete.
        Both are accomplished using the same query parameters used for a GET request.
    """
    schema = MediaListSchema()
    http_method_names = ['get', 'post', 'patch', 'delete', 'put']
    entity_type = MediaType # Needed by attribute filter mixin

    def get_permissions(self):
        """ Require transfer permissions for POST, edit otherwise.
        """
        if self.request.method == 'POST':
            self.permission_classes = [ProjectTransferPermission]
        else:
            self.permission_classes = [ProjectEditPermission]
        return super().get_permissions()

    def _get(self, params):
        """ Retrieve list of media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.
        """
        qs = get_media_queryset(self.kwargs['project'], params)
        response_data = list(qs.values(*MEDIA_PROPERTIES))
        presigned = params.get('presigned')
        if presigned is not None:
            _presign(presigned, response_data)
        return response_data

    def _post(self, params):

        # Get common parameters (between video/image).
        entity_type = params['type']
        section = params['section']
        name = params['name']
        md5 = params['md5']
        project = params['project']
        gid = params.get('gid', None)
        uid = params.get('uid', None)
        new_attributes = params.get('attributes', None)
        if gid is not None:
            gid = str(gid)
        project_obj = Project.objects.get(pk=project)

        # If section does not exist and is not an empty string, create a section.
        tator_user_sections = ""
        if section:
            section_obj = Section.objects.filter(project=project, name__iexact=section)
            if section_obj.exists():
                tator_user_sections = section_obj[0].tator_user_sections
            else:
                tator_user_sections = str(uuid1())
                Section.objects.create(project=project_obj,
                                       name=section,
                                       tator_user_sections=tator_user_sections)

        # Get the media type.
        if int(entity_type) == -1:
            media_types = MediaType.objects.filter(project=project)
            if media_types.count() > 0:
                mime, _ = mimetypes.guess_type(name)
                if mime is None:
                    ext = os.path.splitext(name)[1].lower()
                    if ext in ['.mts', '.m2ts']:
                        mime = 'video/MP2T'
                if mime.startswith('image'):
                    for media_type in media_types:
                        if media_type.dtype == 'image':
                            break
                else:
                    for media_type in media_types:
                        if media_type.dtype == 'video':
                            break
                entity_type = media_type.pk
            else:
                raise Exception('No media types for project')
        else:
            media_type = MediaType.objects.get(pk=int(entity_type))
            if media_type.project.pk != project:
                raise Exception('Media type is not part of project')

        # Compute the required fields for posting a media object
        # of this type
        required_fields = computeRequiredFields(media_type)

        # Apply user-supplied attributes and finally fill in
        # defaults and validate
        attributes = check_required_fields([], # Ignore top-level object
                                           required_fields[2],
                                           new_attributes if new_attributes else {})

        # Set the tator_user_section special attribute, will get
        # dropped if done prior to check_required_fields.
        attributes.update({'tator_user_sections': tator_user_sections})

        if media_type.dtype == 'image':
            # Create the media object.
            media_obj = Media.objects.create(
                project=project_obj,
                meta=MediaType.objects.get(pk=entity_type),
                name=name,
                md5=md5,
                attributes=attributes,
                created_by=self.request.user,
                modified_by=self.request.user,
                gid=gid,
                uid=uid,
            )
            media_obj.media_files = {}

            # Get image only parameters.
            url = params.get('url')
            thumbnail_url = params.get('thumbnail_url')

            if url:
                # Download the image file and load it.
                temp_image = tempfile.NamedTemporaryFile(delete=False)
                download_file(url, temp_image.name)
                image = Image.open(temp_image.name)
                media_obj.width, media_obj.height = image.size
                image_format = image.format

                # Download or create the thumbnail.
                if thumbnail_url is None:
                    temp_thumb = tempfile.NamedTemporaryFile(delete=False)
                    thumb_size = (256, 256)
                    image = image.convert('RGB') # Remove alpha channel for jpeg
                    image.thumbnail(thumb_size, Image.ANTIALIAS)
                    image.save(temp_thumb.name, format='jpeg')
                    thumb_name = 'thumb.jpg'
                    thumb_format = 'jpg'
                    thumb_width = image.width
                    thumb_height = image.height
                    image.close()

            if thumbnail_url:
                temp_thumb = tempfile.NamedTemporaryFile(delete=False)
                download_file(thumbnail_url, temp_thumb.name)
                thumb = Image.open(temp_thumb.name)
                thumb_name = os.path.basename(urlparse(thumbnail_url).path)
                thumb_format = thumb.format
                thumb_width = thumb.width
                thumb_height = thumb.height
                thumb.close()

            # Set up S3 client.
            tator_store = get_tator_store(project_obj.bucket)

            if url:
                # Upload image.
                image_key = f"{project_obj.organization.pk}/{project_obj.pk}/{media_obj.pk}/{name}"
                tator_store.put_object(image_key, temp_image)
                media_obj.media_files['image'] = [{'path': image_key,
                                                   'size': os.stat(temp_image.name).st_size,
                                                   'resolution': [media_obj.height, media_obj.width],
                                                   'mime': f'image/{image_format.lower()}'}]
                os.remove(temp_image.name)
                Resource.add_resource(image_key, media_obj)

            if url or thumbnail_url:
                # Upload thumbnail.
                thumb_format = image.format
                thumb_key = f"{project_obj.organization.pk}/{project_obj.pk}/{media_obj.pk}/{thumb_name}"
                tator_store.put_object(thumb_key, temp_thumb)
                media_obj.media_files['thumbnail'] = [{'path': thumb_key,
                                                       'size': os.stat(temp_thumb.name).st_size,
                                                       'resolution': [thumb_height, thumb_width],
                                                       'mime': f'image/{thumb_format}'}]
                os.remove(temp_thumb.name)
                Resource.add_resource(thumb_key, media_obj)

            media_obj.save()
            response = {'message': "Image saved successfully!", 'id': media_obj.id}

        else:
            # Create the media object.
            media_obj = Media.objects.create(
                project=project_obj,
                meta=MediaType.objects.get(pk=entity_type),
                name=name,
                md5=md5,
                attributes=attributes,
                created_by=self.request.user,
                modified_by=self.request.user,
                gid=gid,
                uid=uid,
            )

            # Add optional parameters.
            if 'fps' in params:
                media_obj.fps = params['fps']
            if 'num_frames' in params:
                media_obj.num_frames = params['num_frames']
            if 'codec' in params:
                media_obj.codec = params['codec']
            if 'width' in params:
                media_obj.width = params['width']
            if 'height' in params:
                media_obj.height = params['height']

            # Use thumbnails if they are given.
            thumbnail_url = params.get('thumbnail_url', None)
            thumbnail_gif_url = params.get('thumbnail_gif_url', None)

            if thumbnail_url is not None:
                media_obj = _save_image(thumbnail_url, media_obj, project_obj, 'thumbnail')

            if thumbnail_gif_url is not None:
                media_obj = _save_image(thumbnail_gif_url, media_obj, project_obj, 'thumbnail_gif')
            media_obj.save()

            msg = (f"Media object {media_obj.id} created for video "
                   f"{name} on project {media_type.project.name}")
            response = {'message': msg, 'id': media_obj.id}
            logger.info(msg)

        cl = ChangeLog(
            project=media_obj.project,
            user=self.request.user,
            description_of_change=media_obj.create_dict,
        )
        cl.save()
        ref_table = ContentType.objects.get_for_model(media_obj)
        ChangeToObject(ref_table=ref_table, ref_id=media_obj.id, change_id=cl).save()

        return response

    def _delete(self, params):
        """ Delete list of media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.

            This method performs a bulk delete on all media matching a query. It is 
            recommended to use a GET request first to check what is being deleted.
        """
        project = params["project"]
        qs = get_media_queryset(project, params)
        media_ids = list(qs.values_list('pk', flat=True).distinct())
        count = qs.count()
        if count > 0:
            # Get info to populate ChangeLog entry
            first_obj = qs.first()
            project = first_obj.project
            ref_table = ContentType.objects.get_for_model(first_obj)
            delete_dicts = []
            ref_ids = []
            for obj in qs:
                delete_dicts.append(obj.delete_dict)
                ref_ids.append(obj.id)

            # Mark media for deletion.
            qs.update(deleted=True,
                      modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                      modified_by=self.request.user)

            # Any states that are only associated to deleted media should also be marked 
            # for deletion.
            not_deleted_media = Media.objects.filter(project=project, deleted=False)
            state_qs = State.objects.filter(project=project).exclude(media__in=not_deleted_media)
            state_qs.update(deleted=True,
                            modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                            modified_by=self.request.user)


            # Delete any localizations associated to this media
            loc_qs = Localization.objects.filter(project=project, media__in=media_ids)
            loc_qs.update(deleted=True,
                          modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                          modified_by=self.request.user)

            # Clear elasticsearch entries for both media and its children.
            # Note that clearing children cannot be done using has_parent because it does
            # not accept queries with size, and has_parent also does not accept ids queries.
            query = get_media_es_query(self.kwargs['project'], params)
            TatorSearch().delete(self.kwargs['project'], query)
            loc_ids = [f'box_{id_}' for id_ in loc_qs.iterator()] \
                    + [f'line_{id_}' for id_ in loc_qs.iterator()] \
                    + [f'dot_{id_}' for id_ in loc_qs.iterator()]
            TatorSearch().delete(self.kwargs['project'], {'query': {'ids': {'values': loc_ids}}})
            state_ids = [f'state_{id_}' for id_ in state_qs.iterator()]
            TatorSearch().delete(self.kwargs['project'], {'query': {'ids': {'values': state_ids}}})

            # Create ChangeLogs
            objs = (
                ChangeLog(project=project, user=self.request.user, description_of_change=dd)
                for dd in delete_dicts
            )
            change_logs = bulk_create_from_generator(objs, ChangeLog)

            # Associate ChangeLogs with deleted objects
            objs = (
                ChangeToObject(ref_table=ref_table, ref_id=ref_id, change_id=cl)
                for ref_id, cl in zip(ref_ids, change_logs)
            )
            bulk_create_from_generator(objs, ChangeToObject)
        return {'message': f'Successfully deleted {count} medias!'}

    def _patch(self, params):
        """ Update list of media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.

            This method performs a bulk update on all media matching a query. It is
            recommended to use a GET request first to check what is being updated.
            Only attributes are eligible for bulk patch operations.
        """
        desired_archive_state = params.pop("archive_state", None)
        if desired_archive_state is None and params.get("attributes") is None:
            raise ValueError("Must specify 'attributes' and/or property to patch, but none found")
        qs = get_media_queryset(params['project'], params)
        count = 0
        if qs.exists():
            ts = TatorSearch()
            ids_to_update = list(qs.values_list("pk", flat=True).distinct())

            # Get the current representation of the object for comparison
            new_attrs = validate_attributes(params, qs[0])
            if new_attrs is not None:
                attr_count = len(ids_to_update)
                obj = qs.first()
                ref_table = ContentType.objects.get_for_model(obj)
                original_dict = obj.model_dict
                bulk_patch_attributes(new_attrs, qs)
                query = get_media_es_query(params["project"], params)
                ts.update(self.kwargs["project"], obj.meta, query, new_attrs)
                qs = Media.objects.filter(pk__in=ids_to_update)
                obj = Media.objects.get(id=original_dict["id"])
                change_dict = obj.change_dict(original_dict)
                # Create the ChangeLog entry and associate it with all objects in the queryset
                cl = ChangeLog(
                    project=obj.project, user=self.request.user, description_of_change=change_dict
                )
                cl.save()
                objs = (ChangeToObject(ref_table=ref_table, ref_id=o.id, change_id=cl) for o in qs)
                bulk_create_from_generator(objs, ChangeToObject)
                count = max(count, attr_count)

            if desired_archive_state is not None:
                archive_count = 0
                qs = Media.objects.filter(pk__in=ids_to_update)

                # Track previously updated IDs to avoid multiple updates to a single entity
                previously_updated = []

                # Further filter on current archive state to correctly update based on previous
                # state
                for state in ["live", "to_live", "archived", "to_archive"]:
                    next_archive_state = _get_next_archive_state(desired_archive_state, state)

                    # If the next archive state is a noop, skip the update
                    if next_archive_state is None:
                        continue

                    archive_qs = qs.filter(archive_state=state).exclude(pk__in=previously_updated)

                    # If no media match the archive state, skip the update
                    if not archive_qs.exists():
                        continue

                    # Get the original dict for creating the change log
                    archive_objs = list(archive_qs)
                    obj = archive_objs[0]
                    ref_table = ContentType.objects.get_for_model(obj)
                    original_dict = obj.model_dict

                    # Store the list of ids updated for this state and update them
                    archive_ids_to_update = [o.id for o in archive_objs]
                    archive_count += len(archive_ids_to_update)
                    previously_updated += archive_ids_to_update
                    archive_qs.update(
                        archive_state=next_archive_state,
                        modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                    )
                    archive_qs = Media.objects.filter(pk__in=archive_ids_to_update)

                    # Update in ES
                    documents = []
                    for entity in archive_qs:
                        documents += ts.build_document(entity)
                    ts.bulk_add_documents(documents)

                    # Create the ChangeLog entry and associate it with all updated objects
                    obj = Media.objects.get(id=original_dict["id"])
                    cl = ChangeLog(
                        project=obj.project,
                        user=self.request.user,
                        description_of_change=obj.change_dict(original_dict),
                    )
                    cl.save()
                    objs = (
                        ChangeToObject(ref_table=ref_table, ref_id=obj_id, change_id=cl)
                        for obj_id in archive_ids_to_update
                    )
                    bulk_create_from_generator(objs, ChangeToObject)
                count = max(count, archive_count)

        return {"message": f"Successfully patched {count} medias!"}

    def _put(self, params):
        """ Retrieve list of media by ID.
        """
        return self._get(params)

class MediaDetailAPI(BaseDetailView):
    """ Interact with individual media.

        A media may be an image or a video. Media are a type of entity in Tator,
        meaning they can be described by user defined attributes.
    """
    schema = MediaDetailSchema()
    permission_classes = [ProjectEditPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        """ Retrieve individual media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.
        """
        qs = Media.objects.filter(pk=params['id'], deleted=False)
        if not qs.exists():
            raise Http404
        response_data = list(qs.values(*MEDIA_PROPERTIES))
        presigned = params.get('presigned')
        if presigned is not None:
            _presign(presigned, response_data)
        return response_data[0]

    def _patch(self, params):
        """ Update individual media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.
        """
        with transaction.atomic():
            qs = Media.objects.select_for_update().filter(pk=params['id'], deleted=False)
            original_dict = qs[0].model_dict
            if 'attributes' in params:
                new_attrs = validate_attributes(params, qs[0])
                bulk_patch_attributes(new_attrs, qs)

            if 'name' in params:
                qs.update(name=params['name'])

            if 'last_edit_start' in params:
                qs.update(last_edit_start=params['last_edit_start'])

            if 'last_edit_end' in params:
                qs.update(last_edit_end=params['last_edit_end'])

            if 'fps' in params:
                qs.update(fps=params['fps'])

            if 'num_frames' in params:
                qs.update(num_frames=params['num_frames'])

            if 'codec' in params:
                qs.update(codec=params['codec'])

            if 'width' in params:
                qs.update(width=params['width'])

            if 'height' in params:
                qs.update(height=params['height'])

            if 'multi' in params:
                media_files = qs[0].media_files
                # If this object already contains non-multi media definitions, raise an exception.
                if media_files:
                    for role in ['streaming', 'archival', 'image', 'live']:
                        items = media_files.get(role, [])
                        if len(items) > 0:
                            raise ValueError(f"Cannot set a multi definition on a Media that contains "
                                              "individual media!")
                # Check values of IDs (that they exist and are part of the same project).
                sub_media = Media.objects.filter(project=qs[0].project, pk__in=params['multi']['ids'])
                if len(params['multi']['ids']) != sub_media.count():
                    raise ValueError(f"One or more media IDs in multi definition is not part of "
                                      "project {qs[0].project.pk} or does not exist!")
                if media_files is None:
                    media_files = {}
                for key in ['ids', 'layout', 'quality']:
                    if params['multi'].get(key):
                        media_files[key] = params['multi'][key]
                qs.update(media_files=media_files)

            if 'live' in params:
                media_files = qs[0].media_files
                # If this object already contains non-live media definitions, raise an exception.
                if media_files:
                    for role in ['streaming', 'archival', 'image', 'ids']:
                        items = media_files.get(role, [])
                        if len(items) > 0:
                            raise ValueError(f"Cannot set a multi definition on a Media that contains "
                                              "individual media!")
                if media_files is None:
                    media_files = {}
                media_files['layout'] = params['live']['layout']
                media_files['live'] = params['live']['streams']
                qs.update(media_files=media_files)

            if "archive_state" in params:
                next_archive_state = _get_next_archive_state(
                    params["archive_state"], qs[0].archive_state
                )

                if next_archive_state is not None:
                    qs.update(
                        archive_state=next_archive_state,
                        modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                    )

        obj = Media.objects.get(pk=params['id'], deleted=False)
        TatorSearch().create_document(obj)
        if 'attributes' in params:
            if obj.meta.dtype == 'image':
                for localization in obj.localization_thumbnail_image.all():
                    localization = patch_attributes(new_attrs, localization)
                    localization.save()

        cl = ChangeLog(
            project=obj.project,
            user=self.request.user,
            description_of_change=obj.change_dict(original_dict),
        )
        cl.save()
        ChangeToObject(
            ref_table=ContentType.objects.get_for_model(obj),
            ref_id=obj.id,
            change_id=cl,
        ).save()

        return {'message': f'Media {params["id"]} successfully updated!'}

    def _delete(self, params):
        """ Delete individual media.

            A media may be an image or a video. Media are a type of entity in Tator,
            meaning they can be described by user defined attributes.
        """
        media = Media.objects.get(pk=params['id'], deleted=False)
        project = media.project
        delete_dict = media.delete_dict
        ref_table = ContentType.objects.get_for_model(media)
        ref_id = media.id
        media.deleted = True
        media.modified_datetime = datetime.datetime.now(datetime.timezone.utc)
        media.modified_by = self.request.user
        media.save()
        TatorSearch().delete_document(media)
        cl = ChangeLog(project=project, user=self.request.user, description_of_change=delete_dict)
        cl.save()
        ChangeToObject(ref_table=ref_table, ref_id=ref_id, change_id=cl).save()

        # Any states that are only associated to deleted media should also be marked 
        # for deletion.
        not_deleted_media = Media.objects.filter(project=project, deleted=False)
        state_qs = State.objects.filter(project=project).exclude(media__in=not_deleted_media)
        state_qs.update(deleted=True,
                        modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                        modified_by=self.request.user)

        # Delete any localizations associated to this media
        loc_qs = Localization.objects.filter(project=project, media__in=[media.id])
        loc_qs.update(deleted=True,
                      modified_datetime=datetime.datetime.now(datetime.timezone.utc),
                      modified_by=self.request.user)

        return {'message': f'Media {params["id"]} successfully deleted!'}

    def get_queryset(self):
        return Media.objects.all()
