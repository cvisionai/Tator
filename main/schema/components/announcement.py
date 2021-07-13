announcement = {
    'type': 'object',
    'description': 'Announcement object.',
    'properties': {
        'id': {
            'type': 'integer',
            'description': 'Unique integer identifying an announcement.',
        },
        'subject': {
            'description': 'Subject of the announcement.',
            'type': 'string',
        },
        'message': {
            'description': 'Message of the announcement.',
            'type': 'string',
        },
    },
}

