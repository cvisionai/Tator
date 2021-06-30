audio_definition = {
    'type': 'object',
    'required': ['path', 'codec'],
    'properties': {
        'path': {
            'type': 'string',
            'description': 'Relative URL to the file.',
        },
        'size': {
            'type': 'integer',
            'description': 'File size in bytes.',
        },
        'bit_rate': {
            'type': 'integer',
            'description': 'Bit rate in bits per second',
        },
        'codec': {
            'description': 'Human readable codec.',
            'type': 'string',
        },
        'host': {
            'description': 'If supplied will use this instead of currently connected '
                           'host, e.g. https://example.com',
            'type': 'string',
        },
        'http_auth': {
            'description': 'If specified will be used for HTTP authorization in '
                           'request for media, i.e. "bearer <token>".',
            'type': 'string',
        },
        'codec_mime': {
            'description': 'Example mime: "video/mp4; codecs="avc1.64001e"". '
                           'Only relevant for streaming files, will assume example '
                           'above if not present.',
            'type': 'string',
        },
        'codec_description': {
            'description': 'Description other than codec.',
            'type': 'string',
        },
    },
}

video_definition = {
    'type': 'object',
    'required': ['path', 'codec', 'resolution'],
    'properties': {
        'path': {
            'type': 'string',
            'description': 'Relative URL to the file.',
        },
        'size': {
            'type': 'integer',
            'description': 'File size in bytes.',
        },
        'bit_rate': {
            'type': 'integer',
            'description': 'Bit rate in bits per second',
        },
        'codec': {
            'description': 'Human readable codec.',
            'type': 'string',
        },
        'resolution': {
            'description': 'Resolution of the video in pixels (height, width).',
            'type': 'array',
            'minItems': 2,
            'maxItems': 2,
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
        'segment_info': {
            'description': 'Path to json file containing segment info. Required if media role is '
                           '`streaming`.',
            'type': 'string',
        },
        'host': {
            'description': 'If supplied will use this instead of currently connected '
                           'host, e.g. https://example.com',
            'type': 'string',
        },
        'http_auth': {
            'description': 'If specified will be used for HTTP authorization in '
                           'request for media, i.e. "bearer <token>".',
            'type': 'string',
        },
        'codec_mime': {
            'description': 'Example mime: "video/mp4; codecs="avc1.64001e"". '
                           'Only relevant for streaming files, will assume example '
                           'above if not present.',
            'type': 'string',
        },
        'codec_description': {
            'description': 'Description other than codec.',
            'type': 'string',
        },
    },
}

image_definition = {
    'type': 'object',
    'required': ['path', 'resolution'],
    'properties': {
        'path': {
            'type': 'string',
            'description': 'Relative URL to the file.',
        },
        'size': {
            'type': 'integer',
            'description': 'File size in bytes.',
        },
        'resolution': {
            'description': 'Resolution of the video in pixels (height, width).',
            'type': 'array',
            'minItems': 2,
            'maxItems': 2,
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
        'host': {
            'description': 'If supplied will use this instead of currently connected '
                           'host, e.g. https://example.com',
            'type': 'string',
        },
        'http_auth': {
            'description': 'If specified will be used for HTTP authorization in '
                           'request for media, i.e. "bearer <token>".',
            'type': 'string',
        },
        'mime': {
            'description': 'Example mime: "image/jpg".',
            'type': 'string',
        },
    },
}

multi_definition = {
    'description': 'Object containing information needed for a multi media type.',
    'type': 'object',
    'properties': {
        'ids': {'type': 'array',
                'description': 'If multi-stream list of ids of sub-videos',
                'items': {'type': 'integer'}},
        'layout': {'type': 'array',
                   'description': '2-element array to define rxc layout',
                   'items': {'type': 'integer'}},
        'quality': {'type': 'integer',
                    'description': 'Resolution to fetch on each sub-video'},
    },
}

file_definition = {
    'type': 'object',
    'required': ['path'],
    'properties': {
        'name': {
            'type': 'string',
            'description': 'Name of the file.',
        },
        'path': {
            'type': 'string',
            'description': 'Relative URL to the file.',
        },
        'size': {
            'type': 'integer',
            'description': 'File size in bytes.',
        },
        'host': {
            'description': 'If supplied will use this instead of currently connected '
                           'host, e.g. https://example.com',
            'type': 'string',
        },
        'http_auth': {
            'description': 'If specified will be used for HTTP authorization in '
                           'request for media, i.e. "bearer <token>".',
            'type': 'string',
        },
        'mime': {
            'description': 'Example mime: "text/csv".',
            'type': 'string',
        },
    },
}

live_definition = {
    'type': 'object',
    'required': ['url', 'feeds'],
    'properties': {
        'url': {
            'type': 'string',
            'description': 'URL to streaming server.',
        },
        'feeds': {'type': 'array', 'items': {'$ref': '#/components/schemas/FeedDefinition'}}
    },
}

feed_definition = {
    'type': 'object',
    'required': ['name', 'resolution'],
    'properties': {
        'name': {
            'type': 'string',
            'description': 'Name of the feed.',
        },
        'resolution': {
            'description': 'Resolution of the video in pixels (height, width).',
            'type': 'array',
            'minItems': 2,
            'maxItems': 2,
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
    },
}



media_files = {
    'description': 'Object containing upload urls for the transcoded file and '
                   'corresponding `VideoDefinition`.',
    'type': 'object',
    'properties': {
        'archival': {'type': 'array', 'items': {'$ref': '#/components/schemas/VideoDefinition'}},
        'streaming': {'type': 'array', 'items': {'$ref': '#/components/schemas/VideoDefinition'}},
        'audio': {'type': 'array', 'items': {'$ref': '#/components/schemas/AudioDefinition'}},
        'image': {'type': 'array', 'items': {'$ref': '#/components/schemas/ImageDefinition'}},
        'attachment': {'type': 'array', 'items': {'$ref': '#/components/schemas/FileDefinition'}},
        'thumbnail': {'type': 'array', 'items': {'$ref': '#/components/schemas/ImageDefinition'}},
        'thumbnail_gif': {'type': 'array', 'items': {'$ref': '#/components/schemas/ImageDefinition'}},
        'live': {'type': 'array', 'items': {'$ref': '#/components/schemas/LiveDefinition'}},
        **multi_definition['properties'],
    },
}

