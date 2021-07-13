from rest_framework.schemas.openapi import SchemaGenerator
from rest_framework.renderers import BaseRenderer
import yaml

from .components import *

class NoAliasRenderer(BaseRenderer):
    media_type = 'application/vnd.oai.openapi'
    charset = None
    format = 'openapi'

    def __init__(self):
        assert yaml, 'Using OpenAPIRenderer, but `pyyaml` is not installed.'

    def render(self, data, media_type=None, renderer_context=None):
        # disable yaml advanced feature 'alias' for clean, portable, and readable output
        class Dumper(yaml.Dumper):
            def ignore_aliases(self, data):
                return True
        return yaml.dump(data, default_flow_style=False, sort_keys=False, Dumper=Dumper).encode('utf-8')

class CustomGenerator(SchemaGenerator):
    """ Schema generator for Swagger UI.
    """
    def get_schema(self, request=None, public=True, parser=False):
        schema = super().get_schema(request, public)

        # Set up schema components.
        schema['components'] = {
            'schemas': {
                'AffiliationSpec': affiliation_spec,
                'AffiliationUpdate': affiliation_update,
                'Affiliation': affiliation,
                'AlgorithmParameter': algorithm_parameter,
                'AlgorithmLaunchSpec': algorithm_launch_spec,
                'AlgorithmLaunch': algorithm_launch,
                'Algorithm': algorithm,
                'AlgorithmSpec': algorithm_spec,
                'AlgorithmManifest': algorithm_manifest,
                'AlgorithmManifestSpec': algorithm_manifest_spec,
                'AnalysisSpec': analysis_spec,
                'Analysis': analysis,
                'Announcement': announcement,
                'ArchiveConfig': archive_config,
                'AttributeTypeSpec': attribute_type_spec,
                'AttributeTypeUpdate': attribute_type_update,
                'AttributeTypeDelete': attribute_type_delete,
                'AttributeType': attribute_type,
                'AttributeValue': attribute_value,
                'AudioDefinition': audio_definition,
                'AutocompleteService': autocomplete_service,
                'BookmarkSpec': bookmark_spec,
                'BookmarkUpdate': bookmark_update,
                'Bookmark': bookmark,
                'BucketSpec': bucket_spec,
                'BucketUpdate': bucket_update,
                'Bucket': bucket,
                'ChangeLog': change_log,
                'CloneMediaSpec': clone_media_spec,
                'DownloadInfoSpec': download_info_spec,
                'DownloadInfo': download_info,
                'EmailSpec': email_spec,
                'EmailAttachmentSpec': email_attachment_spec,
                'EncodeConfig': encode_config,
                'FavoriteSpec': favorite_spec,
                'FavoriteUpdate': favorite_update,
                'Favorite': favorite,
                'FeedDefinition': feed_definition,
                'FileDefinition': file_definition,
                'LiveDefinition': live_definition,
                'LiveUpdateDefinition': live_update_definition,
                'ImageDefinition': image_definition,
                'InvitationSpec': invitation_spec,
                'InvitationUpdate': invitation_update,
                'Invitation': invitation,
                'JobNode': job_node,
                'Job': job,
                'JobCluster': job_cluster,
                'JobClusterSpec': job_cluster_spec,
                'LeafTypeSpec': leaf_type_spec,
                'LeafTypeUpdate': leaf_type_update,
                'LeafType': leaf_type,
                'LeafSuggestion': leaf_suggestion,
                'LeafSpec': leaf_spec,
                'LeafBulkUpdate': leaf_bulk_update,
                'LeafUpdate': leaf_update,
                'Leaf': leaf,
                'LeafIdQuery': leaf_id_query,
                'LocalizationTypeSpec': localization_type_spec,
                'LocalizationTypeUpdate': localization_type_update,
                'LocalizationType': localization_type,
                'LocalizationSpec': localization_spec,
                'LocalizationBulkUpdate': localization_bulk_update,
                'LocalizationUpdate': localization_update,
                'Localization': localization,
                'LocalizationIdQuery': localization_id_query,
                'MediaNext': media_next,
                'MediaPrev': media_prev,
                'MediaUpdate': media_update,
                'MediaBulkUpdate': media_bulk_update,
                'Media': media,
                'MediaFiles': media_files,
                'MediaIdQuery': media_id_query,
                'MediaSpec': media_spec,
                'MediaStats': media_stats,
                'MediaTypeSpec': media_type_spec,
                'MediaTypeUpdate': media_type_update,
                'MediaType': media_type,
                'MembershipSpec': membership_spec,
                'MembershipUpdate': membership_update,
                'Membership': membership,
                'MultiDefinition': multi_definition,
                'NotifySpec': notify_spec,
                'OrganizationSpec': organization_spec,
                'Organization': organization,
                'PasswordResetSpec': password_reset_spec,
                'ProjectSpec': project_spec,
                'ProjectUpdate': project_update,
                'Project': project,
                'ResolutionConfig': resolution_config,
                'S3StorageConfig': s3_storage_config,
                'SectionSpec': section_spec,
                'SectionUpdate': section_update,
                'Section': section,
                'SectionAnalysis': section_analysis,
                'StateSpec': state_spec,
                'StateBulkUpdate': state_bulk_update,
                'StateUpdate': state_update,
                'State': state,
                'StateIdQuery': state_id_query,
                'StateTypeSpec': state_type_spec,
                'StateTypeUpdate': state_type_update,
                'StateType': state_type,
                'StateMergeUpdate': state_merge_update,
                'StateTrimUpdate': state_trim_update,
                'TemporaryFileSpec': temporary_file_spec,
                'TemporaryFile': temporary_file,
                'TranscodeSpec': transcode_spec,
                'Transcode': transcode,
                'UploadCompletionSpec': upload_completion_spec,
                'UploadInfo': upload_info,
                'UploadPart': upload_part,
                'UserSpec': user_spec,
                'UserUpdate': user_update,
                'User': user,
                'VersionSpec': version_spec,
                'VersionUpdate': version_update,
                'Version': version,
                'VideoDefinition': video_definition,
                'VideoClip': video_clip,
                'RgbColor': rgb_color,
                'RgbaColor': rgba_color,
                'HexColor': hex_color,
                'Color': color,
                'Fill': fill,
                'AlphaRange': alpha_range,
                'ColorMap': color_map,
                'CreateResponse': create_response,
                'CreateListResponse': create_list_response,
                'MessageResponse': message_response,
                'NotFoundResponse': not_found_response,
                'BadRequestResponse': bad_request_response,
                'Credentials': credentials,
                'Token': token,
            },
        }

        if not parser:
            # Set security scheme.
            schema['components']['securitySchemes'] = {
                'TokenAuth': {
                    'type': 'apiKey',
                    'in': 'header',
                    'name': 'Authorization',
                },
            }
            schema['security'] = [
                {'TokenAuth': []},
            ]

        return schema

