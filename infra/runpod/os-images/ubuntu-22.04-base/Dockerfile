# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — Ubuntu 22.04 base.
# Minimal CUDA-capable Ubuntu with SSH. Customers build their own stack on top.
#
# Published as ghcr.io/cs2hvh/gpu-ubuntu-22.04-base by
# .github/workflows/gpu-os-images.yml. Build context is the os-images/ root
# so the shared bootstrap can be COPY'd in.

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssh-server \
        ca-certificates curl wget git vim tini \
        python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /workspace

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

# SSH only — no long-running service for the base image.
ENV SERVICE_CMD=""

EXPOSE 22
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
