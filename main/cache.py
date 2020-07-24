""" TODO: add documentation for this """
import json
import os
import logging
import redis

logger = logging.getLogger(__name__)

def get_media_list_hash(project_id, query_params):
    """ TODO: add documentation for this """
    group = f"media_{project_id}"
    key = json.dumps(query_params, sort_keys=True)
    return (group, key)

def get_localization_list_hash(media_id, entity_type_id, query_params):
    """ TODO: add documentation for this """
    group = f"localization_{media_id}_{entity_type_id}"
    key = json.dumps(query_params, sort_keys=True)
    return (group, key)

def get_treeleaf_list_hash(ancestor, query_params):
    """ TODO: add documentation for this """
    group = f"treeleaf_{ancestor}"
    key = json.dumps(query_params, sort_keys=True)
    return (group, key)

class TatorCache:
    """Interface for caching responses.
    """
    @classmethod
    def setup_redis(cls):
        """ TODO: add documentation for this """
        cls.rds = redis.Redis(
            host=os.getenv('REDIS_HOST'),
            health_check_interval=30,
        )

    def get_media_list_cache(self, project_id, query_params):
        """Returns media list cache or None if it is not cached.
        """
        group, key = get_media_list_hash(project_id, query_params)
        val = None
        if self.rds.hexists(group, key):
            val = json.loads(self.rds.hget(group, key))
        return val

    def set_media_list_cache(self, project_id, query_params, val):
        """Caches a media list response.
        """
        group, key = get_media_list_hash(project_id, query_params)
        self.rds.hset(group, key, json.dumps(val))

    def invalidate_media_list_cache(self, project_id):
        """Clears media list cache.
        """
        group, _ = get_media_list_hash(project_id, {})
        self.rds.delete(group)

    def get_localization_list_cache(self, media_id, entity_type_id, query_params):
        """Returns localization list cache or None if it is not cached.
        """
        group, key = get_localization_list_hash(media_id, entity_type_id, query_params)
        val = None
        if self.rds.hexists(group, key):
            val = json.loads(self.rds.hget(group, key))
        return val

    def set_localization_list_cache(self, media_id, entity_type_id, query_params, val):
        """Caches an localization list response.
        """
        group, key = get_localization_list_hash(media_id, entity_type_id, query_params)
        self.rds.hset(group, key, json.dumps(val))

    def invalidate_localization_list_cache(self, media_id, entity_type_id):
        """Clears localization list cache.
        """
        group, _ = get_localization_list_hash(media_id, entity_type_id, {})
        self.rds.delete(group)

    def get_treeleaf_list_cache(self, ancestor, query_params):
        """Returns tree leaf list cache or None if it is not cached.
        """
        group, key = get_treeleaf_list_hash(ancestor, query_params)
        val = None
        if self.rds.hexists(group, key):
            val = json.loads(self.rds.hget(group, key))
        return val

    def set_treeleaf_list_cache(self, ancestor, query_params, val):
        """Caches a suggestion response.
        """
        group, key = get_treeleaf_list_hash(ancestor, query_params)
        self.rds.hset(group, key, json.dumps(val))

    def invalidate_treeleaf_list_cache(self, ancestor):
        """Clears treeleaf list cache.
        """
        group, _ = get_treeleaf_list_hash(ancestor, {})
        self.rds.delete(group)

    def get_cred_cache(self, user_id, project_id):
        """ TODO: add documentation for this """
        group = f'creds_{project_id}'
        key = f'creds_{project_id}_{user_id}'
        val = None
        if self.rds.hexists(group, key):
            val = self.rds.hget(group, key)
            val = bool(val == 'True')
        return val

    def set_cred_cache(self, user_id, project_id, val):
        """ TODO: add documentation for this """
        group = f'creds_{project_id}'
        key = f'creds_{project_id}_{user_id}'
        self.rds.hset(group, key, str(val))

    def invalidate_cred_cache(self, project_id):
        """ TODO: add documentation for this """
        group = f'creds_{project_id}'
        self.rds.delete(group)

    def invalidate_all(self):
        """Invalidates all caches.
        """
        for prefix in ['media_',
                       'localization_',
                       'treeleaf_',
                       'creds_',
                       'project_']:
            for key in self.rds.scan_iter(match=prefix + '*'):
                logger.info(f"Deleting cache key {key}...")
                self.rds.delete(key)
        logger.info("Cache cleared!")

TatorCache.setup_redis()
