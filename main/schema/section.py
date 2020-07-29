from textwrap import dedent

from rest_framework.schemas.openapi import AutoSchema

from ._errors import error_responses
from ._media_query import media_filter_parameter_schema
from ._attributes import attribute_filter_parameter_schema

boilerplate = dedent("""\
Sections are groupings of media in a project. A media may be a member of multiple sections.
""")

class SectionListSchema(AutoSchema):
    def get_operation(self, path, method):
        operation = super().get_operation(path, method)
        if method == 'POST':
            operation['operationId'] = 'CreateSection'
        elif method == 'GET':
            operation['operationId'] = 'GetSectionList'
        operation['tags'] = ['Tator']
        return operation

    def get_description(self, path, method):
        if method == 'GET':
            short_desc = "Get section list."
        elif method == 'POST':
            short_desc = "Create section."
        return f"{short_desc}\n\n{boilerplate}"

    def _get_path_parameters(self, path, method):
        return [{
            'name': 'project',
            'in': 'path',
            'required': True,
            'description': 'A unique integer identifying a project.',
            'schema': {'type': 'integer'},
        }]

    def _get_filter_parameters(self, path, method):
        params = []
        if method  == 'GET':
            params = media_filter_parameter_schema + attribute_filter_parameter_schema
        return params

    def _get_request_body(self, path, method):
        body = {}
        if method == 'POST':
            body = {
                'required': True,
                'content': {'application/json': {
                'schema': {'$ref': '#/components/schemas/SectionSpec'},
                'example': {
                    'name': 'My section',
                    'archived': False,
                },
            }}}
        return body

    def _get_responses(self, path, method):
        responses = error_responses()
        if method == 'GET':
            responses['200'] = {
                'description': 'Successful retrieval of sections.',
                'content': {'application/json': {'schema': {
                    '$ref': '#/components/schemas/Section',
                }}}
            }
        return responses

class SectionDetailSchema(AutoSchema):
    def get_operation(self, path, method):
        operation = super().get_operation(path, method)
        if method == 'GET':
            operation['operationId'] = 'GetSection'
        elif method == 'PATCH':
            operation['operationId'] = 'UpdateSection'
        elif method == 'DELETE':
            operation['operationId'] = 'DeleteSection'
        operation['tags'] = ['Tator']
        return operation

    def get_description(self, path, method):
        if method == 'GET':
            short_desc = "Get section."
        elif method == 'PATCH':
            short_desc = "Update section."
        elif method == 'DELETE':
            short_desc = "Delete section."
        return f"{short_desc}\n\n{boilerplate}"

    def _get_path_parameters(self, path, method):
        return [{
            'name': 'id',
            'in': 'path',
            'required': True,
            'description': 'A unique integer identifying a section.',
            'schema': {'type': 'integer'},
        }]

    def _get_filter_parameters(self, path, method):
        return []

    def _get_request_body(self, path, method):
        body = {}
        if method == 'PATCH':
            body = {
                'required': True,
                'content': {'application/json': {
                'schema': {'$ref': '#/components/schemas/SectionUpdate'},
                'example': {
                    'name': 'New name',
                    'archived': True,
                }
            }}}
        return body

    def _get_responses(self, path, method):
        responses = error_responses()
        if method == 'GET':
            responses['200'] = {
                'description': 'Successful retrieval of section.',
                'content': {'application/json': {'schema': {
                    '$ref': '#/components/schemas/Update',
                }}},
            }
        elif method == 'PATCH':
            responses['200'] = message_schema('update', 'section')
        elif method == 'DELETE':
            responses['200'] = message_schema('deletion', 'section')
        return responses
