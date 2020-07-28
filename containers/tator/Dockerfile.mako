<%!
  import multiArch
  import os
%>

% if multiArch.arch=="x86_64":
FROM ubuntu:18.04
MAINTAINER CVision AI <info@cvisionai.com>
# Install apt packages
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        python3 python3-pip libgraphviz-dev xdot \
        python3-setuptools python3-dev gcc libgdal-dev git vim curl libffi-dev \
        ffmpeg && rm -rf /var/lib/apt/lists
%else:
FROM ubuntu:19.04
MAINTAINER CVision AI <info@cvisionai.com>

% if multiArch.arch!=multiArch.host:
#copy over qemu for "cross-compiled" builds
COPY containers/qemu_support/qemu-aarch64-static /usr/bin
% endif

RUN chmod 1777 /tmp
# Install apt packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip libgraphviz-dev xdot \
        python3-setuptools python3-dev gcc libgdal-dev git vim curl libffi-dev \
        libssl-dev ffmpeg && \
        rm -rf /var/lib/apt/lists
% endif

# Install pip packages
RUN pip3 --no-cache-dir install wheel
RUN pip3 --no-cache-dir install pyyaml==5.3.1
RUN pip3 --no-cache-dir install \
        django==2.2.7 django-enumfields==1.0.0 channels==2.1.7 \
        psycopg2-binary==2.8.4 pillow==6.2.1 imageio==2.6.1 \
        djangorestframework==3.11.0 pygments==2.4.2 \
        django-extensions==2.2.5 pygraphviz==1.5 \
        pyparsing==2.4.5 pydot==1.4.1 markdown==3.1.1 \
        hiredis==1.0.0 channels_redis==2.4.0 redis==3.3.11 \
        daphne==2.2.5 gunicorn==20.0.0 django_admin_json_editor==0.2.0 django-ltree==0.4 \
        requests==2.22.0 python-dateutil==2.8.1 ujson==1.35 slackclient==2.3.1 \
        google-auth==1.6.3 elasticsearch==7.1.0 progressbar2==3.47.0 \
        gevent==1.4.0 uritemplate==3.0.1 pylint pylint-django

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

# For reference on building pip package by source:
#WORKDIR /working
#RUN git clone --branch v0.3 https://github.com/mariocesar/django-ltree.git
#WORKDIR /working/django-ltree
#RUN python3 setup.py install
#WORKDIR /

# Copy over the project
COPY . /tator_online
WORKDIR /tator_online
RUN rm -rf helm
