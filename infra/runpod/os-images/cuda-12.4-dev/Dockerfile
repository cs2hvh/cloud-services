# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — CUDA 12.4 toolkit (dev).
# Full CUDA toolkit incl. nvcc for compiling CUDA/C++ extensions, plus SSH.
# No ML framework — for users who build their own from a compiler base.
#
# Published as ghcr.io/cs2hvh/gpu-cuda-12.4-dev. Build context = os-images/ root.

FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssh-server \
        ca-certificates curl wget git vim tini \
        build-essential cmake ninja-build \
        python3 python3-pip python3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /workspace

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

# SSH only — toolkit image, no long-running service.
ENV SERVICE_CMD=""

EXPOSE 22
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
