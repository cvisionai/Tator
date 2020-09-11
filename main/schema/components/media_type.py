media_type_properties = {
    'name': {
        'description': 'Name of the media type.',
        'type': 'string',
    },
    'description': {
        'description': 'Description of the media type.',
        'type': 'string',
        'default': '',
    },
    'dtype': {
        'description': 'Type of the media, image or video.',
        'type': 'string',
        'enum': ['image', 'video'],
    },
    'file_format': {
        'description': 'File extension. If omitted, any recognized file '
                       'extension for the given dtype is accepted for upload. '
                       'Do not include a dot prefix.',
        'type': 'string',
        'maxLength': 4,
    },
    'keep_original': {
        'description': 'For video dtype, whether to keep the original '
                       'video file for archival purposes after transcoding. '
                       'If true, the originally uploaded file will be '
                       'available for download, otherwise downloads will '
                       'use the transcoded videos.',
        'type': 'boolean',
        'default': True,
    },
    'default_volume': {
        'description': 'Default audio volume for this media type.',
        'type': 'integer',
        'minimum': 0,
        'maximum': 100,
    },
    'attribute_types': {
        'description': 'Attribute type definitions.',
        'type': 'array',
        'items': {'$ref': '#/components/schemas/AttributeType'},
    },
    'archive_config': {
        'description': 'Archive config definitions. If null, the raw file will be uploaded '
                       'to Tator.',
        'type': 'array',
        'items': {'$ref': '#/components/schemas/ArchiveConfig'},
    },
    'streaming_config': {
        'description': 'Streaming config defintion. If null, the default will be used.',
        'type': 'object',
        'additionalProperties': {'$ref': '#/components/schemas/StreamingConfig'},
    },
}

media_type_spec = {
    'type': 'object',
    'required': ['name', 'dtype'],
    'properties': media_type_properties,
}

media_type_update = {
    'type': 'object',
    'properties': {
        'name': media_type_properties['name'],
        'description': media_type_properties['description'],
        'file_format': media_type_properties['file_format'],
        'keep_original': media_type_properties['keep_original'],
    },
}

media_type = {
    'type': 'object',
    'description': 'Media type.',
    'properties': {
        'id': {
            'type': 'integer',
            'description': 'Unique integer identifying a media type.',
        },
        'project': {
            'type': 'integer',
            'description': 'Unique integer identifying project for this media type.',
        },
        **media_type_properties,
    },
}

