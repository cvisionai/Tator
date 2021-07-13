from django.views import View
from django.views.generic.base import TemplateView
from django.shortcuts import render
from django.shortcuts import redirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import AnonymousUser

from rest_framework.authentication import TokenAuthentication
import yaml

from .models import Project
from .models import Media
from .models import Membership
from .notify import Notify
from .cache import TatorCache

import os
import logging

import sys
import traceback

# Load the main.view logger
logger = logging.getLogger(__name__)


class APIBrowserView(LoginRequiredMixin, TemplateView):
    template_name = 'browser.html'
    extra_context = {'schema_url': 'schema'}


class MainRedirect(View):
    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            out = redirect('projects')
        else:
            if os.getenv('COGNITO_ENABLED') == 'TRUE':
                with open('/cognito/cognito.yaml', 'r') as f:
                    config = yaml.safe_load(f)
                out = redirect(f"https://{config['domain']}/login"
                               f"?client_id={config['client-id']}"
                               "&response_type=code&scope=openid"
                               f"&redirect_uri=https://{os.getenv('MAIN_HOST')}/jwt-gateway")
            else:
                out = redirect('accounts/login')
        return out

class RegistrationView(TemplateView):
    template_name = 'registration/registration.html'

class PasswordResetRequestView(TemplateView):
    template_name = 'password-reset/password-reset-request.html'

class PasswordResetView(TemplateView):
    template_name = 'password-reset/password-reset.html'

class ProjectsView(LoginRequiredMixin, TemplateView):
    template_name = 'projects.html'

class AccountProfileView(LoginRequiredMixin, TemplateView):
    template_name = 'account-profile/account-profile.html'

class TokenView(LoginRequiredMixin, TemplateView):
    template_name = 'token.html'

class ProjectBase(LoginRequiredMixin):

    def get_context_data(self, **kwargs):
        # Get project info.
        context = super().get_context_data(**kwargs)
        project = get_object_or_404(Project, pk=self.kwargs['project_id'])
        context['project'] = project

        # Check if user is part of project.
        if not project.has_user(self.request.user.pk):
            raise PermissionDenied
        return context


class ProjectDetailView(ProjectBase, TemplateView):
    template_name = 'project-detail.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        token, _ = Token.objects.get_or_create(user=self.request.user)
        context['token'] = token
        return context


class ProjectSettingsView(ProjectBase, TemplateView):
    template_name = 'project-settings.html'


class AnalyticsDashboardView(ProjectBase, TemplateView):
    template_name = 'analytics/dashboard.html'


class AnalyticsLocalizationsView(ProjectBase, TemplateView):
    template_name = 'analytics/localizations.html'


class AnalyticsCollectionsView(ProjectBase, TemplateView):
    template_name = 'analytics/collections.html'


class AnalyticsVisualizationView(ProjectBase, TemplateView):
    template_name = 'analytics/visualization.html'


class AnalyticsReportsView(ProjectBase, TemplateView):
    template_name = 'analytics/reports.html'


class AnnotationView(ProjectBase, TemplateView):
    template_name = 'annotation.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        media = get_object_or_404(Media, pk=self.kwargs['id'])
        context['media'] = media
        return context


def validate_project(user, project):
    # We only cache 'True' effectively with this logic
    granted = TatorCache().get_cred_cache(user.id, project.id)
    if granted:
        return granted

    if isinstance(user, AnonymousUser):
        granted = False
    else:
        # Find membership for this user and project
        membership = Membership.objects.filter(
            user=user,
            project=project
        )

        # If user is not part of project, deny access
        if membership.count() == 0:
            granted = False
        else:
            # Only cache granted attempts
            granted = True
            TatorCache().set_cred_cache(user.id, project.id, granted)
    return granted


class AuthProjectView(View):
    def dispatch(self, request, *args, **kwargs):
        """ Identifies permissions for a file in /media
        User must be part of the project to access media files.
        Returns 200 on OK, returns 403 on Forbidden
        """

        original_url = request.headers['X-Original-URI']

        # For some reason, TokenAuthentication doesn't work by default
        # So if the session authentication didn't trigger, manually check
        # to see if a token was provided. Bail out if the user is anonymous
        # before we get too far
        user = request.user
        if isinstance(user, AnonymousUser):
            try:
                (user, token) = TokenAuthentication().authenticate(request)
            except Exception as e:
                msg = "*Security Alert:* "
                msg += f"Bad credentials presented for '{original_url}' ({user})"
                Notify.notify_admin_msg(msg)
                logger.warn(msg)
                return HttpResponse(status=403)

        filename = os.path.basename(original_url)

        project = None
        try:
            comps = original_url.split('/')
            project_id = comps[2]
            if project_id.isdigit() is False:
                project_id = comps[3]
            project = Project.objects.get(pk=project_id)
            authorized = validate_project(user, project)
        except Exception as e:
            logger.info(f"ERROR: {e}")
            authorized = False

        if authorized:
            return HttpResponse(status=200)
        else:
            # Files that aren't in the whitelist or database are forbidden
            msg = f"({user}/{user.id}): "
            msg += f"Attempted to access unauthorized file '{original_url}'"
            msg += f". "
            msg += f"Does not have access to '{project}'"
            Notify.notify_admin_msg(msg)
            return HttpResponse(status=403)

        return HttpResponse(status=403)


class AuthAdminView(View):
    def dispatch(self, request, *args, **kwargs):
        """ Identifies permissions for an nginx location requiring admin
        User must have the is_staff flag enabled.
        Returns 200 on OK, returns 403 on Forbidden
        """
        original_url = request.headers['X-Original-URI']

        # For some reason, TokenAuthentication doesn't work by default
        # So if the session authentication didn't trigger, manually check
        # to see if a token was provided. Bail out if the user is anonymous
        # before we get too far
        user = request.user
        if isinstance(user, AnonymousUser):
            try:
                (user, token) = TokenAuthentication().authenticate(request)
            except Exception as e:
                msg = "*Security Alert:* "
                msg += f"Bad credentials presented for '{original_url}'"
                Notify.notify_admin_msg(msg)
                return HttpResponse(status=403)

        if user.is_staff:
            return HttpResponse(status=200)
        else:
            # Files that aren't in the whitelist or database are forbidden
            msg = f"({user}/{user.id}): "
            msg += f"Attempted to access unauthorized URL '{original_url}'"
            msg += f"."
            Notify.notify_admin_msg(msg)
            return HttpResponse(status=403)

        return HttpResponse(status=403)


def ErrorNotifierView(request, code, message, details=None):

    context = {}
    context['code'] = code
    context['msg'] = message
    context['details'] = details
    response = render(request, 'error-page.html', context=context)
    response.status_code = code

    # Generate slack message
    if Notify.notification_enabled():
        msg = f"{request.get_host()}:"
        msg += f" ({request.user}/{request.user.id})"
        msg += f" caused {code} at {request.get_full_path()}"
        if details:
            Notify.notify_admin_file(msg, msg + '\n' + details)
        else:
            if code == 404 and isinstance(request.user, AnonymousUser):
                logger.warn(msg)
            else:
                Notify.notify_admin_msg(msg)

    return response


def NotFoundView(request, exception=None):
    return ErrorNotifierView(request, 404, "Not Found")


def PermissionErrorView(request, exception=None):
    return ErrorNotifierView(request, 403, "Permission Denied")


def ServerErrorView(request, exception=None):
    e_type, value, tb = sys.exc_info()
    error_trace = traceback.format_exception(e_type, value, tb)
    return ErrorNotifierView(request,
                             500,
                             "Server Error",
                             ''.join(error_trace))
