password_reset_spec = {
    'type': 'object',
    'required': ['email'],
    'properties': {
        'email': {
            'description': 'Email address registered for user requesting reset.',
            'type': 'string',
        },
    },
}

