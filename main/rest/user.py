from uuid import uuid1

from django.db import transaction
from django.conf import settings
from rest_framework.exceptions import ValidationError

from ..models import User
from ..models import Invitation
from ..models import Affiliation
from ..models import PasswordReset
from ..serializers import UserSerializerBasic
from ..schema import UserExistsSchema
from ..schema import UserListSchema
from ..schema import UserDetailSchema
from ..schema import CurrentUserSchema

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import UserPermission
from ._permissions import UserListPermission

class UserExistsAPI(BaseDetailView):
    """ Determine whether user exists.
    """
    schema = UserExistsSchema()
    queryset = User.objects.all()
    http_method_names = ['get']
    # This endpoint does not require authentication.

    def _get(self, params):
        email = params.get('email', None)
        username = params.get('username', None)
        if email is None and username is None:
            raise Exception("One of username or email must be supplied!")
        elif email is not None:
            users = User.objects.filter(email=email)
        elif username is not None:
            users = User.objects.filter(username=username)
        else:
            users = User.objects.filter(username=username, email=email)
        return users.exists()

class UserListAPI(BaseListView):
    """ Get list of users.
    """
    schema = UserListSchema()
    queryset = User.objects.all()
    permission_classes = [UserListPermission]
    http_method_names = ['get', 'post']

    def _get(self, params):
        email = params.get('email', None)
        username = params.get('username', None)
        if email is None and username is None:
            raise Exception("One of username or email must be supplied!")
        elif email is not None:
            users = User.objects.filter(email=email)
        elif username is not None:
            users = User.objects.filter(username=username)
        else:
            users = User.objects.filter(username=username, email=email)
        return UserSerializerBasic(users, many=True).data

    def _post(self, params):
        first_name = params['first_name']
        last_name = params['last_name']
        email = params['email']
        username = params['username']
        password = params['password']
        registration_token = params.get('registration_token')

        if registration_token is None:
            # This is an anonymous registration, check to see if this is allowed.
            if settings.ANONYMOUS_REGISTRATION_ENABLED:
                # Create a user.
                user = User(first_name=first_name,
                            last_name=last_name,
                            email=email,
                            username=username)
                if settings.EMAIL_CONFIRMATION_REQUIRED:
                    if settings.TATOR_EMAIL_ENABLED == 'true':
                        user.is_active = False
                        user.confirmation_token = uuid.uuid1()
                        # Send email
                        email_response = TatorSES().email(
                            sender=settings.TATOR_EMAIL_SENDER,
                            recipients=[email],
                            title="Tator email confirmation",
                            text="To confirm your email address and complete registration with "
                                 "Tator, please visit or click the following link: "
                                 "{os.getenv('MAIN_HOST')}/email-confirmation/{user.confirmation_token}",
                            html=None,
                            attachments=[])
                        if email_response['ResponseMetadata']['HTTPStatusCode'] != 200:
                            logger.error(email_response)
                            raise ValueError(f"Unable to send email to {email}! User creation failed.")
                    else:
                        raise ValueError(f"Cannot enable email confirmation without email service!")
                user.set_password(password)
                user.save()
            else:
                raise ValueError(f"Registration token must be supplied in URL!")
        else:
            # A registration token has been supplied, use it to find Invitation objects.
            invites = Invitation.objects.filter(registration_token=registration_token,
                                                status='Pending')
            if invites.count() == 0:
                raise ValueError("Registration token is expired or invalid!")
            else:
                invite = invites[0]
                if (invite.email != email):
                    raise ValueError("Email address must match where registration token was sent!")
                user = User(first_name=first_name,
                            last_name=last_name,
                            email=email,
                            username=username)
                user.set_password(password)
                user.save()
                invite.status = "Accepted"
                invite.save()
                Affiliation.objects.create(organization=invite.organization,
                                           permission=invite.permission,
                                           user=user)
        return {'message': f"User {username} created!",
                'id': user.id}

class UserDetailAPI(BaseDetailView):
    """ Interact with an individual user.
    """
    schema = UserDetailSchema()
    queryset = User.objects.all()
    permission_classes = [UserPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch']

    def _get(self, params):
        user = User.objects.get(pk=params['id'])
        return UserSerializerBasic(user).data

    @transaction.atomic
    def _patch(self, params):
        user = User.objects.get(pk=params['id'])
        if user.username == 'anonymous':
            raise RuntimeError(f'Anonymous user cannot be modified!')
        if 'first_name' in params:
            user.first_name = params['first_name']
        if 'last_name' in params:
            user.last_name = params['last_name']
        if 'email' in params:
            existing = User.objects.filter(email=params['email'])
            if existing.count() > 0:
                raise RuntimeError(f"User with email {params['email']} already exists!")
            user.email = params['email']
        if 'password' in params:
            if 'reset_token' not in params:
                raise RuntimeError(f"Password cannot be changed without reset token!")
            resets = PasswordReset.objects.filter(reset_token=params['reset_token'],
                                                  user=user)
            if resets.count() == 0:
                raise ValueError("Reset token is expired or invalid!")
            else:
                user.set_password(params['password'])
                user.failed_login_count = 0
        user.save()
        return {'message': f'Updated user {params["id"]} successfully!'}

class CurrentUserAPI(BaseDetailView):
    """ Returns the current user.

        This is the equivalent of a whoami() operation.
    """
    schema = CurrentUserSchema()
    http_method_names = ['get']

    def _get(self, params):
        return UserSerializerBasic(self.request.user).data
