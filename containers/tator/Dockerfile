FROM ubuntu:18.04
MAINTAINER CVision AI <info@cvisionai.com>
# Install apt packages
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        python3 python3-pip libgraphviz-dev xdot \
        python3-setuptools python3-dev gcc libgdal-dev git vim curl libffi-dev \
        ffmpeg wget && rm -rf /var/lib/apt/lists

# Install pip packages
RUN python3 -m pip --no-cache-dir --timeout=1000 install --upgrade pip
RUN pip3 --no-cache-dir --timeout=1000 install wheel
RUN pip3 --no-cache-dir --timeout=1000 install pyyaml==5.3.1
RUN pip3 --no-cache-dir --timeout=1000 install \
        django==2.2.7 django-enumfields==1.0.0 \
        psycopg2-binary==2.8.4 pillow==6.2.1 imageio==2.6.1 \
        djangorestframework==3.11.0 pygments==2.4.2 \
        django-extensions==2.2.5 pygraphviz==1.5 \
        pyparsing==2.4.5 pydot==1.4.1 markdown==3.1.1 \
        hiredis==1.0.0 redis==3.3.11 \
        gunicorn==20.0.0 django_admin_json_editor==0.2.0 django-ltree==0.4 \
        requests==2.22.0 python-dateutil==2.8.1 ujson==1.35 slackclient==2.3.1 \
        google-auth==1.28.0 elasticsearch==7.1.0 progressbar2==3.47.0 \
        gevent==1.4.0 uritemplate==3.0.1 pylint pylint-django \
        django-cognito-jwt==0.0.3 boto3==1.17.84 \
        google-cloud-storage==1.37.1 datadog==0.41.0

# Get acme_tiny.py for certificate renewal
WORKDIR /
RUN wget https://raw.githubusercontent.com/diafygi/acme-tiny/4.1.0/acme_tiny.py 

# Install kubectl
RUN wget https://storage.googleapis.com/kubernetes-release/release/v1.16.9/bin/linux/amd64/kubectl
RUN chmod +x kubectl
RUN mv kubectl /usr/local/bin/.

# Install fork of openapi-core that works in DRF views
WORKDIR /working
RUN git clone https://github.com/jrtcppv/openapi-core.git
WORKDIR /working/openapi-core
RUN python3 setup.py install

# Install kubernetes client
WORKDIR /working
RUN git clone --branch release-10.0 --recursive https://github.com/kubernetes-client/python
WORKDIR /working/python
RUN python3 setup.py install

# Copy over the project
COPY . /tator_online
COPY doc/_build/html /tator_online/main/static/docs
WORKDIR /tator_online
RUN rm -rf helm

