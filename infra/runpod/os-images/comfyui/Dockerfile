# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — ComfyUI.
# ComfyUI node-graph image-generation UI on :8188, plus SSH on :22.
#
# Published as ghcr.io/cs2hvh/gpu-comfyui. Build context = os-images/ root.
# COMFYUI_REF pins the ComfyUI git ref at build time.

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    PIP_NO_CACHE_DIR=1

ARG COMFYUI_REF=master

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssh-server \
        ca-certificates curl wget git vim tini \
        libgl1 libglib2.0-0 \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3.11-dev python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
    && python -m pip install --upgrade pip

# Clone ComfyUI and install Torch (cu121) + its requirements.
RUN git clone --depth 1 --branch "${COMFYUI_REF}" https://github.com/comfyanonymous/ComfyUI /opt/ComfyUI \
    && python -m pip install torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121 \
    && python -m pip install -r /opt/ComfyUI/requirements.txt

# Models/outputs live under /workspace so a mounted volume persists them.
WORKDIR /workspace

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

ENV SERVICE_CMD='cd /opt/ComfyUI && exec python main.py --listen 0.0.0.0 --port 8188 --output-directory /workspace/output'

EXPOSE 22 8188
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
