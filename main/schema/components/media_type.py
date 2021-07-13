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
        'enum': ['image', 'video', 'multi', 'live'],
    },
    'file_format': {
        'description': 'File extension. If omitted, any recognized file '
                       'extension for the given dtype is accepted for upload. '
                       'Do not include a dot prefix.',
        'type': 'string',
        'maxLength': 4,
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
        'type': 'array',
        'items': {'$ref': '#/components/schemas/ResolutionConfig'},
    },
    'overlay_config': {
        'description': 'Overlay configuration',
        'type': 'object',
        'additionalProperties': True,
    },
    'visible': {
        'description': 'Visible configuration',
        'type': 'boolean',
    },
    'default_box': {
        'description': 'Unique integer identifying default box type for drawing.',
        'type': 'integer',
    },
    'default_line': {
        'description': 'Unique integer identifying default line type for drawing.',
        'type': 'integer',
    },
    'default_dot': {
        'description': 'Unique integer identifying default dot type for drawing.',
        'type': 'integer',
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
        'description':  {
            'description': 'Description of the media type.',
            'type': 'string'
        },
        'file_format': media_type_properties['file_format'],
        'archive_config': media_type_properties['archive_config'],
        'streaming_config': media_type_properties['streaming_config'],
        'visible': media_type_properties['visible'],
        'default_volume': media_type_properties['default_volume'],
        'default_box': media_type_properties['default_box'],
        'default_line': media_type_properties['default_line'],
        'default_dot': media_type_properties['default_dot'],
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
