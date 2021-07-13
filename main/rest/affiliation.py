from django.db import transaction
from django.conf import settings

from ..models import Affiliation
from ..models import Organization
from ..models import User
from ..models import database_qs
from ..schema import AffiliationListSchema
from ..schema import AffiliationDetailSchema
from ..ses import TatorSES

from ._base_views import BaseListView
from ._base_views import BaseDetailView
from ._permissions import OrganizationAdminPermission

class AffiliationListAPI(BaseListView):
    """ Create or retrieve a list of organization affiliations.

        Affiliations specify a permission level of a user to an organization. There are currently
        two cumulative permission levels. `Member` can only view an organization and not change
        any data. `Admin` can modify an organization, add members to an organization, and create
        new projects under the organization's account.
    """
    schema = AffiliationListSchema()
    permission_classes = [OrganizationAdminPermission]
    http_method_names = ['get', 'post']

    def _get(self, params):
        members = Affiliation.objects.filter(organization=params['organization'])
        return database_qs(members)

    def _post(self, params):
        organization = params['organization']
        user = params['user']
        permission = params['permission']
        
        if permission not in ['Member', 'Admin']:
            raise ValueError(f"Permission must have one of the following values: Member, "
                              "Admin.")
        organization = Organization.objects.get(pk=organization)
        user = User.objects.get(pk=user) 
        affiliation = Affiliation.objects.create(
            organization=organization,
            user=user,
            permission=permission,
        )
        affiliation.save()

        # Send email notification to organizational admins.
        if settings.TATOR_EMAIL_ENABLED:
            recipients = Affiliation.objects.filter(organization=organization, permission='Admin')\
                                            .values_list('user', flat=True)
            recipients = User.objects.filter(pk__in=recipients).values_list('email', flat=True)
            recipients = list(recipients)
            email_response = TatorSES().email(
                sender=settings.TATOR_EMAIL_SENDER,
                recipients=recipients,
                title=f"{user} added to {organization}",
                text=f"You are being notified that a new user {user} (username {user.username}, "
                     f"email {user.email}) has been added to the Tator organization "
                     f"{organization}. This message has been sent to all organization admins. "
                      "No action is required.",
                html=None,
                attachments=[])
            if email_response['ResponseMetadata']['HTTPStatusCode'] != 200:
                logger.error(email_response)
                # Don't raise an error, email is not required for affiliation creation.
        
        return {'message': f"Affiliation of {user} to {organization} created!",
                'id': affiliation.id}

    def get_queryset(self):
        organization_id = self.kwargs['organization']
        members = Affiliation.objects.filter(organization__id=organization_id)
        return members

class AffiliationDetailAPI(BaseDetailView):
    """ Interact with an individual organization affiliation.

        Affiliations specify a permission level of a user to an organization. There are currently
        two cumulative permission levels. `Member` can only view an organization and not change
        any data. `Admin` can modify an organization, add members to an organization, and create
        new projects under the organization's account.
    """
    schema = AffiliationDetailSchema()
    permission_classes = [OrganizationAdminPermission]
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def _get(self, params):
        return database_qs(Affiliation.objects.filter(pk=params['id']))[0]

    @transaction.atomic
    def _patch(self, params):
        affiliation = Affiliation.objects.select_for_update().get(pk=params['id']) 
        if 'permission' in params:
            affiliation.permission = params['permission']
        affiliation.save()
        return {'message': f"Affiliation of {affiliation.user} to {affiliation.organization} "
                           f"permissions updated to {params['permission']}!"}

    def _delete(self, params):
        Affiliation.objects.get(pk=params['id']).delete()
        return {'message': f'Affiliation {params["id"]} successfully deleted!'}

    def get_queryset(self):
        return Affiliation.objects.all()
