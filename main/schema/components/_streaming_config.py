resolution_config = {
    'type': 'object',
    'description': 'Settings for streaming video encode. Any additional properties will '
                   'be passed as command line arguments to ffmpeg. If set to null, the '
                   'defaults are used (libx264 at 144p,320p,480p,720p,1080p)',
    'additionalProperties': True,
    'properties': {
        'vcodec': {
            'type': 'string',
            'description': 'Video codec.',
            'enum': ['libx264'], #Growth for additional formats later
            'default': 'libx264',
        },
        'crf': {
            'type': 'integer',
            'description': 'Constant rate factor.',
            'minimum': 0,
            'maximum': 51,
            'default': 23,
        },
        'resolution': {
            'type': 'integer',
            'description': 'Vertical Resolution',
            'minimum': 0,
            'maximum': 4096,
        }
    },
}

streaming_config = {
    'type': 'object',
    'description': 'Settings for streaming video encode.',
    'properties': {
        'resolutions': {
            'type': 'array',
            'description': 'Array of resolutions to encode for streaming',
            'items': {'$ref': '#/components/schemas/ResolutionConfig'},
        },
    }
}
