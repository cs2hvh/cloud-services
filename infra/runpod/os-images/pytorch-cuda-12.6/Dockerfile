# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — PyTorch 2.7 + CUDA 12.6.
# Newer PyTorch line (RTX 5090 / Blackwell capable via cu126), Python 3.11,
# JupyterLab, TensorBoard, common ML packages.
#
# Published as ghcr.io/cs2hvh/gpu-pytorch-cuda-12.6. Build context = os-images/ root.
# Set JUPYTER_TOKEN at pod create to protect the notebook.

FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssh-server \
        ca-certificates curl wget git vim tini \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3.11-dev python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
    && python -m pip install --upgrade pip

# PyTorch 2.7 (CUDA 12.6 wheels) + common ML/notebook stack.
RUN python -m pip install \
        torch==2.7.0 torchvision==0.22.0 --index-url https://download.pytorch.org/whl/cu126 \
    && python -m pip install \
        jupyterlab tensorboard numpy pandas scipy scikit-learn matplotlib \
        transformers datasets accelerate huggingface_hub

WORKDIR /workspace

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

ENV SERVICE_CMD='exec jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root --ServerApp.root_dir=/workspace --ServerApp.token="${JUPYTER_TOKEN:-}"'

EXPOSE 22 8888 6006
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
