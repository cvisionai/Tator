media_properties = {
    'name': {
        'description': 'Name of the media.',
        'type': 'string',
    },
    'media_files': {'$ref': '#/components/schemas/MediaFiles'},
    'last_edit_start': {
        'description': 'Datetime of the start of the session when this media or its annotations '
                       'were last edited.',
        'type': 'string',
        'format': 'date-time',
    },
    'last_edit_end': {
        'description': 'Datetime of the end of the session when this media or its annotations '
                       'were last edited.',
        'type': 'string',
        'format': 'date-time',
    },
    'attributes': {
        'description': 'Object containing attribute values.',
        'type': 'object',
        'additionalProperties': {'$ref': '#/components/schemas/AttributeValue'},
    },
}

media_get_properties = {
    'id': {
        'type': 'integer',
        'description': 'Unique integer identifying this media.',
    },
    'project': {
        'type': 'integer',
        'description': 'Unique integer identifying project of this media.',
    },
    'meta': {
        'type': 'integer',
        'description': 'Unique integer identifying entity type of this media.',
    },
    'created_datetime': {
        'type': 'string',
        'description': 'Datetime when this media was created.',
    },
    'created_by': {
        'type': 'integer',
        'description': 'Unique integer identifying user who created this media.',
    },
    'modified_datetime': {
        'type': 'string',
        'description': 'Datetime when this media was last modified.',
    },
    'modified_by': {
        'type': 'integer',
        'description': 'Unique integer identifying user who last modified this media.',
    },
    'md5': {
        'type': 'string',
        'description': 'MD5 checksum of the media file.',
    },
    'num_frames': {
        'type': 'integer',
        'description': 'Number of frames for videos.',
    },
    'fps': {
        'type': 'integer',
        'description': 'Frame rate for videos.',
    },
    'codec': {
        'type': 'string',
        'description': 'Codec for videos.',
    },
    'width': {
        'type': 'integer',
        'description': 'Horizontal resolution in pixels.',
    },
    'height': {
        'type': 'integer',
        'description': 'Vertical resolution in pixels.',
    },
    'gid': {
        'description': 'Group ID for the upload group of this media.',
        'type': 'string',
    },
    'uid': {
        'description': 'Unique ID for the upload of this media.',
        'type': 'string',
    },
}

media_spec = {
    'type': 'object',
    'required': ['type', 'section', 'name', 'md5'],
    'properties': {
        'type': {
            'description': 'Unique integer identifying a media type. Use '
                           '-1 to automatically select the media type if '
                           'only one media type exists in a project.',
            'type': 'integer',
            'minimum': -1,
        },
        'gid': media_get_properties['gid'],
        'uid': media_get_properties['uid'],
        'url': {
            'description': 'Upload URL for the image if this is an image type. If '
                           'not an image, this field is ignored.',
            'type': 'string',
        },
        'thumbnail_url': {
            'description': 'Upload URL for the media thumbnail if already generated.',
            'type': 'string',
        },
        'thumbnail_gif_url': {
            'description': 'Upload URL for the video gif thumbnail if already generated.',
            'type': 'string',
        },
        'section': {
            'description': 'Media section name.',
            'type': 'string',
        },
        'name': {
            'description': 'Name of the file.',
            'type': 'string',
        },
        'md5': {
            'description': 'MD5 sum of the media file.',
            'type': 'string',
        },
        'num_frames': {
            'type': 'integer',
            'description': 'Number of frames for videos.',
            'nullable': True,
        },
        'fps': {
            'type': 'integer',
            'description': 'Frame rate for videos.',
            'nullable': True,
        },
        'codec': {
            'type': 'string',
            'description': 'Codec for videos.',
            'nullable': True,
        },
        'width': {
            'type': 'integer',
            'description': 'Horizontal resolution in pixels.',
            'nullable': True,
        },
        'height': {
            'type': 'integer',
            'description': 'Vertical resolution in pixels.',
            'nullable': True,
        },
        'attributes': {
            'nullable': True,
            'description': 'Attributes for the media',
            'type': 'object',
        },
    },
}

media_bulk_update = {
    'type': 'object',
    'properties': {
        'attributes': {
            'description': 'Attribute values to bulk update an entity list.',
            'type': 'object',
            'additionalProperties': {'$ref': '#/components/schemas/AttributeValue'},
        },
        'archive_state': {
            'type': 'string',
            'description': 'Marks media for archival or retrieval. Media may not be set directly '
                           'to `live` or `archived`, the system performs that transition for the '
                           'user.',
            'enum': ['to_archive', 'to_live']
        },
        'ids': {
            'description': 'Specific IDs to update. This is applied in addition to query '
                           'parameters.',
            'type': 'array',
            'items': {'type': 'integer'},
        },
    },
}

media_update = {
    'type': 'object',
    'properties': {
        **media_properties,
        'num_frames': {
            'description': 'Number of frames in the video.',
            'type': 'integer',
            'minimum': 0,
        },
        'fps': {
            'description': 'Frame rate of the video.',
            'type': 'number',
        },
        'codec': {
            'description': 'Codec of the original video.',
            'type': 'string',
        },
        'width': {
            'description': 'Pixel width of the video.',
            'type': 'integer',
        },
        'height': {
            'description': 'Pixel height of the video.',
            'type': 'integer',
        },
        'multi': {'$ref': '#/components/schemas/MultiDefinition'},
        'live': {'$ref': '#/components/schemas/LiveUpdateDefinition'},
        'archive_state': {
            'type': 'string',
            'description': 'Marks media for archival or retrieval. Media may not be set directly '
                           'to `live` or `archived`, the system performs that transition for the '
                           'user.',
            'enum': ['to_archive', 'to_live']
        },
    },
}

media_id_query = {
    'type': 'object',
    'properties': {
        'ids': {
            'description': 'Array of media IDs to retrieve.',
            'type': 'array',
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
        'localization_ids': {
            'description': 'Array of child localization IDs for which media should '
                           'be retrieved.',
            'type': 'array',
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
        'state_ids': {
            'description': 'Array of child state IDs for which media should '
                           'be retrieved.',
            'type': 'array',
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
    }
}

media = {
    'type': 'object',
    'properties': {
        **media_properties,
        **media_get_properties,
        'archive_state': {
            'type': 'string',
            'description': 'The current archival state of the media.',
            'enum': ['archived', 'to_archive', 'live', 'to_live']
        },
    },
}
