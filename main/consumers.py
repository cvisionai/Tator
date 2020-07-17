""" TODO: add documentation for this """
import os
import json
import logging
import datetime
import redis
from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from channels.layers import get_channel_layer
from channels.exceptions import StopConsumer

from .models import Project

logger = logging.getLogger(__name__)

class ProgressProducer:
    """Interface for generating progress messages.
    """
    @classmethod
    def setup_redis(cls):
        """ TODO: add documentation for this """
        cls.rds = redis.Redis(
            host=os.getenv('REDIS_HOST'),
            health_check_interval=30,
        )

    def __init__(self, prefix, project_id, gid, uid, name, user, aux={}):
        """Store uid, name, user in a dict. Store project id.
        """
        self.channel_layer = get_channel_layer()
        self.prog_grp = prefix + '_prog_' + str(project_id)
        self.prefix = prefix
        self.gid = gid
        self.uid = uid
        self.header = {
            'type': 'progress',
            'project_id': project_id,
            'uid': uid,
            'uid_gid': gid,
            'prefix': prefix,
            'name': name,
            'user': str(user),
            **aux,
        }
        self.group_header = {
            'type': 'progress',
            'project_id': project_id,
            'project_name': Project.objects.get(pk=project_id).name,
            'gid': gid,
            'prefix': prefix,
            'name': name,
            'user': str(user),
        }

    def _broadcast(self, state, msg, progress=None, aux=None):
        """Output a progress message. Store message in redis.
        """
        msg = {
            **self.header,
            'state': state,
            'message': msg,
        }
        if progress is not None:
            msg['progress'] = progress
        if aux is not None:
            msg = {**msg, **aux}
        try:
            async_to_sync(self.channel_layer.group_send)(self.prog_grp, msg)
        except Exception as exc:
            logger.info(f"Failed to send individual progress message! {str(exc)}")
        json_msg = json.dumps(msg)
        self.rds.hset('uids', self.uid, json_msg)
        if 'swid' in msg:
            now = datetime.datetime.now(datetime.timezone.utc)
            self.rds.hset('sw_latest', msg['swid'], str(now))

    def _summary(self):
        """Broadcasts progress summary and stores message in redis.
        """
        # Hash 'num_jobs' is created by POSTing to JobGroup endpoint.
        if self.rds.hexists('num_jobs', self.gid):
            num_procs = int(self.rds.hget('num_jobs', self.gid))
            num_complete = int(self.rds.hget('num_complete', self.gid))
            # TODO Make a cronjob that cleans these up.
        else:
            num_procs = self.rds.hlen(self.gid + ':started') + self.rds.hlen(self.gid + ':done')
            num_complete = self.rds.hlen(self.gid + ':done')
        msg = {
            **self.group_header,
            'num_procs': num_procs,
            'num_complete': num_complete,
        }
        if num_procs <= num_complete:
            self.rds.delete(self.gid + ':started')
            self.rds.delete(self.gid + ':done')
            self.rds.hdel('gids', self.gid)
        else:
            json_msg = json.dumps(msg)
            self.rds.hset('gids', self.gid, json_msg)
        if num_procs >= num_complete:
            try:
                async_to_sync(self.channel_layer.group_send)(self.prog_grp, msg)
            except:
                logger.info(f"Failed to send summary progress message! {str(exc)}")

    def _increment_summary(self, msg):
        if self.rds.hexists('num_complete', self.gid):
            self.rds.hincrby('num_complete', self.gid, 1)
        self.rds.hdel(self.gid + ':started', self.uid)
        self.rds.hset(self.gid + ':done', self.uid, json.dumps(msg))

    def _clear_latest(self):
        self.rds.hdel('uids', self.uid)

    def queued(self, msg):
        """Broadcast a queued message, add to group processes.
        """
        self._broadcast('started', msg, 0)
        self.rds.hset(self.gid + ':started', self.uid, json.dumps(msg))
        self._summary()

    def progress(self, msg, progress, aux=None):
        """Broadcast a progress message.
        """
        self._broadcast('started', msg, progress, aux)

    def failed(self, msg):
        """Broadcast a failure message.
        """
        self._increment_summary(msg)
        self._broadcast('failed', msg, 100)
        self.rds.hdel(self.gid + ':started', self.uid)
        self.rds.hset(self.gid + ':done', self.uid, json.dumps(msg))
        self._clear_latest()
        self._summary()

    def finished(self, msg, aux=None):
        """Broadcast a finished message.
        """
        self._increment_summary(msg)
        self._broadcast('finished', msg, 100, aux)
        self.rds.hdel(self.gid + ':started', self.uid)
        self.rds.hset(self.gid + ':done', self.uid, json.dumps(msg))
        self._clear_latest()
        self._summary()

# Initialize global redis connection
ProgressProducer.setup_redis()

class ProgressConsumer(JsonWebsocketConsumer):
    """Consumer for all progress messages
    """

    @classmethod
    def setup_redis(cls):
        """ TODO: add documentation for this """
        cls.rds = redis.Redis(
            host=os.getenv('REDIS_HOST'),
            health_check_interval=30,
        )

    def __init__(self, *args, **kwargs):
        logger.info("Creating progress consumer.")
        super().__init__(*args, **kwargs)

    def connect(self):
        """ TODO: add documentation for this """
        self.accept()
        logger.info("Connecting to progress consumer.")
        # Join all project groups that this user is a member of
        projects = Project.objects.filter(membership__user=self.scope['user'])
        for project in projects:
            for prefix in ['algorithm', 'upload', 'download']:
                self._join_and_update(prefix, project.id)

    def progress(self, content):
        """ TODO: add documentation for this """
        self.send_json(content)

    def disconnect(self, close_code):
        """ TODO: add documentation for this """
        logger.info("Progress consumer closed with code {}".format(close_code))
        raise StopConsumer

    def _join_and_update(self, prefix, pid):
        self.prog_grp = prefix + '_prog_' + str(pid)
        # Add this consumer to group corresponding to media type.
        async_to_sync(self.channel_layer.group_add)(
            self.prog_grp,
            self.channel_name,
        )

# Initialize global redis connection
ProgressConsumer.setup_redis()
