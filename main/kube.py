""" TODO: add documentation for this """
import math
import os
import logging
import tempfile
import copy
import json

from kubernetes.client import Configuration
from kubernetes.client import ApiClient
from kubernetes.client import CoreV1Api
from kubernetes.client import CustomObjectsApi
from kubernetes.config import load_incluster_config
import yaml

from .consumers import ProgressProducer
from .version import Git

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

NUM_WORK_PACKETS = 20

def bytes_to_mi_str(num_bytes):
    """ TODO: add documentation for this """
    num_megabytes = int(math.ceil(float(num_bytes)/1024/1024))
    return "{}Mi".format(num_megabytes)

def get_marshal_image_name():
    """ Returns the location and version of the marshal image to use """
    registry = os.getenv('SYSTEM_IMAGES_REGISTRY')
    return f"{registry}/tator_algo_marshal:{Git.sha}"

class JobManagerMixin:
    """ Defines functions for job management.
    """
    def _get_progress_aux(self, job):
        raise NotImplementedError

    def _cancel_message(self):
        raise NotImplementedError

    def _job_type(self):
        raise NotImplementedError

    def find_project(self, selector):
        """ Finds the project associated with a given selector.
        """
        project = None
        response = self.custom.list_namespaced_custom_object(
            group='argoproj.io',
            version='v1alpha1',
            namespace='default',
            plural='workflows',
            label_selector=selector,
        )
        if len(response['items']) > 0:
            project = int(response['items'][0]['metadata']['labels']['project'])
        return project

    def cancel_jobs(self, selector):
        """ Deletes argo workflows by selector.
        """
        cancelled = False

        # Get the object by selecting on uid label.
        response = self.custom.list_namespaced_custom_object(
            group='argoproj.io',
            version='v1alpha1',
            namespace='default',
            plural='workflows',
            label_selector=f'{selector},job_type={self._job_type()}',
        )

        # Delete the object.
        if len(response['items']) > 0:
            for job in response['items']:
                name = job['metadata']['name']
                response = self.custom.delete_namespaced_custom_object(
                    group='argoproj.io',
                    version='v1alpha1',
                    namespace='default',
                    plural='workflows',
                    name=name,
                    body={},
                    grace_period_seconds=0,
                )
                if response['status'] == 'Success':
                    cancelled = True
                    prog = ProgressProducer(
                        self._job_type(),
                        int(job['metadata']['labels']['project']),
                        job['metadata']['labels']['gid'],
                        job['metadata']['labels']['uid'],
                        job['metadata']['annotations']['name'],
                        int(job['metadata']['labels']['user']),
                        self._get_progress_aux(job),
                    )
                    prog.failed(self._cancel_message())
        return cancelled

class TatorTranscode(JobManagerMixin):
    """ Interface to kubernetes REST API for starting transcodes.
    """

    def __init__(self):
        """ Intializes the connection. If environment variables for
            remote transcode are defined, connect to that cluster.
        """
        host = os.getenv('REMOTE_TRANSCODE_HOST')
        port = os.getenv('REMOTE_TRANSCODE_PORT')
        token = os.getenv('REMOTE_TRANSCODE_TOKEN')
        cert = os.getenv('REMOTE_TRANSCODE_CERT')

        if host:
            conf = Configuration()
            conf.api_key['authorization'] = token
            conf.host = f'https://{host}:{port}'
            conf.verify_ssl = True
            conf.ssl_ca_cert = cert
            api_client = ApiClient(conf)
            self.corev1 = CoreV1Api(api_client)
            self.custom = CustomObjectsApi(api_client)
        else:
            load_incluster_config()
            self.corev1 = CoreV1Api()
            self.custom = CustomObjectsApi()

        self.setup_common_steps()

    def setup_common_steps(self):
        """ Sets up the basic steps for a transcode pipeline.
        """
        # Setup common pipeline steps
        # Define persistent volume claim.
        self.pvc = {
            'metadata': {
                'name': 'transcode-scratch',
            },
            'spec': {
                'storageClassName': 'nfs-client',
                'accessModes': ['ReadWriteOnce'],
                'resources': {
                    'requests': {
                        'storage': os.getenv("TRANSCODER_PVC_SIZE"),
                    }
                }
            }
        }

        def spell_out_params(params):
            yaml_params = [{"name": x} for x in params]
            return yaml_params

        # Define each task in the pipeline.

        # Download task exports the human readable filename a
        # workflow global to support the onExit handler
        self.download_task = {
            'name': 'download',
            'retryStrategy': {
                'limit': 3,
                'backoff': {
                    'duration': '5s',
                    'factor': 2
                },
            },
            'inputs': {'parameters' : spell_out_params(['original',
                                                        'url'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['wget',],
                'args': ['-O', '{{inputs.parameters.original}}', '{{inputs.parameters.url}}'],
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '512Mi',
                        'cpu': '500m',
                    },
                },
            },
        }

        # Deletes the remote TUS file
        self.delete_task = {
            'name': 'delete',
            'inputs': {'parameters' : spell_out_params(['url'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['curl',],
                'args': ['-X', 'DELETE', '{{inputs.parameters.url}}'],
                'resources': {
                    'limits': {
                        'memory': '128Mi',
                        'cpu': '500m',
                    },
                },
            },
        }

        # Unpacks a tarball and sets up the work products for follow up
        # dags or steps
        unpack_params = [{'name': f'videos-{x}',
                          'valueFrom': {'path': f'/work/videos_{x}.json'}}
                         for x in range(NUM_WORK_PACKETS)]

        # TODO: Don't make work packets for localizations / states
        unpack_params.extend([{'name': f'localizations-{x}',
                               'valueFrom': {'path': f'/work/localizations_{x}.json'}}
                              for x in range(NUM_WORK_PACKETS)])

        unpack_params.extend([{'name': f'states-{x}',
                               'valueFrom': {'path': f'/work/states_{x}.json'}}
                              for x in range(NUM_WORK_PACKETS)])
        self.unpack_task = {
            'name': 'unpack',
            'inputs': {'parameters' : spell_out_params(['original'])},
            'outputs': {'parameters' : unpack_params},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'env': [{'name': 'TATOR_URL', 'value': '{{workflow.parameters.rest_url}}'},
                        {'name': 'TATOR_PROJECT', 'value': '{{workflow.parameters.project}}'},
                        {'name': 'TATOR_TOKEN', 'value': '{{workflow.parameters.token}}'}],
                'command': ['bash',],
                'args': ['unpack.sh', '{{inputs.parameters.original}}', '/work'],
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '512Mi',
                        'cpu': '1000m',
                    },
                },
            },
        }

        self.data_import = {
            'name': 'data-import',
            'inputs': {'parameters' : spell_out_params(['md5', 'file', 'mode'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': ['importDataFromCsv.py',
                         '--url', '{{workflow.parameters.rest_url}}',
                         '--token', '{{workflow.parameters.token}}',
                         '--project', '{{workflow.parameters.project}}',
                         '--mode', '{{inputs.parameters.mode}}',
                         '--media-md5', '{{inputs.parameters.md5}}',
                         '{{inputs.parameters.file}}'],
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '512Mi',
                        'cpu': '1000m',
                    },
                },
            },
        }

        self.create_media_task = {
            'name': 'create-media',
            'inputs': {'parameters': spell_out_params(['entity_type', 'name', 'md5'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': ['-m', 'tator.transcode.create_media',
                         '--host', '{{workflow.parameters.host}}',
                         '--token', '{{workflow.parameters.token}}',
                         '--project', '{{workflow.parameters.project}}',
                         '--media_type', '{{inputs.parameters.entity_type}}',
                         '--section', '{{workflow.parameters.section}}',
                         '--name', '{{inputs.parameters.name}}',
                         '--md5', '{{inputs.parameters.md5}}',
                         '--output', '/work/media_id.txt'],
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '128Mi',
                        'cpu': '100m',
                    },
                },
            },
            'outputs': {
                'parameters': [{
                    'name': 'media_id',
                    'valueFrom': {'path': '/work/media_id.txt'},
                }],
            },
        }

        self.determine_transcode_task = {
            'name': 'determine-transcode',
            'inputs': {'parameters': spell_out_params(['entity_type', 'original'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': ['-m', 'tator.transcode.determine_transcode',
                         '--host', '{{workflow.parameters.host}}',
                         '--token', '{{workflow.parameters.token}}',
                         '--media_type', '{{inputs.parameters.entity_type}}',
                         '--output', '/work/workloads.json',
                         '{{inputs.parameters.original}}'],
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '512Mi',
                        'cpu': '500m',
                    },
                },
            },
            'outputs': {
                'parameters': [{
                    'name': 'workloads',
                    'valueFrom': {'path': '/work/workloads.json'},
                }],
            },
        }

        self.transcode_task = {
            'name': 'transcode',
            'nodeSelector' : {'cpuWorker' : 'yes'},
            'inputs': {'parameters' : spell_out_params(['original', 'transcoded', 'media',
                                                        'category', 'raw_width', 'raw_height',
                                                        'resolutions'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': ['-m', 'tator.transcode.transcode',
                         '--host', '{{workflow.parameters.host}}',
                         '--token', '{{workflow.parameters.token}}',
                         '--media', '{{inputs.parameters.media}}',
                         '--category', '{{inputs.parameters.category}}',
                         '--raw_width', '{{inputs.parameters.raw_width}}',
                         '--raw_height', '{{inputs.parameters.raw_height}}',
                         '--resolutions', '{{inputs.parameters.resolutions}}',
                         '--gid', '{{workflow.parameters.gid}}',
                         '--uid', '{{workflow.parameters.uid}}',
                         '--output', '{{inputs.parameters.transcoded}}',
                         '--input', '{{inputs.parameters.original}}'],
                'workingDir': '/scripts',
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '4Gi',
                        'cpu': os.getenv("TRANSCODER_CPU_LIMIT"),
                    },
                },
            },
        }
        self.thumbnail_task = {
            'name': 'thumbnail',
            'nodeSelector' : {'cpuWorker' : 'yes'},
            'inputs': {'parameters' : spell_out_params(['original', 'thumbnail',
                                                        'thumbnail_gif', 'media'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': ['-m', 'tator.transcode.make_thumbnails',
                         '--host', '{{workflow.parameters.host}}',
                         '--token', '{{workflow.parameters.token}}',
                         '--media', '{{inputs.parameters.media}}',
                         '--output', '{{inputs.parameters.thumbnail}}',
                         '--gif', '{{inputs.parameters.thumbnail_gif}}',
                         '{{inputs.parameters.original}}'],
                'workingDir': '/scripts',
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '4Gi',
                        'cpu': '1000m',
                    },
                },
            },
        }

        self.image_upload_task = {
            'name': 'image-upload',
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': [
                    'imageLoop.py',
                    '--tus_url', '{{workflow.parameters.tus_url}}',
                    '--url', '{{workflow.parameters.rest_url}}',
                    '--token', '{{workflow.parameters.token}}',
                    '--project', '{{workflow.parameters.project}}',
                    '--gid', '{{workflow.parameters.gid}}',
                    '--uid', '{{workflow.parameters.uid}}',
                    # TODO: If we made section a DAG argument, we could
                    # conceviably import a tar across multiple sections
                    '--section', '{{workflow.parameters.section}}',
                    '--progressName', '{{workflow.parameters.upload_name}}',
                ],
                'workingDir': '/scripts',
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '500Mi',
                        'cpu': '1000m',
                    },
                },
            },
        }

        self.upload_task = {
            'name': 'upload',
            'inputs': {'parameters' : spell_out_params(['url',
                                                        'original',
                                                        'transcoded',
                                                        'thumbnail',
                                                        'thumbnail_gif',
                                                        'segments',
                                                        'entity_type',
                                                        'name',
                                                        'md5'])},
            'container': {
                'image': '{{workflow.parameters.transcoder_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': [
                    'uploadTranscodedVideo.py',
                    '--original_path', '{{inputs.parameters.original}}',
                    '--original_url', '{{inputs.parameters.url}}',
                    '--transcoded_path', '{{inputs.parameters.transcoded}}',
                    '--thumbnail_path', '{{inputs.parameters.thumbnail}}',
                    '--thumbnail_gif_path', '{{inputs.parameters.thumbnail_gif}}',
                    '--tus_url', '{{workflow.parameters.tus_url}}',
                    '--url', '{{workflow.parameters.rest_url}}',
                    '--token', '{{workflow.parameters.token}}',
                    '--project', '{{workflow.parameters.project}}',
                    '--type', '{{inputs.parameters.entity_type}}',
                    '--gid', '{{workflow.parameters.gid}}',
                    '--uid', '{{workflow.parameters.uid}}',
                    # TODO: If we made section a DAG argument, we could
                    # conceviably import a tar across multiple sections
                    '--section', '{{workflow.parameters.section}}',
                    '--name', '{{inputs.parameters.name}}',
                    '--md5', '{{inputs.parameters.md5}}',
                    '--progressName', '{{workflow.parameters.upload_name}}',
                ],
                'workingDir': '/scripts',
                'volumeMounts': [{
                    'name': 'transcode-scratch',
                    'mountPath': '/work',
                }],
                'resources': {
                    'limits': {
                        'memory': '500Mi',
                        'cpu': '1000m',
                    },
                },
            },
        }

        # Define task to send progress message in case of failure.
        self.progress_task = {
            'name': 'progress',
            'inputs': {'parameters' : spell_out_params(['state',
                                                        'message',
                                                        'progress'])},
            'container': {
                'image': '{{workflow.parameters.marshal_image}}',
                'imagePullPolicy': 'IfNotPresent',
                'command': ['python3',],
                'args': [
                    'sendProgress.py',
                    '--url', '{{workflow.parameters.rest_url}}',
                    '--token', '{{workflow.parameters.token}}',
                    '--project', '{{workflow.parameters.project}}',
                    '--job_type', 'upload',
                    '--gid', '{{workflow.parameters.gid}}',
                    '--uid', '{{workflow.parameters.uid}}',
                    '--state', '{{inputs.parameters.state}}',
                    '--message', '{{inputs.parameters.message}}',
                    '--progress', '{{inputs.parameters.progress}}',
                    # Pull the name from the upload parameter
                    '--name', '{{workflow.parameters.upload_name}}',
                    '--section', '{{workflow.parameters.section}}',
                ],
                'workingDir': '/',
                'resources': {
                    'limits': {
                        'memory': '32Mi',
                        'cpu': '100m',
                    },
                },
            },
        }

        # Define a exit handler.
        self.exit_handler = {
            'name': 'exit-handler',
            'steps': [[
                {
                    'name': 'send-fail',
                    'template': 'progress',
                    'when': '{{workflow.status}} != Succeeded',
                    'arguments' : {'parameters':
                                   [
                                       {'name': 'state', 'value': 'failed'},
                                       {'name': 'message', 'value': 'Media Import Failed'},
                                       {'name': 'progress', 'value': '0'},
                                   ]
                    }
                },
                {
                    'name': 'send-success',
                    'template': 'progress',
                    'when': '{{workflow.status}} == Succeeded',
                    'arguments' : {'parameters':
                                   [
                                       {'name': 'state', 'value': 'finished'},
                                       {'name': 'message', 'value': 'Media Import Complete'},
                                       {'name': 'progress', 'value': '100'},
                                   ]
                }
                }
            ]],
        }

    def get_unpack_and_transcode_tasks(self, paths, url):
        """ Generate a task object describing the dependencies of a transcode from tar"""

        # Generate an args structure for the DAG
        args = [{'name': 'url', 'value': url}]
        for key in paths:
            args.append({'name': key, 'value': paths[key]})
        parameters = {"parameters" : args}

        def make_item_arg(name):
            return {'name': name,
                    'value': f'{{{{item.{name}}}}}'}

        instance_args = ['entity_type',
                         'name',
                         'md5']

        item_parameters = {"parameters" : [make_item_arg(x) for x in instance_args]}
        # unpack work list
        item_parameters["parameters"].append({"name": "url",
                                              "value": "None"})
        item_parameters["parameters"].append({"name": "original",
                                              "value": "{{item.dirname}}/{{item.name}}"})
        item_parameters["parameters"].append({"name": "transcoded",
                                              "value": "{{item.dirname}}/{{item.base}}_transcoded"})
        item_parameters["parameters"].append({"name": "thumbnail",
                                              "value": "{{item.dirname}}/{{item.base}}_thumbnail.jpg"})
        item_parameters["parameters"].append({"name": "thumbnail_gif",
                                              "value": "{{item.dirname}}/{{item.base}}_thumbnail_gif.gif"})
        item_parameters["parameters"].append({"name": "segments",
                                              "value": "{{item.dirname}}/{{item.base}}_segments.json"})
        state_import_parameters = {"parameters" : [make_item_arg(x) for x in ["md5", "file"]]}
        localization_import_parameters = {"parameters" : [make_item_arg(x) for x in ["md5", "file"]]}

        state_import_parameters["parameters"].append({"name": "mode", "value": "state"})
        localization_import_parameters["parameters"].append({"name": "mode", "value": "localizations"})

        unpack_task = {
            'name': 'unpack-pipeline',
            'dag': {
                # First download, unpack and delete archive. Then Iterate over each video and upload
                # Lastly iterate over all localization and state files.
                'tasks' : [{'name': 'download-task',
                            'template': 'download',
                            'arguments': parameters},
                           {'name': 'unpack-task',
                            'template': 'unpack',
                            'arguments': parameters,
                            'dependencies' : ['download-task']},
                           {'name': 'delete-task',
                            'template': 'delete',
                            'arguments': parameters,
                            'dependencies' : ['unpack-task']}
                           ]
                }
            } # end of dag

        unpack_task['dag']['tasks'].extend([{'name': f'transcode-task-{x}',
                                             'template': 'transcode-pipeline',
                                             'arguments' : item_parameters,
                                             'withParam' : f'{{{{tasks.unpack-task.outputs.parameters.videos-{x}}}}}',
                                             'dependencies' : ['unpack-task']}
                                            for x in range(NUM_WORK_PACKETS)])
        unpack_task['dag']['tasks'].append({'name': 'image-upload-task',
                                            'template': 'image-upload',
                                            'dependencies' : ['unpack-task']})

        deps = [f'transcode-task-{x}' for x in range(NUM_WORK_PACKETS)]
        deps.append('image-upload-task')
        unpack_task['dag']['tasks'].extend([{'name': f'state-import-task-{x}',
                                             'template': 'data-import',
                                             'arguments' : state_import_parameters,
                                             'dependencies' : deps,
                                             'withParam': f'{{{{tasks.unpack-task.outputs.parameters.states-{x}}}}}'}
                                            for x in range(NUM_WORK_PACKETS)])

        unpack_task['dag']['tasks'].extend([{'name': f'localization-import-task-{x}',
                                             'template': 'data-import',
                                             'arguments' : localization_import_parameters,
                                             'dependencies' : deps,
                                             'withParam': f'{{{{tasks.unpack-task.outputs.parameters.localizations-{x}}}}}'}
                                            for x in range(NUM_WORK_PACKETS)])
        return unpack_task

    def get_transcode_dag(self):
        """ Return the DAG that describes transcoding a single media file """
        def make_passthrough_arg(name):
            return {'name': name,
                    'value': f'{{{{inputs.parameters.{name}}}}}'}

        instance_args = ['url',
                         'original',
                         'transcoded',
                         'thumbnail',
                         'thumbnail_gif',
                         'segments',
                         'entity_type',
                         'name',
                         'md5']
        passthrough_parameters = {"parameters" : [make_passthrough_arg(x) for x in instance_args]}

        pipeline_task = {
            'name': 'transcode-pipeline',
            'inputs': passthrough_parameters,
            'dag': {
                'tasks': [{
                    'name': 'create-media-task',
                    'template': 'create-media',
                    'arguments': passthrough_parameters,
                }, {
                    'name': 'thumbnail-task',
                    'template': 'thumbnail',
                    'arguments': {
                        'parameters': passthrough_parameters['parameters'] + [{
                            'name': 'media',
                            'value': '{{tasks.create-media-task.outputs.parameters.media_id}}',
                        }],
                    },
                    'dependencies': ['create-media-task'],
                }, {
                    'name': 'determine-transcode-task',
                    'template': 'determine-transcode',
                    'arguments': passthrough_parameters,
                }, {
                    'name': 'transcode-task',
                    'template': 'transcode',
                    'arguments': {
                        'parameters': passthrough_parameters['parameters'] + [{
                            'name': 'category',
                            'value': '{{item.category}}',
                        }, {
                            'name': 'raw_width',
                            'value': '{{item.raw_width}}',
                        }, {
                            'name': 'raw_height',
                            'value': '{{item.raw_height}}',
                        }, {
                            'name': 'resolutions',
                            'value': '{{item.resolutions}}',
                        }, {
                            'name': 'media',
                            'value': '{{tasks.create-media-task.outputs.parameters.media_id}}',
                        }],
                    },
                    'dependencies': ['thumbnail-task', 'determine-transcode-task'],
                    'withParam': '{{tasks.determine-transcode-task.outputs.parameters.workloads}}',
                }],
            },
        }

        return pipeline_task
    def get_transcode_task(self, item, url):
        """ Generate a task object describing the dependencies of a transcode """
        # Generate an args structure for the DAG
        args = [{'name': 'url', 'value': url}]
        for key in item:
            args.append({'name': key, 'value': item[key]})
        parameters = {"parameters" : args}

        pipeline = {
            'name': 'single-file-pipeline',
            'dag': {
                # First download, unpack and delete archive. Then Iterate over each video and upload
                # Lastly iterate over all localization and state files.
                'tasks' : [{'name': 'download-task',
                            'template': 'download',
                            'arguments': parameters},
                           {'name': 'transcode-task',
                            'template': 'transcode-pipeline',
                            'arguments' : parameters,
                            'dependencies' : ['download-task']}]
                }
            }

        return pipeline


    def _get_progress_aux(self, job):
        return {'section': job['metadata']['annotations']['section']}

    def _cancel_message(self):
        return 'Transcode aborted!'

    def _job_type(self):
        return 'upload'

    def start_tar_import(self,
                         project,
                         entity_type,
                         token,
                         url,
                         name,
                         section,
                         gid,
                         uid,
                         user,
                         upload_size):
        """ Initiate a transcode based on the contents on an archive """

        if entity_type != -1:
            raise Exception("entity type is not -1!")

        if upload_size:
            rounded_size = upload_size * 4
            self.pvc['spec']['resources']['requests']['storage'] = bytes_to_mi_str(rounded_size)

        args = {'original': '/work/' + name,
                'name': name}
        docker_registry = os.getenv('SYSTEM_IMAGES_REGISTRY')
        global_args = {'upload_name': name,
                       'host': f'https://{os.getenv("MAIN_HOST")}',
                       'rest_url': f'https://{os.getenv("MAIN_HOST")}/rest',
                       'tus_url' : f'https://{os.getenv("MAIN_HOST")}/files/',
                       'project' : str(project),
                       'token' : str(token),
                       'section' : section,
                       'gid': gid,
                       'uid': uid,
                       'user': str(user),
                       'transcoder_image' : f"{docker_registry}/tator_transcoder:{Git.sha}",
                       'marshal_image': get_marshal_image_name()}
        global_parameters = [{"name": x, "value": global_args[x]} for x in global_args]

        pipeline_task = self.get_unpack_and_transcode_tasks(args, url)
        # Define the workflow spec.
        manifest = {
            'apiVersion': 'argoproj.io/v1alpha1',
            'kind': 'Workflow',
            'metadata': {
                'generateName': 'transcode-workflow-',
                'labels': {
                    'job_type': 'upload',
                    'project': str(project),
                    'gid': gid,
                    'uid': uid,
                    'user': str(user),
                },
                'annotations': {
                    'name': name,
                    'section': section,
                },
            },
            'spec': {
                'entrypoint': 'unpack-pipeline',
                'arguments': {'parameters' : global_parameters},
                'onExit': 'exit-handler',
                'ttlStrategy': {'secondsAfterSuccess': 300,
                                'secondsAfterFailure': 86400},
                'volumeClaimTemplates': [self.pvc],
                'parallelism': 4,
                'templates': [
                    self.download_task,
                    self.delete_task,
                    self.create_media_task,
                    self.determine_transcode_task,
                    self.transcode_task,
                    self.thumbnail_task,
                    self.image_upload_task,
                    self.unpack_task,
                    self.get_transcode_dag(),
                    pipeline_task,
                    self.progress_task,
                    self.exit_handler,
                    self.data_import
                ],
            },
        }

        # Create the workflow
        self.custom.create_namespaced_custom_object(
            group='argoproj.io',
            version='v1alpha1',
            namespace='default',
            plural='workflows',
            body=manifest,
        )

    def start_transcode(self, project, entity_type, token, url, name, section, md5, gid, uid,
                        user, upload_size):
        """ Creates an argo workflow for performing a transcode.
        """
        # Define paths for transcode outputs.
        base, _ = os.path.splitext(name)
        args = {
            'original': '/work/' + name,
            'transcoded': '/work/' + base + '_transcoded',
            'thumbnail': '/work/' + base + '_thumbnail.jpg',
            'thumbnail_gif': '/work/' + base + '_thumbnail_gif.gif',
            'segments': '/work/' + base + '_segments.json',
            'entity_type': str(entity_type),
            'md5' : md5,
            'name': name,
        }

        if upload_size:
            rounded_size = upload_size * 4
            self.pvc['spec']['resources']['requests']['storage'] = bytes_to_mi_str(rounded_size)

        docker_registry = os.getenv('SYSTEM_IMAGES_REGISTRY')
        global_args = {'upload_name': name,
                       'host' : f'https://{os.getenv("MAIN_HOST")}',
                       'rest_url' : f'https://{os.getenv("MAIN_HOST")}/rest',
                       'tus_url' : f'https://{os.getenv("MAIN_HOST")}/files/',
                       'token' : str(token),
                       'project' : str(project),
                       'section' : section,
                       'gid': gid,
                       'uid': uid,
                       'user': str(user),
                       'transcoder_image' : f"{docker_registry}/tator_transcoder:{Git.sha}",
                       'marshal_image': get_marshal_image_name()}
        global_parameters = [{"name": x, "value": global_args[x]} for x in global_args]

        pipeline_task = self.get_transcode_task(args, url)
        # Define the workflow spec.
        manifest = {
            'apiVersion': 'argoproj.io/v1alpha1',
            'kind': 'Workflow',
            'metadata': {
                'generateName': 'transcode-workflow-',
                'labels': {
                    'job_type': 'upload',
                    'project': str(project),
                    'gid': gid,
                    'uid': uid,
                    'user': str(user),
                },
                'annotations': {
                    'name': name,
                    'section': section,
                },
            },
            'spec': {
                'entrypoint': 'single-file-pipeline',
                'onExit': 'exit-handler',
                'arguments': {'parameters' : global_parameters},
                'ttlStrategy': {'secondsAfterSuccess': 300,
                                'secondsAfterFailure': 86400},
                'volumeClaimTemplates': [self.pvc],
                'templates': [
                    self.download_task,
                    self.create_media_task,
                    self.determine_transcode_task,
                    self.transcode_task,
                    self.thumbnail_task,
                    self.image_upload_task,
                    self.get_transcode_dag(),
                    pipeline_task,
                    self.progress_task,
                    self.exit_handler,
                ],
            },
        }

        # Create the workflow
        self.custom.create_namespaced_custom_object(
            group='argoproj.io',
            version='v1alpha1',
            namespace='default',
            plural='workflows',
            body=manifest,
        )

class TatorAlgorithm(JobManagerMixin):
    """ Interface to kubernetes REST API for starting algorithms.
    """

    def __init__(self, alg):
        """ Intializes the connection. If algorithm object includes
            a remote cluster, use that. Otherwise, use this cluster.
        """
        if alg.cluster:
            host = alg.cluster.host
            port = alg.cluster.port
            token = alg.cluster.token
            f_d, cert = tempfile.mkstemp(text=True)
            with open(f_d, 'w') as f: #pylint: disable=invalid-name
                f.write(alg.cluster.cert)
            conf = Configuration()
            conf.api_key['authorization'] = token
            conf.host = f'https://{host}:{port}'
            conf.verify_ssl = True
            conf.ssl_ca_cert = cert
            api_client = ApiClient(conf)
            self.corev1 = CoreV1Api(api_client)
            self.custom = CustomObjectsApi(api_client)
        else:
            load_incluster_config()
            self.corev1 = CoreV1Api()
            self.custom = CustomObjectsApi()

        # Read in the manifest.
        if alg.manifest:
            self.manifest = yaml.safe_load(alg.manifest.open(mode='r'))

            if 'volumeClaimTemplates' in self.manifest['spec']:
                for claim in self.manifest['spec']['volumeClaimTemplates']:
                    storage_class_name = claim['spec'].get('storageClassName', None)
                    if storage_class_name is None:
                        claim['storageClassName'] = 'nfs-client'
                        logger.warning(f"Implicitly sc to pvc of Algo:{alg.pk}")

        # Save off the algorithm name.
        self.name = alg.name

    def _get_progress_aux(self, job):
        return {
            'sections': job['metadata']['annotations']['sections'],
            'media_ids': job['metadata']['annotations']['media_ids'],
        }

    def _cancel_message(self):
        return 'Algorithm aborted!'

    def _job_type(self):
        return 'algorithm'

    def start_algorithm(self, media_ids, sections, gid, uid, token, project, user):
        """ Starts an algorithm job, substituting in parameters in the
            workflow spec.
        """
        # Make a copy of the manifest from the database.
        manifest = copy.deepcopy(self.manifest)

        # Add in workflow parameters.
        manifest['spec']['arguments'] = {'parameters': [
            {
                'name': 'name',
                'value': self.name,
            }, {
                'name': 'media_ids',
                'value': media_ids,
            }, {
                'name': 'sections',
                'value': sections,
            }, {
                'name': 'gid',
                'value': gid,
            }, {
                'name': 'uid',
                'value': uid,
            }, {
                'name': 'rest_url',
                'value': f'https://{os.getenv("MAIN_HOST")}/rest',
            }, {
                'name': 'rest_token',
                'value': str(token),
            }, {
                'name': 'tus_url',
                'value': f'https://{os.getenv("MAIN_HOST")}/files/',
            }, {
                'name': 'project_id',
                'value': str(project),
            },
        ]}

        # If no exit process is defined, add one to close progress.
        if 'onExit' not in manifest['spec']:
            failed_task = {
                'name': 'tator-failed',
                'container': {
                    'image': get_marshal_image_name(),
                    'imagePullPolicy': 'Always',
                    'command': ['python3',],
                    'args': [
                        'sendProgress.py',
                        '--url', f'https://{os.getenv("MAIN_HOST")}/rest',
                        '--token', str(token),
                        '--project', str(project),
                        '--job_type', 'algorithm',
                        '--gid', gid,
                        '--uid', uid,
                        '--state', 'failed',
                        '--message', 'Algorithm failed!',
                        '--progress', '0',
                        '--name', self.name,
                        '--sections', sections,
                        '--media_ids', media_ids,
                    ],
                    'resources': {
                        'limits': {
                            'memory': '32Mi',
                            'cpu': '100m',
                        },
                    },
                },
            }
            succeeded_task = {
                'name': 'tator-succeeded',
                'container': {
                    'image': get_marshal_image_name(),
                    'imagePullPolicy': 'Always',
                    'command': ['python3',],
                    'args': [
                        'sendProgress.py',
                        '--url', f'https://{os.getenv("MAIN_HOST")}/rest',
                        '--token', str(token),
                        '--project', str(project),
                        '--job_type', 'algorithm',
                        '--gid', gid,
                        '--uid', uid,
                        '--state', 'finished',
                        '--message', 'Algorithm complete!',
                        '--progress', '100',
                        '--name', self.name,
                        '--sections', sections,
                        '--media_ids', media_ids,
                    ],
                    'resources': {
                        'limits': {
                            'memory': '32Mi',
                            'cpu': '100m',
                        },
                    },
                },
            }
            exit_handler = {
                'name': 'tator-exit-handler',
                'steps': [[{
                    'name': 'send-fail',
                    'template': 'tator-failed',
                    'when': '{{workflow.status}} != Succeeded',
                }, {
                    'name': 'send-succeed',
                    'template': 'tator-succeeded',
                    'when': '{{workflow.status}} == Succeeded',
                }]],
            }
            manifest['spec']['onExit'] = 'tator-exit-handler'
            manifest['spec']['templates'] += [
                failed_task,
                succeeded_task,
                exit_handler
            ]

        # Set labels and annotations for job management
        if 'labels' not in manifest['metadata']:
            manifest['metadata']['labels'] = {}
        if 'annotations' not in manifest['metadata']:
            manifest['metadata']['annotations'] = {}
        manifest['metadata']['labels'] = {
            **manifest['metadata']['labels'],
            'job_type': 'algorithm',
            'project': str(project),
            'gid': gid,
            'uid': uid,
            'user': str(user),
        }
        manifest['metadata']['annotations'] = {
            **manifest['metadata']['annotations'],
            'name': self.name,
            'sections': sections,
            'media_ids': media_ids,
        }

        response = self.custom.create_namespaced_custom_object(
            group='argoproj.io',
            version='v1alpha1',
            namespace='default',
            plural='workflows',
            body=manifest,
        )

        return response

class TatorMove:
    """ TODO: add documentation for this """
    def __init__(self):
        # Load in the workflow yaml.
        with open('/tator_online/workflows/move-video.yaml', 'r') as f: #pylint: disable=invalid-name
            self.workflow = yaml.safe_load(f)

        # Initialize kube interface.
        load_incluster_config()
        self.corev1 = CoreV1Api()
        self.custom = CustomObjectsApi()

    def _set_parameter(self, name, value):
        for param in self.workflow['spec']['arguments']['parameters']:
            if param['name'] == name:
                param['value'] = value
                break

    def move_video(self, media_id, token, move_list, media_files, gid, uid):
        """ Create a workflow for moving files.

        :param project: Unique integer identifying a project.
        :param media_id: Unique integer identifying a media.
        :param token: API token.
        :param move_list: List of dicts containing src and dst keys, with values
            specifying the source and destination paths respectively.
        :param media_files: Used to call the Media PATCH endpoint video/audio definitions.
        """
        host = f"https://{os.getenv('MAIN_HOST')}"
        docker_registry = os.getenv('SYSTEM_IMAGES_REGISTRY')

        # Set up media update object
        media_update = {'media_files': media_files}
        if gid is not None and uid is not None:
            media_update['gid'] = gid
            media_update['uid'] = uid

        # Set required workflow parameters.
        self._set_parameter('transcoder_image', f"{docker_registry}/tator_transcoder:{Git.sha}")
        self._set_parameter('host', host)
        self._set_parameter('token', token)
        self._set_parameter('media_id', str(media_id))
        self._set_parameter('move_list', json.dumps(move_list))
        self._set_parameter('media_update', json.dumps(media_update))

        response = self.custom.create_namespaced_custom_object(
            group='argoproj.io',
            version='v1alpha1',
            namespace='default',
            plural='workflows',
            body=self.workflow,
        )

        return response
