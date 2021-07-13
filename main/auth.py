from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.conf import settings

from .notify import Notify
from datetime import datetime,timezone,timedelta

from .ses import TatorSES

import logging
logger = logging.getLogger(__name__)

UserModel = get_user_model()

LOCKOUT_LIMIT = 3
LOCKOUT_TIME = timedelta(minutes=10)

class TatorAuth(ModelBackend):
    """
    Authenticates against settings.AUTH_USER_MODEL but enforces account
    lockouts based on bad password attempts
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if username is None or password is None:
            return
        try:
            user = UserModel._default_manager.get_by_natural_key(username)
        except UserModel.DoesNotExist:
            # Run the default password hasher once to reduce the timing
            # difference between an existing and a nonexistent user (#20760).
            UserModel().set_password(password)
            return

        if user.failed_login_count >= LOCKOUT_LIMIT:
            now=datetime.now(timezone.utc)
            last_failed=user.last_failed_login
            since_last_fail=now - last_failed
            if since_last_fail <= LOCKOUT_TIME:
                user.last_failed_login = now
                user.failed_login_count += 1
                user.save()
                lockout_lifted=user.last_failed_login+LOCKOUT_TIME
                time_left=lockout_lifted-now
                msg = f" *SECURITY ALERT:* Attempt to login during lockout"
                msg += f" User={user}/{user.id}"
                msg += f" Attempt count = {user.failed_login_count}"
                msg += f" Lockout will be lifted in '{time_left}' at '{lockout_lifted}'"
                Notify.notify_admin_msg(msg)
                # Run the default password hasher once to reduce the timing
                # difference (#20760).
                UserModel().set_password(password)
                return

        if user.check_password(password) and self.user_can_authenticate(user):
            user.last_login = datetime.now(timezone.utc)
            if user.failed_login_count >= LOCKOUT_LIMIT:
                msg = "Login proceeded after lock expiry"
                msg += f" User={user}/{user.id}"
                Notify.notify_admin_msg(msg)
            user.failed_login_count = 0
            user.save()
            return user
        else:
            user.last_failed_login = datetime.now(timezone.utc)
            user.failed_login_count += 1
            user.save()
            if user.failed_login_count >= LOCKOUT_LIMIT:
                msg = f"*SECURITY ALERT:* Bad Login Attempt for {user}/{user.id}"
                msg += f" Attempt count = {user.failed_login_count}"
                Notify.notify_admin_msg(msg)
            # Send an email if the failed login count has been reached.
            if (user.failed_login_count == LOCKOUT_LIMIT) and settings.TATOR_EMAIL_ENABLED:
                email_response = TatorSES().email(
                    sender=settings.TATOR_EMAIL_SENDER,
                    recipients=[user.email],
                    title=f"Tator account has been locked",
                    text="This message is to notify you that your Tator account (username "
                        f"{user.username}) has been locked due to {LOCKOUT_LIMIT} failed logins. "
                         "Your account will be unlocked automatically after 10 minutes, or you "
                         "can unlock your account now by resetting your password. To reset your "
                         "password, follow the procedure described here:\n\n"
                         "https://tator.io/tutorials/2021-06-11-reset-your-password/",
                    html=None,
                    attachments=[])
                if email_response['ResponseMetadata']['HTTPStatusCode'] != 200:
                    logger.error(email_response)
