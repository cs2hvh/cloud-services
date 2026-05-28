# syntax=docker/dockerfile:1.7
#
# AhuraCloud GPU image — vLLM inference.
# vLLM with an OpenAI-compatible HTTP API on :8000, plus SSH on :22.
#
# Published as ghcr.io/cs2hvh/gpu-vllm. Build context = os-images/ root.
#
# Behaviour: set MODEL (a HuggingFace id) at pod create to auto-serve it on
# boot. Gated bases (Llama, Gemma) also need HF_TOKEN. With no MODEL the pod
# comes up on SSH only so the customer can launch vllm by hand.

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    PIP_NO_CACHE_DIR=1 \
    HF_HUB_ENABLE_HF_TRANSFER=1 \
    HF_HOME=/workspace/.cache/huggingface

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

# vllm pulls a matching torch build as a dependency.
RUN python -m pip install vllm==0.7.3 hf_transfer

WORKDIR /workspace
RUN mkdir -p /workspace/.cache

COPY _shared/start.sh /usr/local/bin/ahura-start
RUN chmod +x /usr/local/bin/ahura-start

# Serve MODEL on :8000 if provided; otherwise stay on SSH only.
ENV SERVICE_CMD='if [ -n "${MODEL:-}" ]; then exec python -m vllm.entrypoints.openai.api_server --model "$MODEL" --host 0.0.0.0 --port 8000 --gpu-memory-utilization "${GPU_MEMORY_UTILIZATION:-0.9}" ${MAX_MODEL_LEN:+--max-model-len $MAX_MODEL_LEN}; else echo "Set MODEL env to auto-serve, or launch vllm manually."; exec sleep infinity; fi'

EXPOSE 22 8000
ENTRYPOINT ["tini", "--", "/usr/local/bin/ahura-start"]
