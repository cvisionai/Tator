import uuid
import os
import logging

from django.db import transaction
from django.conf import settings
from django.http import Http404

from ..models import PasswordReset
from ..models import User
from ..schema import PasswordResetListSchema
from ..ses import TatorSES

from ._base_views import BaseListView

logger = logging.getLogger(__name__)

class PasswordResetListAPI(BaseListView):
    """ Create a password reset.
    """
    schema = PasswordResetListSchema()
    http_method_names = ['post']

    def _post(self, params):
        email = params['email']
        users = User.objects.filter(email=email)
        if users.count() == 0:
            raise RuntimeError(f"Email {email} is not registered with a user!")
        if users.count() > 1:
            raise RuntimeError(f"Email {email} is in use by multiple users!")
        user = users[0]
        reset = PasswordReset(user=user,
                              reset_token=uuid.uuid1())
        url = f"{os.getenv('MAIN_HOST')}/password-reset?reset_token={reset.reset_token}&user={user.id}"
        if settings.TATOR_EMAIL_ENABLED:
            email_response = TatorSES().email(
                sender=settings.TATOR_EMAIL_SENDER,
                recipients=[email],
                title=f"Tator password reset",
                text=f"A password reset has been requested for this email address ({email}). "
                     f"If you did not initiate the reset this message can be ignored. "
                     f"To reset your password, please visit: \n\n{url}\n\n"
                      "This URL will expire in 24 hours.",
                html=None,
                attachments=[])
            if email_response['ResponseMetadata']['HTTPStatusCode'] != 200:
                logger.error(email_response)
                raise ValueError(f"Unable to send email to {email}! Password reset creation failed.")
        else:
            raise RuntimeError("Password resets are not configured! Contact your system "
                               "administrator.")
        reset.save()
        return {'message': "Password reset created successfully! An email was sent to {email}."}
