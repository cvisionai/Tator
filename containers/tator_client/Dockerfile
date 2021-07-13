FROM cvisionai/svt_encoder:v0.0.4 as builder
ENV LANG C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget unzip \
        && rm -rf /var/lib/apt/lists
RUN mkdir -p /opt/cvision
RUN wget http://zebulon.bok.net/Bento4/binaries/Bento4-SDK-1-6-0-632.x86_64-unknown-linux.zip
RUN unzip Bento4-SDK-1-6-0-632.x86_64-unknown-linux.zip
RUN cp Bento4-SDK-1-6-0-632.x86_64-unknown-linux/bin/mp4dump /opt/cvision/bin
RUN cp Bento4-SDK-1-6-0-632.x86_64-unknown-linux/bin/mp4info /opt/cvision/bin

FROM ubuntu:20.04 AS cvtranscoder
MAINTAINER CVision AI <info@cvisionai.com>
# Install apt packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip \
        python3-setuptools python3-dev gcc git vim curl unzip wget \
        && rm -rf /var/lib/apt/lists
COPY --from=builder /opt/cvision /opt/cvision
ENV PATH="/opt/cvision/bin/:$PATH"
RUN echo "/opt/cvision/lib" > /etc/ld.so.conf.d/cvision.conf
RUN ldconfig

# Install pip packages
RUN pip3 --no-cache-dir --timeout=1000 install wheel
RUN pip3 --no-cache-dir --timeout=1000 install pillow==6.2.1 imageio==2.6.1 progressbar2==3.47.0 boto3==1.17.84 pandas==1.1.0

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends fastjar libsm6 libxext6 libxrender-dev libx265-179 libx264-155 libpng16-16 libfreetype6 python3-opencv && rm -rf /var/lib/apt/lists

# Copy over scripts
COPY scripts/transcoder /scripts
COPY scripts/packages/tator-py/dist/*.whl /tmp

# Build tator-py
RUN pip3 install tmp/*.whl

WORKDIR /scripts
