from textwrap import dedent

from rest_framework.schemas.openapi import AutoSchema

from ._errors import error_responses
from ._message import message_schema

boilerplate = dedent("""\
Announcements are system-wide messages sent to users. Users may delete individual
announcements to acknowledge and stop displaying them.
""")

class AnnouncementListSchema(AutoSchema):
    def get_operation(self, path, method):
        operation = super().get_operation(path, method)
        if method == 'GET':
            operation['operationId'] = 'GetAnnouncementList'
        operation['tags'] = ['Tator']
        return operation

    def get_description(self, path, method):
        if method == 'GET':
            short_desc = "Get announcement list."
        return f"{short_desc}\n\n{boilerplate}"

    def _get_path_parameters(self, path, method):
        return []

    def _get_filter_parameters(self, path, method):
        return {}

    def _get_request_body(self, path, method):
        return {}

    def _get_responses(self, path, method):
        responses = error_responses()
        if method == 'GET':
            responses['200'] = {
                'description': 'Successful retrieval of announcement list.',
                'content': {'application/json': {'schema': {
                    'type': 'array',
                    'items': {'$ref': '#/components/schemas/Announcement'},
                }}},
            }
        return responses

class AnnouncementDetailSchema(AutoSchema):
    def get_operation(self, path, method):
        operation = super().get_operation(path, method)
        if method == 'DELETE':
            operation['operationId'] = 'DeleteAnnouncement'
        operation['tags'] = ['Tator']
        return operation

    def get_description(self, path, method):
        if method == 'DELETE':
            short_desc = "Delete announcement."
        return f"{short_desc}\n\n{boilerplate}"

    def _get_path_parameters(self, path, method):
        return [{
            'name': 'id',
            'in': 'path',
            'required': True,
            'description': 'A unique integer identifying a announcement.',
            'schema': {'type': 'integer'},
        }]

    def _get_filter_parameters(self, path, method):
        return []

    def _get_request_body(self, path, method):
        return {}

    def _get_responses(self, path, method):
        responses = error_responses()
        if method == 'DELETE':
            responses['200'] = message_schema('deletion', 'announcement')
        return responses
