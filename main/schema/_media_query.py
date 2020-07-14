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
        'description': 'Name of the media section.',
        'schema': {'type': 'string'},
    },
    {
        'name': 'md5',
        'in': 'query',
        'required': False,
        'description': 'MD5 sum of the media file.',
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
]
