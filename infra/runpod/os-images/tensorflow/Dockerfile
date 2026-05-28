# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — TensorFlow 2.x.
# TensorFlow 2.16 with bundled CUDA (the `[and-cuda]` extra ships matching
# NVIDIA wheels), Python 3.11, JupyterLab, TensorBoard.
#
# Published as ghcr.io/cs2hvh/gpu-tensorflow. Build context = os-images/ root.
# NOTE: TF↔CUDA pinning is strict — confirm GPU is visible with a CI test
# build (tf.config.list_physical_devices('GPU')) before promoting to latest.

FROM nvidia/cuda:12.3.2-runtime-ubuntu22.04

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

# TensorFlow with self-contained CUDA wheels + notebook stack.
RUN python -m pip install \
        "tensorflow[and-cuda]==2.16.1" \
    && python -m pip install \
        jupyterlab tensorboard numpy pandas scipy scikit-learn matplotlib

WORKDIR /workspace

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

ENV SERVICE_CMD='exec jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root --ServerApp.root_dir=/workspace --ServerApp.token="${JUPYTER_TOKEN:-}"'

EXPOSE 22 8888 6006
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
