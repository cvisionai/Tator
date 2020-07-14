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
    'file': {
        'type': 'string',
        'description': 'URL of the media file. Relative to https://<domain>/media/.',
    },
    'thumbnail': {
        'type': 'string',
        'description': 'URL of the thumbnail. Relative to https://<domain>/media/.',
    },
    'thumbnail_gif': {
        'type': 'string',
        'description': 'URL of the thumbnail gif for videos. Relative to https://<domain>/media/.',
    },
    'segment_info': {
        'type': 'string',
        'description': 'Path to segment info.',
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
    'original': {
        'type': 'string',
        'description': 'DEPRECATED. Use media_files. Stores path to original media file.',
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
        'gid': {
            'description': 'UUID corresponding to a group of uploads if this is an image type.',
            'type': 'string',
            'format': 'uuid',
        },
        'uid': {
            'description': 'UUID corresponding to an upload if this is an image type.',
            'type': 'string',
        },
        'url': {
            'description': 'Upload URL for the image if this is an image type. If '
                           'not an image, this field is ignored.',
            'type': 'string',
        },
        'thumbnail_url': {
            'description': 'Upload URL for the image thumbnail if already generated. If '
                           'not an image, this field is ignored.',
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
        'progress_name': {
            'description': 'Replaces name in progress message.',
            'type': 'string',
        },
    },
}

media_update = {
    'type': 'object',
    'properties': {
        **media_properties,
        'gid': {
            'description': 'UUID corresponding to a group of uploads. If given, a '
                           'progress message will be sent for this media.',
            'type': 'string',
            'format': 'uuid',
        },
        'uid': {
            'description': 'UUID corresponding to an upload. If given, a '
                           'progress message will be sent for this media.',
            'type': 'string',
        },
        'section': {
            'description': 'Media section name.',
            'type': 'string',
        },
        'thumbnail_url': {
            'description': 'Upload URL for the thumbnail.',
            'type': 'string',
        },
        'thumbnail_gif_url': {
            'description': 'Upload URL for the thumbnail gif.',
            'type': 'string',
        },
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
    },
}

media = {
    'type': 'object',
    'properties': {
        **media_properties,
        **media_get_properties,
    },
}
