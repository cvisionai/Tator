import logging
import os
from copy import deepcopy
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

logger = logging.getLogger(__name__)

# Used for duplicate ID storage
id_bits=448
id_mask=(1 << id_bits) - 1

def mediaFileSizes(file):
    total_size = 0
    download_size = None

    if file.thumbnail:
        if os.path.exists(file.thumbnail.path):
            total_size += file.thumbnail.size
    if file.meta.dtype == 'video':
        if file.media_files:
            if 'archival' in file.media_files:
                for archival in file.media_files['archival']:
                    if os.path.exists(archival['path']):
                        statinfo = os.stat(archival['path'])
                        total_size += statinfo.st_size
                        if download_size is None:
                            download_size = statinfo.st_size
            if 'streaming' in file.media_files:
                for streaming in file.media_files['streaming']:
                    path = os.path.join('/data', streaming['path'])
                    if os.path.exists(path):
                        statinfo = os.stat(streaming['path'])
                        total_size += statinfo.st_size
                        if download_size is None:
                            download_size = statinfo.st_size
        if file.original:
            if os.path.exists(file.original):
                statinfo = os.stat(file.original)
                total_size += statinfo.st_size
                if download_size is None:
                    download_size = statinfo.st_size
        if file.thumbnail_gif:
            if os.path.exists(file.thumbnail_gif.path):
                total_size += file.thumbnail_gif.size
    if file.file:
        if os.path.exists(file.file.path):
            total_size += file.file.size
            if download_size is None:
                download_size = file.file.size
    return (total_size, download_size)

def drop_dupes(ids):
    """ Drops duplicates in a list without changing the order.
    """
    seen = set()
    seen_add = seen.add
    return [x for x in ids if not (x in seen or seen_add(x))]

class TatorSearch:
    """ Interface for elasticsearch documents.
        There is one index per entity type.
        There is one mapping per attribute type.
        There is one document per entity.
    """
    @classmethod
    def setup_elasticsearch(cls):
        cls.prefix = os.getenv('ELASTICSEARCH_PREFIX')
        if cls.prefix is None:
            cls.prefix = ''
        cls.es = Elasticsearch(
            [os.getenv('ELASTICSEARCH_HOST')],
            timeout=60,
            max_retries=10,
            retry_on_timeout=True,
        )

    def index_name(self, project):
        return f'{self.prefix}project_{project}'

    def create_index(self, project):
        index = self.index_name(project)
        if not self.es.indices.exists(index):
            self.es.indices.create(
                index,
                body={
                    'settings': {
                        'number_of_shards': 1,
                        'number_of_replicas': 1,
                        'analysis': {
                            'normalizer': {
                                'lower_normalizer': {
                                    'type': 'custom',
                                    'char_filter': [],
                                    'filter': ['lowercase', 'asciifolding'],
                                },
                            },
                        },
                    },
                    'mappings': {
                        'properties': {
                            '_media_relation': {
                                'type': 'join',
                                'relations': {
                                    'media': 'annotation',
                                }
                            },
                            'tator_media_name': {'type': 'text'},
                            '_exact_name': {'type': 'keyword', 'normalizer': 'lower_normalizer'},
                            '_md5': {'type': 'keyword'},
                            '_meta': {'type': 'integer'},
                            '_dtype': {'type': 'keyword'},
                        }
                    },
                },
            )
        # Mappings that were added later
        self.es.indices.put_mapping(
            index=index,
            body={'properties': {
                '_exact_treeleaf_name': {'type': 'keyword'},
                'tator_treeleaf_name': {'type': 'text'},
                '_treeleaf_depth': {'type': 'integer'},
                '_treeleaf_path': {'type': 'text'},
                '_annotation_version': {'type': 'integer'},
                '_modified': {'type': 'boolean'},
                '_modified_datetime': {'type': 'date'},
                '_modified_by': {'type': 'keyword'},
                '_postgres_id': {'type': 'long'},
                '_download_size': {'type': 'long'},
                '_total_size': {'type': 'long'},
                '_section': {'type': 'long'},
            }},
        )

    def delete_index(self, project):
        index = self.index_name(project)
        if self.es.indices.exists(index):
            self.es.indices.delete(index)

    def create_mapping(self, entity_type):
        if entity_type.attribute_types:
            for attribute_type in entity_type.attribute_types:
                if attribute_type['dtype'] == 'bool':
                    dtype='boolean'
                elif attribute_type['dtype'] == 'int':
                    dtype='integer'
                elif attribute_type['dtype'] == 'float':
                    dtype='float'
                elif attribute_type['dtype'] == 'enum':
                    dtype='text'
                elif attribute_type['dtype'] == 'string':
                    dtype='text'
                elif attribute_type['dtype'] == 'datetime':
                    dtype='date'
                elif attribute_type['dtype'] == 'geopos':
                    dtype='geo_point'
                self.es.indices.put_mapping(
                    index=self.index_name(entity_type.project.pk),
                    body={'properties': {
                        attribute_type['name']: {'type': dtype},
                    }},
                )

    def bulk_add_documents(self, listOfDocs):
        bulk(self.es, listOfDocs, raise_on_error=False)

    def create_document(self, entity, wait=False):
        """ Indicies an element into ES """
        docs = self.build_document(entity, 'single')
        for doc in docs:
            logger.info(f"Making Doc={doc}")
            res = self.es.index(index=self.index_name(entity.project.pk),
                                id=doc['_id'],
                                refresh=wait,
                                routing=1,
                                body={**doc['_source']})

    def build_document(self, entity, mode='index'):
        """ Returns a list of documents representing the entity to be
            used with the es.helpers.bulk functions
            if mode is 'single', then one can use the 'doc' member
            as the parameters to the es.index function.
        """
        aux = {}
        aux['_meta'] = entity.meta.pk
        aux['_dtype'] = entity.meta.dtype
        aux['_postgres_id'] = entity.pk # Same as ID but indexed/sortable. Use of _id for this
                                        # purpose is not recommended by ES.
        duplicates = []
        if entity.meta.dtype in ['image', 'video']:
            aux['_media_relation'] = 'media'
            aux['tator_media_name'] = entity.name
            aux['_exact_name'] = entity.name
            aux['_md5'] = entity.md5

            # Get total size and download size of this file.
            total_size, download_size = mediaFileSizes(entity)
            aux['_total_size'] = total_size
            aux['_download_size'] = download_size

            # Copy section IDs.
            aux['_section'] = [section.id for section in entity.sections.all().iterator()]
        elif entity.meta.dtype in ['box', 'line', 'dot']:
            aux['_media_relation'] = {
                'name': 'annotation',
                'parent': f"{entity.media.meta.dtype}_{entity.media.pk}",
            }
            if entity.version:
                aux['_annotation_version'] = entity.version.pk
            aux['_modified'] = entity.modified
            aux['_modified_datetime'] = entity.modified_datetime.isoformat()
            aux['_modified_by'] = str(entity.modified_by)
            aux['_user'] = entity.user.pk
            aux['_email'] = entity.user.email
            aux['_meta'] = entity.meta.pk
            aux['_frame'] = entity.frame
            aux['_x'] = entity.x
            aux['_y'] = entity.y
            if entity.thumbnail_image:
                aux['_thumbnail_image'] = entity.thumbnail_image.pk
            else:
                aux['_thumbnail_image'] = None
            if entity.meta.dtype == 'box':
                aux['_width'] = entity.width
                aux['_height'] = entity.height
            elif entity.meta.dtype == 'line':
                aux['_u'] = entity.u
                aux['_v'] = entity.v
            elif entity.meta.dtype == 'dot':
                pass
        elif entity.meta.dtype in ['state']:
            media = entity.media.all()
            if media.exists():
                aux['_media_relation'] = {
                    'name': 'annotation',
                    'parent': f"{media[0].meta.dtype}_{media[0].pk}",
                }
                for media_idx in range(1, media.count()):
                    duplicate = deepcopy(aux)
                    duplicate['_media_relation'] = {
                        'name': 'annotation',
                        'parent': f"{media[media_idx].meta.dtype}_{media[media_idx].pk}",
                    }
                    duplicates.append(duplicate)
            try:
                # If the state has an extracted image, its a
                # duplicated entry in ES.
                extracted_image = entity.extracted
                if extracted_image:
                    duplicate = deepcopy(aux)
                    duplicate['_media_relation'] = {
                        'name': 'annotation',
                        'parent': f"{extracted_image.meta.dtype}_{extracted_image.pk}",
                    }
                    duplicates.append(duplicate)
            except:
                pass
            if entity.version:
                aux['_annotation_version'] = entity.version.pk
            aux['_modified'] = entity.modified
            aux['_modified_datetime'] = entity.modified_datetime.isoformat()
            aux['_modified_by'] = str(entity.modified_by)
        elif entity.meta.dtype in ['leaf']:
            aux['_exact_treeleaf_name'] = entity.name
            aux['tator_treeleaf_name'] = entity.name
            aux['_treeleaf_depth'] = entity.depth()
            aux['_treeleaf_path'] = entity.computePath()
        if entity.attributes is None:
            entity.attributes = {}
            entity.save()

        corrected_attributes={**entity.attributes}
        if mode != 'single':
            for key in corrected_attributes:
                value=corrected_attributes[key]
                # Store django lat/lon as a string
                # Special note: in ES, array representations are lon/lat, but
                # strings are lat/lon, therefore we intentionally swap order here.
                if type(value) == list:
                    corrected_attributes[key] = f"{value[1]},{value[0]}"
        results=[]
        results.append({
            '_index':self.index_name(entity.project.pk),
            '_op_type': mode,
            '_source': {
                **corrected_attributes,
                **aux,
            },
            '_id': f"{aux['_dtype']}_{entity.pk}",
            '_routing': 1,
        })

        # Load in duplicates, if any
        for idx,duplicate in enumerate(duplicates):
            # duplicate_id needs to be unique we use the upper
            # 8 bits of the id field to indicate which duplicate
            # it is. This won't create collisions until there are
            # more than 2^256 elements in the database or more than
            # 256 duplicates for a given type
            duplicate_id = entity.pk + ((idx + 1) << id_bits)
            results.append({
            '_index':self.index_name(entity.project.pk),
            '_op_type': mode,
            '_source': {
                **corrected_attributes,
                **duplicate,
            },
            '_id': f"{aux['_dtype']}_{duplicate_id}",
            '_routing': 1,
            })
        return results


    def delete_document(self, entity):
        # If project is null, the entire index should have been deleted.
        if not entity.project is None:
            index = self.index_name(entity.project.pk)
            if self.es.exists(index=index, id=f'{entity.meta.dtype}_{entity.pk}'):
                self.es.delete(index=index, id=f'{entity.meta.dtype}_{entity.pk}')

    def search_raw(self, project, query):
        return self.es.search(
            index=self.index_name(project),
            body=query,
            stored_fields=[],
        )

    def search(self, project, query):
        if 'sort' not in query:
            query['sort'] = {'_doc': 'asc'}
        size = query.get('size', None)
        if (size is None) or (size >= 10000):
            query['size'] = 10000
            result = self.es.search(
                index=self.index_name(project),
                body=query,
                scroll='1m',
                stored_fields=[],
            )
            scroll_id = result['_scroll_id']
            result = result['hits']
            data = result['hits']
            count = result['total']['value']

            if size:
                count = size
            ids = drop_dupes([int(obj['_id'].split('_')[1]) & id_mask for obj in data])
            while len(ids) < count:
                result = self.es.scroll(
                    scroll_id=scroll_id,
                    scroll='1m',
                )
                ids += drop_dupes([int(obj['_id'].split('_')[1]) & id_mask for obj in result['hits']['hits']])
            ids = ids[:count]
            self.es.clear_scroll(scroll_id)
        else:
            # TODO: This will NOT return the requested number of results if there are
            # duplicates in the dataset.
            result = self.search_raw(project, query)
            result = result['hits']
            data = result['hits']
            count = result['total']['value']
            ids = drop_dupes([int(obj['_id'].split('_')[1]) & id_mask for obj in data])
        return ids, count

    def count(self, project, query):
        index = self.index_name(project)
        return self.es.count(index=index, body=query)['count']

    def refresh(self, project):
        """Force refresh on an index.
        """
        self.es.indices.refresh(index=self.index_name(project))

    def delete(self, project, query):
        """Bulk delete on search results.
        """
        self.es.delete_by_query(
            index=self.index_name(project),
            body=query,
            conflicts='proceed',
        )

    def update(self, project, query, attrs):
        """Bulk update on search results.
        """
        query['script'] = ''
        for key in attrs:
            val = attrs[key]
            if isinstance(val, bool):
                if val:
                    val = 'true'
                else:
                    val = 'false'
            if isinstance(val, list): # This is a list geopos type
                lon, lat = val # Lists are lon first
                val = f'{lat},{lon}' # Convert to string geopos type, lat first
            query['script'] += f"ctx._source['{key}']='{val}';"
        self.es.update_by_query(
            index=self.index_name(project),
            body=query,
            conflicts='proceed',
        )

TatorSearch.setup_elasticsearch()
