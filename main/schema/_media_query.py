media_filter_parameter_schema = [
    {
        'name': 'media_id',
        'in': 'query',
        'required': False,
        'description': 'List of integers identifying media.',
        'explode': False,
        'schema': {
            'type': 'array',
            'items': {
                'type': 'integer',
                'minimum': 1,
            },
        },
    },
    {
        'name': 'type',
        'in': 'query',
        'required': False,
        'description': 'Unique integer identifying media type.',
        'schema': {'type': 'integer'},
    },
    {
        'name': 'name',
        'in': 'query',
        'required': False,
        'description': 'Name of the media to filter on.',
        'schema': {'type': 'string'},
    },
    {
        'name': 'section',
        'in': 'query',
        'required': False,
        'description': 'Unique integer identifying a media section.',
        'schema': {'type': 'integer'},
    },
    {
        'name': 'dtype',
        'in': 'query',
        'required': False,
        'description': 'Data type of the files, either image or video.',
        'schema': {'type': 'string', 'enum': ['image', 'video']},
    },
    {
        'name': 'md5',
        'in': 'query',
        'required': False,
        'description': 'MD5 sum of the media file.',
        'schema': {'type': 'string'},
    },
    {
        'name': 'gid',
        'in': 'query',
        'required': False,
        'description': 'Upload group ID of the media file.',
        'schema': {'type': 'string'},
    },
    {
        'name': 'uid',
        'in': 'query',
        'required': False,
        'description': 'Upload unique ID of the media file.',
        'schema': {'type': 'string'},
    },
    {
        'name': 'after',
        'in': 'query',
        'required': False,
        'description': 'If given, all results returned will be after the '
                       'file with this filename. The `start` and `stop` '
                       'parameters are relative to this modified range.',
        'schema': {'type': 'string'},
    },
    {
        'name': 'archived',
        'in': 'query',
        'required': False,
        'description': 'If given, results returned will have the given archival state. '
                       'Default is "live".',
        'schema': {'type': 'string', 'enum': ['live', 'archived', 'all']},
    },
]
