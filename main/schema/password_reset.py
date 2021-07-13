from textwrap import dedent

from rest_framework.schemas.openapi import AutoSchema

from ._errors import error_responses
from ._message import message_schema

boilerplate = dedent("""\
This endpoint will send an email to a registered user with the email address provided.
The email will contain a link that will allow the user to reset their password. If the
email address is registered for multiple users or no users an exception will be raised
and an email will not be sent. If the email fails to be sent, either due to a bad
response or system configuration that does not allow sending emails, an exception
will be raised.
""")

class PasswordResetListSchema(AutoSchema):
    def get_operation(self, path, method):
        operation = super().get_operation(path, method)
        if method == 'POST':
            operation['operationId'] = 'CreatePasswordReset'
        operation['tags'] = ['Tator']
        return operation

    def get_description(self, path, method):
        if method == 'POST':
            short_desc = "Create password reset."
        return f"{short_desc}\n\n{boilerplate}"

    def _get_path_parameters(self, path, method):
        return []

    def _get_filter_parameters(self, path, method):
        return {}

    def _get_request_body(self, path, method):
        body = {}
        if method == 'POST':
            body = {
                'required': True,
                'content': {'application/json': {
                'schema': {'$ref': '#/components/schemas/PasswordResetSpec'},
            }}}
        return body

    def _get_responses(self, path, method):
        responses = error_responses()
        if method == 'POST':
            responses['201'] = message_schema('creation', 'password reset')
        return responses

