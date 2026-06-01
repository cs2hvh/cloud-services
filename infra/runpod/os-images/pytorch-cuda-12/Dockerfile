# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — PyTorch + CUDA 12.1.
# PyTorch 2.x (cu121), Python 3.11, JupyterLab, common ML packages.
#
# Published as ghcr.io/cs2hvh/gpu-pytorch-cuda-12. Build context = os-images/ root.
# JupyterLab serves on :8888; SSH on :22. Set JUPYTER_TOKEN at pod create to
# password-protect the notebook (recommended — the pod's web port is reachable
# over the internet).

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

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

# PyTorch (CUDA 12.1 wheels) + a common ML/notebook stack.
RUN python -m pip install \
        torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121 \
    && python -m pip install \
        jupyterlab numpy pandas scipy scikit-learn matplotlib \
        transformers datasets accelerate huggingface_hub

WORKDIR /workspace

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

# JupyterLab. Token is empty unless JUPYTER_TOKEN is injected at pod create.
ENV SERVICE_CMD='exec jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root --ServerApp.root_dir=/workspace --ServerApp.token="${JUPYTER_TOKEN:-}"'

EXPOSE 22 8888
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
