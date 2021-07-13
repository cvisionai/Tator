invitation_properties = {
    'email': {
        'description': 'Email address of invitee.',
        'type': 'string',
    },
    'permission': {
        'description': 'User permission level for the organization.',
        'type': 'string',
        'enum': ['Member', 'Admin'],
    },
}

invitation_spec = {
    'type': 'object',
    'required': ['email', 'permission'],
    'properties': invitation_properties,
}

invitation_update = {
    'type': 'object',
    'properties': {
        'status': {
            'description': 'Status of the invitation.',
            'type': 'string',
            'enum': ['Accepted'],
        },
    },
}

invitation = {
    'type': 'object',
    'description': 'Invitation object.',
    'properties': {
        'id': {
            'type': 'integer',
            'description': 'Unique integer identifying an invitation.',
        },
        'organization': {
            'description': 'Unique integer identifying an organization.',
            'type': 'integer',
            'minimum': 1,
        },
        'created_by': {
            'type': 'integer',
            'description': 'Unique integer identifying a user.',
        },
        'created_username': {
            'description': 'Username of creator of the invitation.',
            'type': 'string',
        },
        'created_datetime': {
            'type': 'string',
            'format': 'date-time',
            'description': 'Datetime this invitation was created.',
        },
        'status': {
            'description': 'Status of the invitation.',
            'type': 'string',
            'enum': ['Pending', 'Expired', 'Accepted'],
        },
        **invitation_properties,
    },
}

