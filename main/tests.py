import os
import json
import random
import datetime
import logging
import string
import functools
import time
from uuid import uuid1
from math import sin, cos, sqrt, atan2, radians
import re

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.base import ContentFile
from django.contrib.gis.geos import Point
from rest_framework import status
from rest_framework.test import APITestCase
from dateutil.parser import parse as dateutil_parse
from botocore.errorfactory import ClientError

from .models import *
from .store import get_tator_store
from .search import TatorSearch, ALLOWED_MUTATIONS

logger = logging.getLogger(__name__)

TEST_IMAGE = 'https://www.cvisionai.com/static/b91b90512c92c96884afd035c2d9c81a/f2464/tator-cloud.png'

def create_test_user():
    return User.objects.create(
        username=random.choices(string.ascii_lowercase, k=10),
        password="jsnow",
        first_name="Jon",
        last_name="Snow",
        email="jon.snow@gmail.com",
        middle_initial="A",
        initials="JAS",
    )

def create_test_organization():
    return Organization.objects.create(
        name="my_org",
    )

def create_test_affiliation(user, organization):
    return Affiliation.objects.create(
        user=user,
        organization=organization,
        permission='Admin',
    )

def create_test_bucket(organization):
    return Bucket.objects.create(
        name=str(uuid1()),
        organization=organization,
        access_key='asdf',
        secret_key='asdf',
        endpoint_url='https://asdf.com',
        region='us-east-2',
    )

def create_test_project(user, organization=None):
    return Project.objects.create(
        name="asdf",
        creator=user,
        organization=organization,
    )

def create_test_membership(user, project):
    return Membership.objects.create(
        user=user,
        project=project,
        permission=Permission.FULL_CONTROL,
    )

def create_test_algorithm(user, name, project):
    obj = Algorithm.objects.create(
        name=name,
        project=project,
        user=user,
        files_per_job=1,
        description="test description",
        categories=["categoryA", "categoryB"],
        parameters=[{"name": "param-name", "value": "param-dtype"}]
    )
    obj.manifest.save(
        name='asdf.yaml',
        content=ContentFile(
"""
apiVersion: argoproj.io/v1alpha1
kind: Workflow                  # new type of k8s spec
metadata:
  generateName: hello-world-    # name of the workflow spec
spec:
  entrypoint: whalesay          # invoke the whalesay template
  ttlSecondsAfterFinished: 30
  templates:
  - name: whalesay              # name of the template
    container:
      image: docker/whalesay
      command: [cowsay]
      args: ["hello world"]
      resources:                # limit the resources
        limits:
          memory: 32Mi
          cpu: 100m
""",
        ),
    )
    return obj

def create_test_section(name, project):
    return Section.objects.create(name=name, project=project)

def create_test_favorite(name, project, user, meta):
    return Favorite.objects.create(name=name, project=project, user=user,
                                   meta=meta, values={})

def create_test_bookmark(name, project, user):
    return Bookmark.objects.create(name=name, project=project, user=user, uri='/projects')

def create_test_video(user, name, entity_type, project):
    return Media.objects.create(
        name=name,
        meta=entity_type,
        project=project,
        md5='',
        num_frames=1,
        fps=30.0,
        codec='H264',
        width='640',
        height='480',
    )

def create_test_image(user, name, entity_type, project):
    return Media.objects.create(
        name=name,
        meta=entity_type,
        project=project,
        md5='',
        width='640',
        height='480',
    )

def create_test_box(user, entity_type, project, media, frame):
    x = random.uniform(0.0, float(media.width))
    y = random.uniform(0.0, float(media.height))
    w = random.uniform(0.0, float(media.width) - x)
    h = random.uniform(0.0, float(media.height) - y)
    return Localization.objects.create(
        user=user,
        meta=entity_type,
        project=project,
        version=project.version_set.all()[0],
        media=media,
        frame=frame,
        x=x,
        y=y,
        width=w,
        height=h,
    )

def create_test_box_with_attributes(user, entity_type, project, media, frame, attributes):
    test_box = create_test_box(user, entity_type, project, media, frame)
    test_box.attributes.update(attributes)
    test_box.save()
    return test_box

def create_test_line(user, entity_type, project, media, frame):
    x0 = random.uniform(0.0, float(media.width))
    y0 = random.uniform(0.0, float(media.height))
    x1 = random.uniform(0.0, float(media.width) - x0)
    y1 = random.uniform(0.0, float(media.height) - y0)
    return Localization.objects.create(
        user=user,
        meta=entity_type,
        project=project,
        media=media,
        frame=frame,
        x=x0, y=y0, u=(x1 - x0), v=(y1 - y0),
    )

def create_test_dot(user, entity_type, project, media, frame):
    x = random.uniform(0.0, float(media.width))
    y = random.uniform(0.0, float(media.height))
    return Localization.objects.create(
        user=user,
        meta=entity_type,
        project=project,
        media=media,
        frame=frame,
        x=x,
        y=y,
    )

def create_test_leaf(name, entity_type, project):
    return Leaf.objects.create(
        name=name,
        meta=entity_type,
        project=project,
        path=''.join(random.choices(string.ascii_lowercase, k=10)),
    )

def create_test_attribute_types():
    """Create one of each attribute type.
    """
    return [
        dict(
            name='Bool Test',
            dtype='bool',
            default=False,
        ),
        dict(
            name='Int Test',
            dtype='int',
            default=42,
            minimum=-10000,
            maximum=10000,
        ),
        dict(
            name='Float Test',
            dtype='float',
            default=42.0,
            minimum=-10000.0,
            maximum=10000.0,
        ),
        dict(
            name='Enum Test',
            dtype='enum',
            choices=['enum_val1', 'enum_val2', 'enum_val3'],
            default='enum_val1',
        ),
        dict(
            name='String Test',
            dtype='string',
            default='asdf_default',
            style='long_string',
        ),
        dict(
            name='Datetime Test',
            dtype='datetime',
            use_current=True,
        ),
        dict(
            name='Geoposition Test',
            dtype='geopos',
            default=[-179.0, -89.0],
        ),
    ]

def create_test_version(name, description, number, project, media):
    return Version.objects.create(
        name=name,
        description=description,
        number=number,
        project=project,
    )

def random_string(length):
    return ''.join(random.choice(string.ascii_letters) for _ in range(length))

def random_datetime(start, end):
    """Generate a random datetime between `start` and `end`"""
    return start + datetime.timedelta(
        seconds=random.randint(0, int((end - start).total_seconds())),
    )

def random_latlon():
    return (random.uniform(-90.0, 90.0), random.uniform(-180.0, 180.0))

def latlon_distance(lat0, lon0, lat1, lon1):
    R = 6373.0 # Radius of earth in km
    rlat0 = radians(lat0)
    rlon0 = radians(lon0)
    rlat1 = radians(lat1)
    rlon1 = radians(lon1)
    dlon = rlon1 - rlon0
    dlat = rlat1 - rlat0
    a = sin(dlat / 2)**2 + cos(rlat0) * cos(rlat1) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    distance = R * c
    return distance

permission_levels = [
    Permission.VIEW_ONLY,
    Permission.CAN_EDIT,
    Permission.CAN_TRANSFER,
    Permission.CAN_EXECUTE,
    Permission.FULL_CONTROL
]

affiliation_levels = [
    'Member',
    'Admin',
]

class DefaultCreateTestMixin:
    def _check_object(self, response, is_default):
        # Get the created objects.
        if isinstance(response.data['id'], list):
            id_ = response.data['id'][0]
        else:
            id_ = response.data['id']
        # Assert it has all the expected values.
        obj = type(self.entities[0]).objects.get(pk=id_)
        for attr_type in self.entity_type.attribute_types:
            field = attr_type['name']
            if is_default:
                if not attr_type['dtype'] == 'datetime':
                    default = attr_type['default']
                    self.assertTrue(obj.attributes[field]==default)
            else:
                if isinstance(self.create_json, dict):
                    self.assertTrue(obj.attributes[field]==self.create_json[field])
                else:
                    for create_json in self.create_json:
                        create_json[field]
                        obj.attributes[field]
                        self.assertTrue(obj.attributes[field]==create_json[field])
        # Delete the object
        obj.delete()

    def test_create_default(self):
        endpoint = f'/rest/{self.list_uri}/{self.project.pk}'
        # Remove attribute values.
        def clear_attributes(obj):
            delete_fields = []
            cpy = dict(obj)
            for key in cpy:
                if key.endswith(' Test'):
                    delete_fields.append(key)
            for field in delete_fields:
                del cpy[field]
            return cpy
        if isinstance(self.create_json, dict):
            create_json = clear_attributes(self.create_json)
        else:
            create_json = [clear_attributes(obj) for obj in self.create_json]
        # Post the json with no attribute values.
        response = self.client.post(endpoint, create_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self._check_object(response, True)
        # Post the json with attribute values.
        response = self.client.post(endpoint, self.create_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self._check_object(response, False)

class PermissionCreateTestMixin:
    def test_create_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_201_CREATED
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            endpoint = f'/rest/{self.list_uri}/{self.project.pk}'
            response = self.client.post(endpoint, self.create_json, format='json')
            self.assertEqual(response.status_code, expected_status)
            if hasattr(self, 'entities'):
                obj_type = type(self.entities[0])
            if expected_status == status.HTTP_201_CREATED:
                if 'id' in response.data:
                    if isinstance(response.data['id'], list):
                        created_id = response.data['id'][0]
                    else:
                        created_id = response.data['id']
                    response = self.client.delete(f'/rest/{self.detail_uri}/{created_id}')
                    self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

class PermissionListTestMixin:
    def test_list_patch_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            test_val = random.random() > 0.5
            response = self.client.patch(
                f'/rest/{self.list_uri}/{self.project.pk}'
                f'?type={self.entity_type.pk}',
                {'attributes': {'Bool Test': test_val}},
                format='json')
            self.assertEqual(response.status_code, expected_status)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

    def test_list_delete_permissions(self):
        # Wait for ES
        time.sleep(1)
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            response = self.client.delete(
                f'/rest/{self.list_uri}/{self.project.pk}'
                f'?type={self.entity_type.pk}')
            self.assertEqual(response.status_code, expected_status)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

class PermissionDetailTestMixin:
    def test_detail_patch_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            if 'name' in self.patch_json:
                self.patch_json['name'] += f"_{index}"
            response = self.client.patch(
                f'/rest/{self.detail_uri}/{self.entities[0].pk}',
                self.patch_json,
                format='json')
            self.assertEqual(response.status_code, expected_status)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

    def test_detail_delete_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            test_val = random.random() > 0.5
            response = self.client.delete(
                f'/rest/{self.detail_uri}/{self.entities[0].pk}',
                format='json')
            self.assertEqual(response.status_code, expected_status)
            if expected_status == status.HTTP_200_OK:
                del self.entities[0]
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

class PermissionListMembershipTestMixin:
    def test_list_not_a_member_permissions(self):
        self.membership.delete()
        url = f'/rest/{self.list_uri}/{self.project.pk}'
        if hasattr(self, 'entity_type'):
            url += f'?type={self.entity_type.pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.membership.save()

    def test_list_is_a_member_permissions(self):
        self.membership.permission = Permission.VIEW_ONLY
        self.membership.save()
        url = f'/rest/{self.list_uri}/{self.project.pk}'
        if hasattr(self, 'entity_type'):
            url += f'?type={self.entity_type.pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

class PermissionDetailMembershipTestMixin:
    def test_detail_not_a_member_permissions(self):
        self.membership.delete()
        url = f'/rest/{self.detail_uri}/{self.entities[0].pk}'
        if hasattr(self, 'entity_type'):
            url += f'?type={self.entity_type.pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.membership.save()

    def test_detail_is_a_member_permissions(self):
        self.membership.permission = Permission.VIEW_ONLY
        self.membership.save()
        url = f'/rest/{self.detail_uri}/{self.entities[0].pk}'
        if hasattr(self, 'entity_type'):
            url += f'?type={self.entity_type.pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

class PermissionListAffiliationTestMixin:
    def test_list_not_a_member_permissions(self):
        affiliation = self.get_affiliation(self.organization, self.user)
        affiliation.delete()
        url = f'/rest/{self.list_uri}/{self.organization.pk}'
        if hasattr(self, 'entity_type'):
            url += f'?type={self.entity_type.pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        affiliation.save()

    def test_list_is_a_member_permissions(self):
        for index, level in enumerate(affiliation_levels):
            affiliation = self.get_affiliation(self.organization, self.user)
            affiliation.permission = level
            affiliation.save()
            if self.get_requires_admin and not (level == 'Admin'):
                expected_status = status.HTTP_403_FORBIDDEN
            else:
                expected_status = status.HTTP_200_OK
            url = f'/rest/{self.list_uri}/{self.organization.pk}'
            if hasattr(self, 'entity_type'):
                url += f'?type={self.entity_type.pk}'
            response = self.client.get(url)
            self.assertEqual(response.status_code, expected_status)
        affiliation.permission = 'Admin'
        affiliation.save()

class PermissionDetailAffiliationTestMixin:
    def test_detail_not_a_member_permissions(self):
        affiliation = self.get_affiliation(self.get_organization(), self.user)
        affiliation.delete()
        url = f'/rest/{self.detail_uri}/{self.entities[0].pk}'
        if hasattr(self, 'entity_type'):
            url += f'?type={self.entity_type.pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        affiliation.save()

    def test_detail_is_a_member_permissions(self):
        for index, level in enumerate(affiliation_levels):
            affiliation = self.get_affiliation(self.get_organization(), self.user)
            affiliation.permission = level
            affiliation.save()
            if self.get_requires_admin and not (level == 'Admin'):
                expected_status = status.HTTP_403_FORBIDDEN
            else:
                expected_status = status.HTTP_200_OK
            url = f'/rest/{self.detail_uri}/{self.entities[0].pk}'
            if hasattr(self, 'entity_type'):
                url += f'?type={self.entity_type.pk}'
            response = self.client.get(url)
            self.assertEqual(response.status_code, expected_status)
        affiliation.permission = 'Admin'
        affiliation.save()

    def test_detail_patch_permissions(self):
        permission_index = affiliation_levels.index(self.edit_permission)
        for index, level in enumerate(affiliation_levels):
            obj = Affiliation.objects.filter(organization=self.get_organization(), user=self.user)[0]
            obj.permission = level
            obj.save()
            del obj
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            response = self.client.patch(
                f'/rest/{self.detail_uri}/{self.entities[0].pk}',
                self.patch_json,
                format='json')
            self.assertEqual(response.status_code, expected_status)

    def test_detail_delete_permissions(self):
        permission_index = affiliation_levels.index(self.edit_permission)
        for index, level in enumerate(affiliation_levels):
            obj = Affiliation.objects.filter(organization=self.get_organization(), user=self.user)[0]
            obj.permission = level
            obj.save()
            del obj
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            test_val = random.random() > 0.5
            response = self.client.delete(
                f'/rest/{self.detail_uri}/{self.entities[0].pk}',
                format='json')
            self.assertEqual(response.status_code, expected_status)
            if expected_status == status.HTTP_200_OK:
                del self.entities[0]

class AttributeMediaTestMixin:
    def test_media_with_attr(self):
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?media_id={self.media_entities[0].pk}'
            f'&type={self.entity_type.pk}&attribute=Bool Test::true'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

class AttributeTestMixin:
    def test_query_no_attributes(self):
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(len(response.data), len(self.entities))
        this_ids = [e.pk for e in self.entities]
        rest_ids = [e['id'] for e in response.data]
        for this_id, rest_id in zip(sorted(this_ids), sorted(rest_ids)):
            self.assertEqual(this_id, rest_id)

    def test_multiple_attribute(self):
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}'
            f'?type={self.entity_type.pk}&attribute=Bool Test::true&attribute=Int Test::0'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pagination(self):
        test_vals = [random.random() > 0.5 for _ in range(len(self.entities))]
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Bool Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}'
            f'?format=json'
            f'&attribute=Bool Test::true'
            f'&type={self.entity_type.pk}'
            f'&start=0'
            f'&stop=2'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), max(0, min(sum(test_vals), 2)))
        response1 = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}'
            f'?format=json'
            f'&attribute=Bool Test::true'
            f'&type={self.entity_type.pk}'
            f'&start=1'
            f'&stop=4'
        )
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response1.data), max(0, min(sum(test_vals) - 1, 3)))
        if len(response.data) >= 2 and len(response1.data) >= 1:
            self.assertEqual(response.data[1], response1.data[0])

    def test_list_patch(self):
        test_val = random.random() > 0.5
        response = self.client.patch(
            f'/rest/{self.list_uri}/{self.project.pk}'
            f'?type={self.entity_type.pk}',
            {'attributes': {'Bool Test': test_val}},
            format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for entity in self.entities:
            response = self.client.get(f'/rest/{self.detail_uri}/{entity.pk}')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['attributes']['Bool Test'], test_val)

    def test_list_delete(self):
        test_val = random.random() > 0.5
        to_delete = [self.create_entity() for _ in range(5)]
        obj_ids = list(map(lambda x: str(x.pk), to_delete))
        for obj_id in obj_ids:
            response = self.client.get(f'/rest/{self.detail_uri}/{obj_id}')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            # Update objects with a string so we know which to delete
            response = self.client.patch(
                f'/rest/{self.detail_uri}/{obj_id}',
                {'attributes': {'String Test': 'DELETE ME!!!'}},
                format='json')
        TatorSearch().refresh(self.project.pk)
        response = self.client.delete(
            f'/rest/{self.list_uri}/{self.project.pk}'
            f'?type={self.entity_type.pk}'
            f'&attribute=String Test::DELETE ME!!!')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for obj_id in obj_ids:
            response = self.client.get(f'/rest/{self.detail_uri}/{obj_id}')
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        for entity in self.entities:
            response = self.client.get(f'/rest/{self.detail_uri}/{entity.pk}')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_null_attr(self):
        test_vals = [random.random() > 0.5 for _ in range(len(self.entities))]
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Bool Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_null=Bool Test::false'
            f'&type={self.entity_type.pk}', # needed for localizations
            format='json'
        )
        self.assertEqual(len(response.data), len(self.entities))
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_null=Bool Test::true'
            f'&type={self.entity_type.pk}', # needed for localizations
            format='json'
        )
        self.assertEqual(len(response.data), 0)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_null=asdf::true'
            f'&type={self.entity_type.pk}', # needed for localizations
            format='json'
        )
        self.assertEqual(len(response.data), len(self.entities))
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_null=asdf::false'
            f'&type={self.entity_type.pk}', # needed for localizations
            format='json'
        )
        self.assertEqual(len(response.data), 0)

    def test_bool_attr(self):
        test_vals = [random.random() > 0.5 for _ in range(len(self.entities))]
        # Test setting an invalid bool
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Bool Test': 'asdfasdf'}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Bool Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            # Do this again to test after the attribute object has been created.
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Bool Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            self.assertEqual(response.data['attributes']['Bool Test'], test_val)
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute=Bool Test::true&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), sum(test_vals))
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), len(test_vals) - sum(test_vals))
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_lt=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_lte=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=Bool Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_int_attr(self):
        test_vals = [random.randint(-1000, 1000) for _ in range(len(self.entities))]
        # Test setting an invalid int
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Int Test': 'asdfasdf'}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Int Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            self.assertEqual(response.data['attributes']['Int Test'], test_val)
            # Test that attribute maximum is working.
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Int Test': 100000}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            # Test that attribute minimum is working.
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Int Test': -100000}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        TatorSearch().refresh(self.project.pk)
        for test_val in test_vals:
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute=Int Test::{test_val}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([t == test_val for t in test_vals]))
        for lbound, ubound in [(-1000, 1000), (-500, 500), (-500, 0), (0, 500)]:
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=Int Test::{lbound}&attribute_lt=Int Test::{ubound}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([(t > lbound) and (t < ubound) for t in test_vals]))
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=Int Test::{lbound}&attribute_lte=Int Test::{ubound}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([(t >= lbound) and (t <= ubound) for t in test_vals]))
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=Int Test::1&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=Int Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_float_attr(self):
        test_vals = [random.uniform(-1000.0, 1000.0) for _ in range(len(self.entities))]
        # Test setting an invalid float
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Float Test': 'asdfasdf'}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Float Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            self.assertEqual(response.data['attributes']['Float Test'], test_val)
            # Test that attribute maximum is working.
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Float Test': 100000}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            # Test that attribute minimum is working.
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Float Test': -100000}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        TatorSearch().refresh(self.project.pk)
        # Equality on float not recommended but is allowed.
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute=Float Test::{test_val}&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for lbound, ubound in [(-1000.0, 1000.0), (-500.0, 500.0), (-500.0, 0.0), (0.0, 500.0)]:
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=Float Test::{lbound}&attribute_lt=Float Test::{ubound}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([(t > lbound) and (t < ubound) for t in test_vals]))
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=Float Test::{lbound}&attribute_lte=Float Test::{ubound}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([(t >= lbound) and (t <= ubound) for t in test_vals]))
        # Contains on float not recommended but is allowed.
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=Float Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=Float Test::false&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_enum_attr(self):
        test_vals = [random.choice(['enum_val1', 'enum_val2', 'enum_val3']) for _ in range(len(self.entities))]
        # Test setting an invalid choice
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Enum Test': 'asdfasdf'}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'Enum Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            self.assertEqual(response.data['attributes']['Enum Test'], test_val)
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=Enum Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=Enum Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_lt=Enum Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_lte=Enum Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for _ in range(10):
            subs = ''.join(random.choices(string.ascii_lowercase, k=2))
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=Enum Test::{subs}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([subs.lower() in t.lower() for t in test_vals]))
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=Enum Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_string_attr(self):
        test_vals = [''.join(random.choices(string.ascii_uppercase + string.digits, k=random.randint(1, 64)))
            for _ in range(len(self.entities))]
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(f'/rest/{self.detail_uri}/{pk}',
                                         {'attributes': {'String Test': test_val}},
                                         format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            self.assertEqual(response.data['attributes']['String Test'], test_val)
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=String Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=String Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_lt=String Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_lte=String Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for _ in range(10):
            subs = ''.join(random.choices(string.ascii_lowercase, k=2))
            response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=String Test::{subs}&type={self.entity_type.pk}&format=json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([subs.lower() in t.lower() for t in test_vals]))
        response = self.client.get(f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=String Test::0&type={self.entity_type.pk}&format=json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_datetime_attr(self):
        def to_string(dt):
            return dt.isoformat().replace('+00:00', 'Z')
        end_dt = datetime.datetime.now(datetime.timezone.utc)
        start_dt = end_dt - datetime.timedelta(days=5 * 365)
        test_vals = [
            random_datetime(start_dt, end_dt)
            for _ in range(len(self.entities))
        ]
        # Test setting an invalid datetime
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Datetime Test': 'asdfasdf'}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            response = self.client.patch(
                f'/rest/{self.detail_uri}/{pk}',
                {'attributes': {'Datetime Test': to_string(test_val)}},
                format='json'
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            self.assertEqual(dateutil_parse(response.data['attributes']['Datetime Test']), test_val)
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute=Datetime Test::{to_string(test_val)}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        delta_dt = datetime.timedelta(days=365)
        for lbound, ubound in [
                (start_dt, end_dt),
                (start_dt + delta_dt, end_dt - delta_dt),
                (start_dt + delta_dt, end_dt - 2 * delta_dt),
                (start_dt + 2 * delta_dt, end_dt - delta_dt),
            ]:
            lbound_iso = to_string(lbound)
            ubound_iso = to_string(ubound)
            response = self.client.get(
                f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=Datetime Test::{lbound_iso}&'
                f'attribute_lt=Datetime Test::{ubound_iso}&type={self.entity_type.pk}&'
                f'format=json'
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(
                len(response.data),
                sum([(t > lbound) and (t < ubound) for t in test_vals])
            )
            response = self.client.get(
                f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=Datetime Test::{lbound_iso}&'
                f'attribute_lte=Datetime Test::{ubound_iso}&type={self.entity_type.pk}&'
                f'format=json'
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(
                len(response.data),
                sum([(t >= lbound) and (t <= ubound) for t in test_vals])
            )
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=Datetime Test::asdf&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=Datetime Test::asdf&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_geoposition_attr(self):
        test_vals = [random_latlon() for _ in range(len(self.entities))]
        # Test setting invalid geopositions
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Geoposition Test': [0.0, -91.0]}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            {'attributes': {'Geoposition Test': [-181.0, 0.0]}},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for idx, test_val in enumerate(test_vals):
            pk = self.entities[idx].pk
            lat, lon = test_val
            response = self.client.patch(
                f'/rest/{self.detail_uri}/{pk}',
                {'attributes': {'Geoposition Test': [lon, lat]}},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            response = self.client.get(f'/rest/{self.detail_uri}/{pk}?format=json')
            self.assertEqual(response.data['id'], pk)
            attrs = response.data['attributes']['Geoposition Test']
            self.assertEqual(response.data['attributes']['Geoposition Test'], [lon, lat])
        TatorSearch().refresh(self.project.pk)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute=Geoposition Test::10::{lat}::{lon}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_lt=Geoposition Test::10::{lat}::{lon}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_lte=Geoposition Test::10::{lat}::{lon}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_gt=Geoposition Test::10::{lat}::{lon}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_gte=Geoposition Test::10::{lat}::{lon}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(
            f'/rest/{self.list_uri}/{self.project.pk}?attribute_contains=Geoposition Test::10::{lat}::{lon}&'
            f'type={self.entity_type.pk}&format=json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        test_lat, test_lon = random_latlon()
        for dist in [1.0, 100.0, 1000.0, 5000.0, 10000.0, 43000.0]:
            response = self.client.get(
                f'/rest/{self.list_uri}/{self.project.pk}?attribute_distance=Geoposition Test::'
                f'{dist}::{test_lat}::{test_lon}&'
                f'type={self.entity_type.pk}&format=json'
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(len(response.data), sum([
                latlon_distance(test_lat, test_lon, lat, lon) < dist
                for lat, lon in test_vals
            ]))

class FileMixin:
    def _test_methods(self, role):
        list_endpoint = f'/rest/{self.list_uri}/{self.media.pk}'
        detail_endpoint = f'/rest/{self.detail_uri}/{self.media.pk}'

        # Create media definition.
        response = self.client.post(f'{list_endpoint}?role={role}',
                                    self.create_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Patch the media definition.
        response = self.client.patch(f'{detail_endpoint}?role={role}&index=0',
                                     self.patch_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Get media definition list.
        response = self.client.get(f'{list_endpoint}?role={role}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in self.patch_json:
            self.assertEqual(response.data[0][key], self.patch_json[key])

        # Get media definition detail.
        response = self.client.get(f'{detail_endpoint}?role={role}&index=0')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in self.patch_json:
            self.assertEqual(response.data[key], self.patch_json[key])

        # Delete media definition.
        response = self.client.delete(f'{detail_endpoint}?role={role}&index=0')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check we have nothing.
        response = self.client.get(f'{list_endpoint}?role={role}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)


class CurrentUserTestCase(APITestCase):
    def test_get(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        response = self.client.get('/rest/User/GetCurrent')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.user.id)

class ProjectDeleteTestCase(APITestCase):
    def setUp(self):
        self.user = create_test_user()
        self.project = create_test_project(self.user)
        self.video_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.box_type = LocalizationType.objects.create(
            name="boxes",
            dtype='box',
            project=self.project,
        )
        self.state_type = StateType.objects.create(
            name="state_type",
            dtype='state',
            project=self.project,
            association='Media',
        )
        self.videos = [
            create_test_video(self.user, f'asdf{idx}', self.video_type, self.project)
            for idx in range(random.randint(6, 10))
        ]
        self.boxes = [
            create_test_box(self.user, self.box_type, self.project, random.choice(self.videos), 0)
            for idx in range(random.randint(6, 10))
        ]
        self.states = [
            State.objects.create(
                meta=self.state_type,
                project=self.project,
            )
            for _ in range(random.randint(6, 10))
        ]
        for state in self.states:
            for media in random.choices(self.videos):
                state.media.add(media)

    def test_delete(self):
        self.client.delete(f'/rest/Project/{self.project.pk}')

class AlgorithmLaunchTestCase(
        APITestCase,
        PermissionCreateTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.algorithm = create_test_algorithm(self.user, 'algtest', self.project)
        self.list_uri = 'AlgorithmLaunch'
        self.create_json = {
            'algorithm_name': self.algorithm.name,
            'media_ids': [1,2,3],
        }
        self.edit_permission = Permission.CAN_EXECUTE

    def tearDown(self):
        self.project.delete()

class AlgorithmTestCase(
        APITestCase,
        PermissionListMembershipTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.algorithm = create_test_algorithm(self.user, 'algtest', self.project)
        self.list_uri = 'Algorithms'
        self.entities = [
            create_test_algorithm(self.user, f'result{idx}', self.project)
            for idx in range(random.randint(6, 10))
        ]

    def tearDown(self):
        self.project.delete()

class VideoTestCase(
        APITestCase,
        AttributeTestMixin,
        AttributeMediaTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entities = [
            create_test_video(self.user, f'asdf{idx}', self.entity_type, self.project)
            for idx in range(random.randint(6, 10))
        ]
        self.media_entities = self.entities
        self.list_uri = 'Medias'
        self.detail_uri = 'Media'
        self.create_entity = functools.partial(
            create_test_video, self.user, 'asdfa', self.entity_type, self.project)
        self.edit_permission = Permission.CAN_EDIT
        self.patch_json = {'name': 'video1', 'last_edit_start': '2017-07-21T17:32:28Z'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

    def test_annotation_delete(self):
        medias = [
            create_test_video(self.user, f'asdf{idx}', self.entity_type, self.project)
            for idx in range(random.randint(6, 10))
        ]
        state_type = StateType.objects.create(project=self.project,
                                              name='track_type',
                                              association='Localization',
                                              attribute_types=[])
        state_type.media.add(self.entity_type)
        loc_type = LocalizationType.objects.create(project=self.project,
                                                   name='loc_type',
                                                   dtype='box',
                                                   attribute_types=[])
        loc_type.media.add(self.entity_type)
        locs = [create_test_box(self.user, loc_type, self.project, medias[0], 0)
                for _ in range(random.randint(2, 5))]
        for _ in range(random.randint(2, 5)):
            state = State.objects.create(project=self.project,
                                         meta=state_type,
                                         frame=0)
            state.media.add(medias[0])
            for loc in locs:
                state.localizations.add(loc)
        # Test detail delete
        response = self.client.get(f'/rest/LocalizationCount/{self.project.pk}?media_id={medias[0].id}')
        self.assertNotEqual(response.data, 0)
        response = self.client.get(f'/rest/StateCount/{self.project.pk}?media_id={medias[0].id}')
        self.assertNotEqual(response.data, 0)
        response = self.client.delete(f'/rest/Media/{medias[0].id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.get(f'/rest/LocalizationCount/{self.project.pk}?media_id={medias[0].id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, 0)
        response = self.client.get(f'/rest/StateCount/{self.project.pk}?media_id={medias[0].id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, 0)
        locs = [create_test_box(self.user, loc_type, self.project, medias[1], 0)
                for _ in range(random.randint(2, 5))]
        for _ in range(random.randint(2, 5)):
            state = State.objects.create(project=self.project,
                                         meta=state_type,
                                         frame=0)
            state.media.add(medias[1])
            for loc in locs:
                state.localizations.add(loc)
        # Test list delete
        response = self.client.get(f'/rest/LocalizationCount/{self.project.pk}?media_id={medias[1].id}')
        self.assertNotEqual(response.data, 0)
        response = self.client.get(f'/rest/StateCount/{self.project.pk}?media_id={medias[1].id}')
        self.assertNotEqual(response.data, 0)
        response = self.client.delete(f'/rest/Medias/{self.project.pk}?media_id={medias[1].id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.get(f'/rest/LocalizationCount/{self.project.pk}?media_id={medias[1].id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, 0)
        response = self.client.get(f'/rest/StateCount/{self.project.pk}?media_id={medias[1].id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, 0)

class ImageTestCase(
        APITestCase,
        AttributeTestMixin,
        AttributeMediaTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="images",
            dtype='image',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entities = [
            create_test_image(self.user, f'asdf{idx}', self.entity_type, self.project)
            for idx in range(random.randint(6, 10))
        ]
        self.media_entities = self.entities
        self.list_uri = 'Medias'
        self.detail_uri = 'Media'
        self.create_entity = functools.partial(
            create_test_image, self.user, 'asdfa', self.entity_type, self.project)
        self.edit_permission = Permission.CAN_EDIT
        self.patch_json = {'name': 'image1'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

class LocalizationBoxTestCase(
        APITestCase,
        AttributeTestMixin,
        AttributeMediaTestMixin,
        DefaultCreateTestMixin,
        PermissionCreateTestMixin,
        PermissionListTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        media_entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.entity_type = LocalizationType.objects.create(
            name="boxes",
            dtype='box',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entity_type.media.add(media_entity_type)
        self.media_entities = [
            create_test_video(self.user, f'asdf{idx}', media_entity_type, self.project)
            for idx in range(random.randint(3, 10))
        ]
        self.entities = [
            create_test_box(self.user, self.entity_type, self.project, random.choice(self.media_entities), 0)
            for idx in range(random.randint(6, 10))
        ]
        self.list_uri = 'Localizations'
        self.detail_uri = 'Localization'
        self.create_entity = functools.partial(
            create_test_box, self.user, self.entity_type, self.project, self.media_entities[0], 0)
        self.create_json = [{
            'type': self.entity_type.pk,
            'name': 'asdf',
            'media_id': self.media_entities[0].pk,
            'frame': 0,
            'x': 0,
            'y': 0,
            'width': 0.5,
            'height': 0.5,
            'Bool Test': True,
            'Int Test': 1,
            'Float Test': 0.0,
            'Enum Test': 'enum_val1',
            'String Test': 'asdf',
            'Datetime Test': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'Geoposition Test': [179.0, -89.0],
        }]
        self.edit_permission = Permission.CAN_EDIT
        self.patch_json = {'name': 'box1'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

class LocalizationLineTestCase(
        APITestCase,
        AttributeTestMixin,
        AttributeMediaTestMixin,
        DefaultCreateTestMixin,
        PermissionCreateTestMixin,
        PermissionListTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        media_entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.entity_type = LocalizationType.objects.create(
            name="lines",
            dtype='line',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entity_type.media.add(media_entity_type)
        self.media_entities = [
            create_test_video(self.user, f'asdf{idx}', media_entity_type, self.project)
            for idx in range(random.randint(3, 10))
        ]
        self.entities = [
            create_test_line(self.user, self.entity_type, self.project, random.choice(self.media_entities), 0)
            for idx in range(random.randint(6, 10))
        ]
        self.list_uri = 'Localizations'
        self.detail_uri = 'Localization'
        self.create_entity = functools.partial(
            create_test_line, self.user, self.entity_type, self.project, self.media_entities[0], 0)
        self.create_json = [{
            'type': self.entity_type.pk,
            'name': 'asdf',
            'media_id': self.media_entities[0].pk,
            'frame': 0,
            'x0': 0,
            'y0': 0,
            'x1': 0.5,
            'y1': 0.5,
            'Bool Test': True,
            'Int Test': 1,
            'Float Test': 0.0,
            'Enum Test': 'enum_val1',
            'String Test': 'asdf',
            'Datetime Test': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'Geoposition Test': [0.0, 0.0],
        }]
        self.edit_permission = Permission.CAN_EDIT
        self.patch_json = {'name': 'line1'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

class LocalizationDotTestCase(
        APITestCase,
        AttributeTestMixin,
        AttributeMediaTestMixin,
        DefaultCreateTestMixin,
        PermissionCreateTestMixin,
        PermissionListTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        media_entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.entity_type = LocalizationType.objects.create(
            name="dots",
            dtype='dot',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entity_type.media.add(media_entity_type)
        self.media_entities = [
            create_test_video(self.user, f'asdf{idx}', media_entity_type, self.project)
            for idx in range(random.randint(3, 10))
        ]
        self.entities = [
            create_test_dot(self.user, self.entity_type, self.project, random.choice(self.media_entities), 0)
            for idx in range(random.randint(6, 10))
        ]
        self.list_uri = 'Localizations'
        self.detail_uri = 'Localization'
        self.create_entity = functools.partial(
            create_test_dot, self.user, self.entity_type, self.project, self.media_entities[0], 0)
        self.create_json = [{
            'type': self.entity_type.pk,
            'name': 'asdf',
            'media_id': self.media_entities[0].pk,
            'frame': 0,
            'x': 0,
            'y': 0,
            'Bool Test': True,
            'Int Test': 1,
            'Float Test': 0.0,
            'Enum Test': 'enum_val1',
            'String Test': 'asdf',
            'Datetime Test': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'Geoposition Test': [0.0, 0.0],
        }]
        self.edit_permission = Permission.CAN_EDIT
        self.patch_json = {'name': 'dot1'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

class StateTestCase(
        APITestCase,
        AttributeTestMixin,
        AttributeMediaTestMixin,
        DefaultCreateTestMixin,
        PermissionCreateTestMixin,
        PermissionListTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.version = self.project.version_set.all()[0]
        self.membership = create_test_membership(self.user, self.project)
        media_entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.entity_type = StateType.objects.create(
            name="states",
            dtype='state',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entity_type.media.add(media_entity_type)
        self.media_entities = [
            create_test_video(self.user, f'asdf', media_entity_type, self.project)
            for idx in range(random.randint(3, 10))
        ]
        self.entities = []
        for _ in range(random.randint(6, 10)):
            state = State.objects.create(
                meta=self.entity_type,
                project=self.project,
                version=self.version,
            )
            for media in random.choices(self.media_entities):
                state.media.add(media)
            self.entities.append(state)
        self.list_uri = 'States'
        self.detail_uri = 'State'
        self.create_entity = functools.partial(State.objects.create,
            meta=self.entity_type,
            project=self.project,
            version=self.version
        )
        self.create_json = [{
            'type': self.entity_type.pk,
            'name': 'asdf',
            'media_ids': [m.id for m in random.choices(self.media_entities)],
            'Bool Test': True,
            'Int Test': 1,
            'Float Test': 0.0,
            'Enum Test': 'enum_val1',
            'String Test': 'asdf',
            'Datetime Test': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'Geoposition Test': [0.0, 0.0],
        }]
        self.edit_permission = Permission.CAN_EDIT
        self.patch_json = {'name': 'state1'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

class LeafTestCase(
        APITestCase,
        AttributeTestMixin,
        DefaultCreateTestMixin,
        PermissionCreateTestMixin,
        PermissionListTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = LeafType.objects.create(
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entities = [
            create_test_leaf(f'leaf{idx}', self.entity_type, self.project)
            for idx in range(random.randint(6, 10))
        ]
        self.list_uri = 'Leaves'
        self.detail_uri = 'Leaf'
        self.create_entity = functools.partial(
            create_test_leaf, 'leafasdf', self.entity_type, self.project)
        self.create_json = [{
            'type': self.entity_type.pk,
            'name': 'asdf',
            'path': 'asdf',
            'Bool Test': True,
            'Int Test': 1,
            'Float Test': 0.0,
            'Enum Test': 'enum_val1',
            'String Test': 'asdf',
            'Datetime Test': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'Geoposition Test': [0.0, 0.0],
        }]
        self.edit_permission = Permission.FULL_CONTROL
        self.patch_json = {'name': 'leaf1'}
        TatorSearch().refresh(self.project.pk)

    def tearDown(self):
        self.project.delete()

class LeafTypeTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entities = [
            LeafType.objects.create(project=self.project)
            for _ in range(random.randint(6, 10))
        ]
        self.list_uri = 'LeafTypes'
        self.detail_uri = 'LeafType'
        self.create_json = {
            'name': 'leaf type',
        }
        self.patch_json = {'name': 'leaf asdf'}
        self.edit_permission = Permission.FULL_CONTROL

    def tearDown(self):
        self.project.delete()

class StateTypeTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.media_type = MediaType.objects.create(
            name="video",
            project=self.project,
        )
        self.entities = [
            StateType.objects.create(
                name="state1",
                project=self.project,
                association='Localization',
                attribute_types=create_test_attribute_types(),
            ),
            StateType.objects.create(
                name="state2",
                project=self.project,
                association='Media',
                attribute_types=create_test_attribute_types(),
            ),
        ]
        self.list_uri = 'StateTypes'
        self.detail_uri = 'StateType'
        self.create_json = {
            'name': 'frame state type',
            'association': 'Frame',
            'media_types': [self.media_type.pk],
            'attribute_types': create_test_attribute_types(),
        }
        self.patch_json = {'name': 'state asdf'}
        self.edit_permission = Permission.FULL_CONTROL

    def tearDown(self):
        self.project.delete()

class MediaTypeTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.detail_uri = 'MediaType'
        self.list_uri = 'MediaTypes'
        self.entities = [
            MediaType.objects.create(
                name="videos",
                project=self.project,
                attribute_types=create_test_attribute_types(),
            ),
            MediaType.objects.create(
                name="images",
                project=self.project,
                attribute_types=create_test_attribute_types(),
            ),
        ]
        self.edit_permission = Permission.FULL_CONTROL
        self.patch_json = {
            'name': 'asdf',
        }
        self.create_json = {
            'name': 'videos',
            'dtype': 'video',
            'attribute_types': create_test_attribute_types(),
        }

    def tearDown(self):
        self.project.delete()

class LocalizationTypeTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.media_type = MediaType.objects.create(
            name="video",
            project=self.project,
        )
        self.entities = [
            LocalizationType.objects.create(
                name="box",
                dtype='box',
                project=self.project,
                attribute_types=create_test_attribute_types(),
            ),
            LocalizationType.objects.create(
                name="line",
                dtype='line',
                project=self.project,
                attribute_types=create_test_attribute_types(),
            ),
            LocalizationType.objects.create(
                name="dot asdf",
                dtype='dot',
                project=self.project,
                attribute_types=create_test_attribute_types(),
            ),
        ]
        self.list_uri = 'LocalizationTypes'
        self.detail_uri = 'LocalizationType'
        self.create_json = {
            'name': 'box type',
            'dtype': 'box',
            'media_types': [self.media_type.pk],
            'attribute_types': create_test_attribute_types(),
        }
        self.patch_json = {'name': 'box asdf'}
        self.edit_permission = Permission.FULL_CONTROL

    def tearDown(self):
        self.project.delete()

class MembershipTestCase(
        APITestCase,
        PermissionListMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entities = [self.membership,]
        self.list_uri = 'Memberships'
        self.detail_uri = 'Membership'
        self.patch_json = {
            'permission': 'Full Control',
        }
        self.create_json = {
            'user': self.user.pk,
            'permission': 'Full Control',
        }
        self.edit_permission = Permission.FULL_CONTROL

    def tearDown(self):
        self.project.delete()

class ProjectTestCase(APITestCase):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.entities = [
            create_test_project(self.user)
            for _ in range(random.randint(6, 10))
        ]
        memberships = [
            create_test_membership(self.user, entity)
            for entity in self.entities
        ]
        self.detail_uri = 'Project'
        self.list_uri = 'Projects'
        self.patch_json = {
            'name': 'aaasdfasd',
        }
        self.create_json = {
            'name': 'asdfasd',
            'summary': 'asdfa summary',
            'organization': self.organization.pk,
        }
        self.edit_permission = Permission.FULL_CONTROL

    def test_create_no_affiliation(self):
        endpoint = f'/rest/{self.list_uri}'
        self.affiliation.delete()
        response = self.client.post(endpoint, self.create_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.affiliation.save()

    def test_create_permissions(self):
        endpoint = f'/rest/{self.list_uri}'
        permission_index = affiliation_levels.index('Admin')
        for index, level in enumerate(affiliation_levels):
            self.affiliation.permission = level
            self.affiliation.save()
            expected_status = status.HTTP_201_CREATED if index >= permission_index \
                              else status.HTTP_403_FORBIDDEN
            response = self.client.post(endpoint, self.create_json, format='json')
            self.assertEqual(response.status_code, expected_status)

    def test_detail_patch_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            obj = Membership.objects.filter(project=self.entities[0], user=self.user)[0]
            obj.permission = level
            obj.save()
            del obj
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            response = self.client.patch(
                f'/rest/{self.detail_uri}/{self.entities[0].pk}',
                self.patch_json,
                format='json')
            self.assertEqual(response.status_code, expected_status)

    def test_detail_delete_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            obj = Membership.objects.filter(project=self.entities[0], user=self.user)[0]
            obj.permission = level
            obj.save()
            del obj
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            test_val = random.random() > 0.5
            response = self.client.delete(
                f'/rest/{self.detail_uri}/{self.entities[0].pk}',
                format='json')
            self.assertEqual(response.status_code, expected_status)
            if expected_status == status.HTTP_200_OK:
                del self.entities[0]

    def test_delete_non_creator(self):
        other_user = User.objects.create(
            username="other",
            password="user",
            first_name="other",
            last_name="user",
            email="other.user@gmail.com",
            middle_initial="A",
            initials="OAU",
        )
        create_test_membership(other_user, self.entities[0])
        self.client.force_authenticate(other_user)
        response = self.client.delete(
            f'/rest/{self.detail_uri}/{self.entities[0].pk}',
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def tearDown(self):
        for project in self.entities:
            project.delete()

class TranscodeTestCase(
        APITestCase,
        PermissionCreateTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.list_uri = 'Transcode'
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.create_json = {
            'type': self.entity_type.pk,
            'gid': str(uuid1()),
            'uid': str(uuid1()),
            'url': 'http://asdf.com',
            'name': 'asdf.mp4',
            'section': 'asdf section',
            'md5': '',
            'size': 1,
        }
        self.edit_permission = Permission.CAN_TRANSFER

    def tearDown(self):
        self.project.delete()

class AnalysisCountTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.entities = [
            create_test_video(self.user, f'asdf{idx}', self.entity_type, self.project)
            for idx in range(random.randint(3, 10))
        ]
        self.analysis = Analysis.objects.create(
            project=self.project,
            name="count_test",
            data_query='Enum Test:enum_val1',
        )
        self.list_uri = 'Analyses'
        self.detail_uri = 'Analysis'
        self.create_json = {
            'name': 'count_create_test',
            'data_query': 'Enum Test:enum_val2',
        }
        self.edit_permission = Permission.FULL_CONTROL

    def tearDown(self):
        self.project.delete()

class VersionTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.media = create_test_video(self.user, f'asdf', self.entity_type, self.project)
        self.entities = [
            create_test_version(f'asdf{idx}', f'desc{idx}', idx, self.project, self.media)
            for idx in range(random.randint(6, 10))
        ]
        self.list_uri = 'Versions'
        self.detail_uri = 'Version'
        self.create_json = {
            'project': self.project.pk,
            'name': 'version_create_test',
            'media_id': self.media.pk,
            'description': 'asdf',
        }
        self.patch_json = {
            'description': 'asdf123',
        }
        self.edit_permission = Permission.CAN_EDIT

    def tearDown(self):
        self.project.delete()

class SectionTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.media = create_test_video(self.user, 'asdf', self.entity_type, self.project)
        self.entities = [create_test_section(f"Section {idx}", self.project)
                         for idx in range(random.randint(6, 10))]
        self.list_uri = 'Sections'
        self.detail_uri = 'Section'
        self.create_json = {
            'project': self.project.pk,
            'name': 'No Filters',
        }
        self.patch_json = {
            'name': 'New name',
        }
        self.edit_permission = Permission.CAN_EDIT

        # Setup for search tests.
        self.medias = [
            create_test_video(self.user, name, self.entity_type, self.project)
            for name in ['Apple', 'Banana', 'Orange']
        ]
        self.box_type = LocalizationType.objects.create(
            name='boxes',
            dtype='box',
            project=self.project,
        )
        self.box = create_test_box(self.user, self.box_type, self.project, self.medias[2], 0)
        self.sections = [Section.objects.create(
            project=self.project,
            name='Apples',
            lucene_search='_exact_name:Apple',
        ), Section.objects.create(
            project=self.project,
            name='Bananas',
            media_bools=[{'match': {'_exact_name': 'Banana'}}],
        ), Section.objects.create(
            project=self.project,
            name='Oranges',
            annotation_bools=[{'match': {'_frame': 0}}],
        )]
        time.sleep(1)

    def test_lucene_search(self):
        url = f'/rest/Medias/{self.project.pk}?section={self.sections[0].pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.medias[0].pk)

    def test_media_bools(self):
        url = f'/rest/Medias/{self.project.pk}?section={self.sections[1].pk}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.medias[1].pk)

    def test_annotation_bools(self):
        url = f'/rest/Medias/{self.project.pk}?section={self.sections[2].pk}'
        response = self.client.get(url)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.medias[2].pk)

class FavoriteTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.box_type = LocalizationType.objects.create(
            name="boxes",
            dtype='box',
            project=self.project,
        )
        self.entities = [create_test_favorite(f"Favorite {idx}", self.project,
                                              self.user, self.box_type)
                         for idx in range(random.randint(6, 10))]
        self.list_uri = 'Favorites'
        self.detail_uri = 'Favorite'
        self.create_json = {
            'name': 'My fave',
            'page': 1,
            'type': self.box_type.pk,
            'values': {'blah': 'asdf'},
        }
        self.patch_json = {
            'name': 'New name',
        }
        self.edit_permission = Permission.CAN_EDIT

    def tearDown(self):
        self.project.delete()

class BookmarkTestCase(
        APITestCase,
        PermissionCreateTestMixin,
        PermissionListMembershipTestMixin,
        PermissionDetailMembershipTestMixin,
        PermissionDetailTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.entities = [create_test_bookmark(f"Bookmark {idx}", self.project,
                                               self.user)
                         for idx in range(random.randint(6, 10))]
        self.list_uri = 'Bookmarks'
        self.detail_uri = 'Bookmark'
        self.create_json = {
            'name': 'My bookmark',
            'uri': '/projects',
        }
        self.patch_json = {
            'name': 'New name',
        }
        self.edit_permission = Permission.CAN_EDIT

    def tearDown(self):
        self.project.delete()

class AffiliationTestCase(
        APITestCase,
        PermissionListAffiliationTestMixin,
        PermissionDetailAffiliationTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entities = [create_test_affiliation(create_test_user(), self.organization) for _ in range(3)]
        self.list_uri = 'Affiliations'
        self.detail_uri = 'Affiliation'
        self.patch_json = {
            'permission': 'Member',
        }
        self.create_json = {
            'user': self.user.pk,
            'permission': 'Admin',
        }
        self.edit_permission = 'Admin'
        self.get_requires_admin = False

    def get_affiliation(self, organization, user):
        return Affiliation.objects.filter(organization=organization, user=user)[0]

    def get_organization(self):
        return self.organization

    def tearDown(self):
        self.project.delete()

class OrganizationTestCase(
        APITestCase,
        PermissionDetailAffiliationTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user, self.organization)
        self.membership = create_test_membership(self.user, self.project)
        self.entities = [create_test_organization() for _ in range(3)]
        affiliations = [create_test_affiliation(self.user, entity) for entity in self.entities]
        self.list_uri = 'Organizations'
        self.detail_uri = 'Organization'
        self.create_json = {
            'name': 'My org'
        }
        self.patch_json = {
            'name': 'My new org'
        }
        self.edit_permission = 'Admin'
        self.get_requires_admin = False

    def get_affiliation(self, organization, user):
        return Affiliation.objects.filter(organization=organization, user=user)[0]

    def get_organization(self):
        return self.entities[0]

    def test_create(self):
        endpoint = f'/rest/{self.list_uri}'
        response = self.client.post(endpoint, self.create_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def tearDown(self):
        self.project.delete()

class BucketTestCase(
        APITestCase,
        PermissionListAffiliationTestMixin,
        PermissionDetailAffiliationTestMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.entities = [create_test_bucket(self.organization) for _ in range(3)]
        self.list_uri = 'Buckets'
        self.detail_uri = 'Bucket'
        self.create_json = {
            'name': 'my-bucket',
            'access_key': 'asdf',
            'secret_key': 'asdf',
            'endpoint_url': 'https://asdf.com:8000',
            'region': 'us-east-1',
        }
        self.patch_json = {
            'name': 'my-bucket1',
            'access_key': 'asdf1',
            'secret_key': 'asdf2',
            'endpoint_url': 'https://asdf.com:8001',
            'region': 'us-east-2',
        }
        self.edit_permission = 'Admin'
        self.get_requires_admin = True

    def get_affiliation(self, organization, user):
        return Affiliation.objects.filter(organization=organization, user=user)[0]

    def get_organization(self):
        return self.organization

    def test_create_no_affiliation(self):
        endpoint = f'/rest/{self.list_uri}/{self.organization.pk}'
        self.affiliation.delete()
        response = self.client.post(endpoint, self.create_json, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.affiliation.save()

class ImageFileTestCase(APITestCase, FileMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user, self.organization)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.media = create_test_video(self.user, f'asdf', self.entity_type, self.project)
        self.list_uri = 'ImageFiles'
        self.detail_uri = 'ImageFile'
        self.create_json = {'path': 'asdf', 'resolution': [1, 1]}
        self.patch_json = {'path': 'asdf', 'resolution': [2, 2]}

    def test_image(self):
        self._test_methods('image')

    def test_thumbnail(self):
        self._test_methods('thumbnail')

    def test_thumbnail_gif(self):
        self._test_methods('thumbnail_gif')

class VideoFileTestCase(APITestCase, FileMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user, self.organization)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.media = create_test_video(self.user, f'asdf', self.entity_type, self.project)
        self.list_uri = 'VideoFiles'
        self.detail_uri = 'VideoFile'
        self.create_json = {'path': 'asdf', 'resolution': [1, 1], 'codec': 'h264', 'segment_info': 'asdf'}
        self.patch_json = {'path': 'asdf', 'resolution': [2, 2], 'codec': 'h264', 'segment_info': 'asdf'}

    def test_streaming(self):
        self._test_methods('streaming')

    def test_archival(self):
        self._test_methods('archival')

class AudioFileTestCase(APITestCase, FileMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user, self.organization)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.media = create_test_video(self.user, f'asdf', self.entity_type, self.project)
        self.list_uri = 'AudioFiles'
        self.detail_uri = 'AudioFile'
        self.create_json = {'path': 'asdf', 'codec': 'h264'}
        self.patch_json = {'path': 'asdf', 'codec': 'h264'}

    def test_audio(self):
        self._test_methods('audio')

class FileTestCase(APITestCase, FileMixin):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user, self.organization)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.media = create_test_video(self.user, f'asdf', self.entity_type, self.project)
        self.list_uri = 'Files'
        self.detail_uri = 'File'
        self.create_json = {'path': 'asdf', 'name': 'asdf1'}
        self.patch_json = {'path': 'asdf', 'name': 'asdf'}

    def test_attachment(self):
        self._test_methods('attachment')

class ResourceTestCase(APITestCase):

    MEDIA_ROLES = {'streaming': 'VideoFiles',
                   'archival': 'VideoFiles',
                   'audio': 'AudioFiles',
                   'image': 'ImageFiles',
                   'thumbnail': 'ImageFiles',
                   'thumbnail_gif': 'ImageFiles',
                   'attachment': 'Files'}

    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.project = create_test_project(self.user, self.organization)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        self.store = get_tator_store()

    def _random_store_obj(self):
        """ Creates an store file with random key. Simulates an upload.
        """
        key = f"test/{str(uuid1())}"
        self.store.put_string(key, b"\x00" + os.urandom(16) + b"\x00")
        return key

    def _store_obj_exists(self, key):
        """ Checks whether an object in store exists.
        """
        try:
            self.store.head_object(key)
        except ClientError:
            return False
        else:
            return True

    def _generate_keys(self):
        keys = {role:self._random_store_obj() for role in ResourceTestCase.MEDIA_ROLES}
        segment_key = self._random_store_obj()
        return keys, segment_key

    def _get_media_def(self, role, keys, segment_key):
        media_def = {'path': keys[role]}
        if role == 'streaming':
            media_def['resolution'] = [1, 1]
            media_def['segment_info'] = segment_key
            media_def['codec'] = 'h264'
        elif role == 'archival':
            media_def['resolution'] = [1, 1]
            media_def['codec'] = 'h264'
        elif role == 'audio':
            media_def['codec'] = 'aac'
        else:
            media_def['resolution'] = [1, 1]
        return media_def

    def _prune_media(self):
        """ Emulates a prunemedia operation that clears out media with null project
            IDs.
        """
        media = Media.objects.filter(deleted=True)
        for m in media:
            m.delete()

    def test_files(self):
        media = create_test_video(self.user, f'asdf', self.entity_type, self.project)

        # Post one file of each role.
        keys, segment_key = self._generate_keys()
        for role in ResourceTestCase.MEDIA_ROLES:
            endpoint = ResourceTestCase.MEDIA_ROLES[role]
            media_def = self._get_media_def(role, keys, segment_key)
            response = self.client.post(f"/rest/{endpoint}/{media.id}?role={role}", media_def, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Patch in a new value for each role.
        patch_keys, patch_segment_key = self._generate_keys()
        for role in ResourceTestCase.MEDIA_ROLES:
            endpoint = ResourceTestCase.MEDIA_ROLES[role][:-1]
            media_def = self._get_media_def(role, patch_keys, patch_segment_key)
            response = self.client.patch(f"/rest/{endpoint}/{media.id}?index=0&role={role}", media_def, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertFalse(self._store_obj_exists(keys[role]))
            self.assertTrue(self._store_obj_exists(patch_keys[role]))
        self.assertFalse(self._store_obj_exists(segment_key))
        self.assertTrue(self._store_obj_exists(patch_segment_key))

        # Delete the files.
        for role in ResourceTestCase.MEDIA_ROLES:
            endpoint = ResourceTestCase.MEDIA_ROLES[role][:-1]
            response = self.client.delete(f"/rest/{endpoint}/{media.id}?index=0&role={role}", format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertFalse(self._store_obj_exists(patch_keys[role]))
        self.assertFalse(self._store_obj_exists(patch_segment_key))

    def test_clones(self):
        media = create_test_video(self.user, f'asdf', self.entity_type, self.project)
        TatorSearch().refresh(self.project.pk)

        # Post one file of each role.
        keys, segment_key = self._generate_keys()
        for role in ResourceTestCase.MEDIA_ROLES:
            endpoint = ResourceTestCase.MEDIA_ROLES[role]
            media_def = self._get_media_def(role, keys, segment_key)
            response = self.client.post(f"/rest/{endpoint}/{media.id}?role={role}", media_def, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Clone the media.
        body = {'dest_project': self.project.pk,
                'dest_type': self.entity_type.pk,
                'dest_section': 'asdf'}
        response = self.client.post(f"/rest/CloneMedia/{self.project.pk}?media_id={media.id}",
                                    body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        clone_id = response.data['id'][0]
        TatorSearch().refresh(self.project.pk)

        # Delete the clone.
        response = self.client.delete(f"/rest/Media/{clone_id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        for role in ResourceTestCase.MEDIA_ROLES:
            self.assertTrue(self._store_obj_exists(keys[role]))

        # Clone the media.
        body = {'dest_project': self.project.pk,
                'dest_type': self.entity_type.pk,
                'dest_section': 'asdf1'}
        response = self.client.post(f"/rest/CloneMedia/{self.project.pk}?media_id={media.id}",
                                    body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        clone_id = response.data['id'][0]
        TatorSearch().refresh(self.project.pk)

        # Delete the original.
        response = self.client.delete(f"/rest/Media/{media.id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        for role in ResourceTestCase.MEDIA_ROLES:
            self.assertTrue(self._store_obj_exists(keys[role]))

        TatorSearch().refresh(self.project.pk)

        # Clone the clone.
        body = {'dest_project': self.project.pk,
                'dest_type': self.entity_type.pk,
                'dest_section': 'asdf2'}
        response = self.client.post(f"/rest/CloneMedia/{self.project.pk}?media_id={clone_id}",
                                    body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_clone_id = response.data['id'][0]
        TatorSearch().refresh(self.project.pk)

        # Delete the first clone.
        response = self.client.delete(f"/rest/Media/{clone_id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        for role in ResourceTestCase.MEDIA_ROLES:
            self.assertTrue(self._store_obj_exists(keys[role]))

        # Delete the second clone.
        response = self.client.delete(f"/rest/Media/{new_clone_id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        for role in ResourceTestCase.MEDIA_ROLES:
            self.assertFalse(self._store_obj_exists(keys[role]))

    def test_thumbnails(self):
        # Create an image in which thumbnail is autocreated.
        image_type = MediaType.objects.create(
            name="images",
            dtype='image',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        body = {'url': TEST_IMAGE,
                'type': image_type.pk,
                'section': 'asdf',
                'name': 'asdf',
                'md5': 'asdf'}
        response = self.client.post(f"/rest/Medias/{self.project.pk}", body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        image_id = response.data['id']

        # Make sure we have an image and thumbnail key.
        image = Media.objects.get(pk=image_id)
        image_key = image.media_files['image'][0]['path']
        thumb_key = image.media_files['thumbnail'][0]['path']
        self.assertTrue(self._store_obj_exists(image_key))
        self.assertTrue(self._store_obj_exists(thumb_key))
        self.assertEqual(Resource.objects.get(path=image_key).media.all()[0].pk, image_id)
        self.assertEqual(Resource.objects.get(path=thumb_key).media.all()[0].pk, image_id)

        # Delete the media and verify the files are gone.
        response = self.client.delete(f"/rest/Media/{image_id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        self.assertFalse(self._store_obj_exists(image_key))
        self.assertFalse(self._store_obj_exists(thumb_key))

        # Create an image with thumbnail_url included.
        body = {'url': TEST_IMAGE,
                'thumbnail_url': TEST_IMAGE,
                'type': image_type.pk,
                'section': 'asdf',
                'name': 'asdf',
                'md5': 'asdf'}
        response = self.client.post(f"/rest/Medias/{self.project.pk}", body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        image_id = response.data['id']

        # Make sure we have an image and thumbnail key.
        image = Media.objects.get(pk=image_id)
        image_key = image.media_files['image'][0]['path']
        thumb_key = image.media_files['thumbnail'][0]['path']
        self.assertTrue(self._store_obj_exists(image_key))
        self.assertTrue(self._store_obj_exists(thumb_key))
        self.assertEqual(Resource.objects.get(path=image_key).media.all()[0].pk, image_id)
        self.assertEqual(Resource.objects.get(path=thumb_key).media.all()[0].pk, image_id)

        # Delete the media and verify the files are gone.
        response = self.client.delete(f"/rest/Media/{image_id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        self.assertFalse(self._store_obj_exists(image_key))
        self.assertFalse(self._store_obj_exists(thumb_key))

        # Create a video that has thumbnails.
        body = {'thumbnail_url': TEST_IMAGE,
                'thumbnail_gif_url': TEST_IMAGE,
                'type': self.entity_type.pk,
                'section': 'asdf',
                'name': 'asdf',
                'md5': 'asdf'}
        response = self.client.post(f"/rest/Medias/{self.project.pk}", body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        video_id = response.data['id']

        # Make sure we have an video and thumbnail key.
        video = Media.objects.get(pk=video_id)
        thumb_key = video.media_files['thumbnail'][0]['path']
        gif_key = video.media_files['thumbnail_gif'][0]['path']
        self.assertTrue(self._store_obj_exists(thumb_key))
        self.assertTrue(self._store_obj_exists(gif_key))
        self.assertEqual(Resource.objects.get(path=thumb_key).media.all()[0].pk, video_id)
        self.assertEqual(Resource.objects.get(path=gif_key).media.all()[0].pk, video_id)

        # Delete the media and verify the files are gone.
        response = self.client.delete(f"/rest/Media/{video_id}", format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._prune_media()
        self.assertFalse(self._store_obj_exists(thumb_key))
        self.assertFalse(self._store_obj_exists(gif_key))

class AttributeTestCase(APITestCase):
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.project = create_test_project(self.user)
        self.membership = create_test_membership(self.user, self.project)
        self.entity_type = LocalizationType.objects.create(
            name="boxes",
            dtype='box',
            project=self.project,
            attribute_types=create_test_attribute_types(),
        )
        media_entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=self.project,
        )
        self.entity_type.media.add(media_entity_type)
        self.media_entities = [
            create_test_video(self.user, f'asdf{idx}', media_entity_type, self.project)
            for idx in range(random.randint(3, 10))
        ]
        self.entities = [
            create_test_box_with_attributes(
                self.user,
                self.entity_type,
                self.project,
                random.choice(self.media_entities),
                0,
                {"Int Test": random.randint(-100, 100)},
            )
            for _ in range(random.randint(6, 10))
        ]
        self.list_uri = 'AttributeType'
        self.edit_permission = Permission.FULL_CONTROL
        self.patch_json = {
            "entity_type": "LocalizationType",
            "global": "true",
            "old_attribute_type_name": 'Int Test',
            "new_attribute_type": {
                "name": "Renamed Int Test",
                "dtype": "float",
            },
        }
        self.post_json = {
            "entity_type": "LocalizationType",
            "addition": {
                "name": "added integer",
                "dtype": "int",
                "default": 0,
                "minimum": -1,
                "maximum": 1,
            }
        }
        self.delete_json = {
            "entity_type": "LocalizationType",
            "attribute_to_delete": 'Int Test',
        }
        TatorSearch().refresh(self.project.pk)

    def test_patch_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            response = self.client.patch(
                f'/rest/{self.list_uri}/{self.entity_type.pk}',
                self.patch_json,
                format='json')
            with self.subTest(i=index):
                self.assertEqual(response.status_code, expected_status)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

    def test_post_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_201_CREATED
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            response = self.client.post(
                f'/rest/{self.list_uri}/{self.entity_type.pk}',
                self.post_json,
                format='json')
            with self.subTest(i=index):
                self.assertEqual(response.status_code, expected_status)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

    def test_delete_permissions(self):
        permission_index = permission_levels.index(self.edit_permission)
        for index, level in enumerate(permission_levels):
            self.membership.permission = level
            self.membership.save()
            if index >= permission_index:
                expected_status = status.HTTP_200_OK
            else:
                expected_status = status.HTTP_403_FORBIDDEN
            response = self.client.delete(
                f'/rest/{self.list_uri}/{self.entity_type.pk}',
                self.delete_json,
                format='json')
            with self.subTest(i=index):
                self.assertEqual(response.status_code, expected_status)
        self.membership.permission = Permission.FULL_CONTROL
        self.membership.save()

    def tearDown(self):
        self.project.delete()


class MutateAliasTestCase(APITestCase):
    """Tests alias mutation in elasticsearch.
    """
    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.search = TatorSearch()

    def _setup(self):
        project = create_test_project(self.user)
        entity_type = MediaType.objects.create(
            name="video",
            dtype='video',
            project=project,
            attribute_types=create_test_attribute_types(),
        )
        entity = create_test_video(self.user, 'test.mp4', entity_type, project)
        return project, entity_type, entity

    def _convert_value(self, dtype, value):
        if dtype == 'bool':
            converted = str(bool(value)).lower()
        elif dtype == 'int':
            converted = int(value)
            if converted < 0:
                converted = f"\\{converted}"
            else:
                converted = str(converted)
        elif dtype == 'float':
            converted = f'[{float(value) - 0.0001} TO {float(value) + 0.0001}]'
        elif dtype == 'datetime':
            converted = f'\"{value.isoformat()}\"'
        else:
            converted = str(value)
            if isinstance(value, bool):
                converted = converted.lower()
            elif isinstance(value, datetime.datetime):
                converted = f'\"{value.isoformat()}\"'
            elif isinstance(value, int):
                converted = re.sub("^-", "\\-", converted)
        return converted

    def _test_mutation(self, from_dtype, to_dtype, attr_name, search_name, value):
        project, entity_type, entity = self._setup()
        if isinstance(value, datetime.datetime):
            entity.attributes = {attr_name: value.isoformat()}
        else:
            entity.attributes = {attr_name: value}
        entity.save()
        time.sleep(1)
        query_string = f'{search_name}:{self._convert_value(from_dtype, value)}'
        ids, _ = self.search.search(project.pk, {'query': {'query_string': {'query': query_string}}})
        assert(len(ids) == 1)
        entity_type = self.search.mutate_alias(
            entity_type, attr_name, {"name": attr_name, "dtype": to_dtype}
        )
        entity_type.save()
        time.sleep(1)
        query_string = f'{search_name}:{self._convert_value(to_dtype, value)}'
        ids, _ = self.search.search(project.pk, {'query': {'query_string': {'query': query_string}}})
        assert(len(ids) == 1)
        project.delete()
        print(f"Conversion of {from_dtype} to {to_dtype} success!")

    def test_bool_mutations(self):
        for index, new_dtype in enumerate(ALLOWED_MUTATIONS['bool']):
            value = random.choice([True, False])
            with self.subTest(i=index):
                self._test_mutation('bool', new_dtype, 'Bool Test', 'Bool\ Test', value)

    def test_int_mutations(self):
        for index, new_dtype in enumerate(ALLOWED_MUTATIONS['int']):
            value = random.randint(-100, 100)
            with self.subTest(i=index):
                self._test_mutation('int', new_dtype, 'Int Test', 'Int\ Test', value)

    def test_float_mutations(self):
        for index, new_dtype in enumerate(ALLOWED_MUTATIONS['float']):
            value = random.uniform(0, 1000)
            with self.subTest(i=index):
                self._test_mutation('float', new_dtype, 'Float Test', 'Float\ Test', value)

    def test_enum_mutations(self):
        for index, new_dtype in enumerate(ALLOWED_MUTATIONS['enum']):
            value = random_string(10)
            with self.subTest(i=index):
                self._test_mutation('enum', new_dtype, 'Enum Test', 'Enum\ Test', value)

    def test_string_mutations(self):
        for index, new_dtype in enumerate(ALLOWED_MUTATIONS['string']):
            value = random_string(10)
            with self.subTest(i=index):
                self._test_mutation('string', new_dtype, 'String Test', 'String\ Test', value)

    def test_datetime_mutations(self):
        for index, new_dtype in enumerate(ALLOWED_MUTATIONS['datetime']):
            value = datetime.datetime.now()
            with self.subTest(i=index):
                self._test_mutation('datetime', new_dtype, 'Datetime Test', 'Datetime\ Test', value)

    #TODO: write totally different test for geopos mutations (not supported in query string queries)

class JobClusterTestCase(APITestCase):
    @staticmethod
    def _random_job_cluster_spec():
        uid = str(uuid1())
        return {
            "name": f"Job Cluster {uid}",
            "host": "test-host",
            "port": random.randint(4000, 6000),
            "token": uid,
            "cert": f"{uid}.cert",
        }

    def get_affiliation(self, organization, user):
        return Affiliation.objects.filter(organization=organization, user=user)[0]

    def setUp(self):
        self.user = create_test_user()
        self.client.force_authenticate(self.user)
        self.organization = create_test_organization()
        self.affiliation = create_test_affiliation(self.user, self.organization)
        self.list_uri = "JobClusters"
        self.detail_uri = "JobCluster"
        self.create_json = self._random_job_cluster_spec()
        self.entity = JobCluster(organization=self.organization, **self.create_json)
        self.entity.save()

    def test_list_is_an_admin_permissions(self):
        url = f"/rest/{self.list_uri}/{self.organization.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_list_no_affiliation_permissions(self):
        affiliation = self.get_affiliation(self.organization, self.user)
        affiliation.delete()
        url = f"/rest/{self.list_uri}/{self.organization.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        affiliation.save()

    def test_list_is_a_member_permissions(self):
        affiliation = self.get_affiliation(self.organization, self.user)
        old_permission = affiliation.permission
        affiliation.permission = 'Member'
        affiliation.save()
        url = f"/rest/{self.list_uri}/{self.organization.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        affiliation.permission = old_permission
        affiliation.save()

    def test_detail_is_an_admin_permissions(self):
        url = f"/rest/{self.detail_uri}/{self.entity.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_detail_no_affiliation_permissions(self):
        affiliation = self.get_affiliation(self.organization, self.user)
        affiliation.delete()
        url = f"/rest/{self.detail_uri}/{self.entity.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        affiliation.save()

    def test_detail_is_a_member_permissions(self):
        affiliation = self.get_affiliation(self.organization, self.user)
        old_permission = affiliation.permission
        affiliation.permission = 'Member'
        affiliation.save()
        url = f"/rest/{self.detail_uri}/{self.entity.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        affiliation.permission = old_permission
        affiliation.save()

    def tearDown(self):
        self.entity.delete()
        self.organization.delete()
