# AhuraCloud Fine-Tuning — Axolotl training container
#
# Base: PyTorch 2.4 + CUDA 12.4 on Ubuntu 22.04. Axolotl 0.29.0 with
# Flash Attention, DeepSpeed, PEFT, TRL, bitsandbytes, Liger Kernel.
#
# Built and pushed to GHCR by .github/workflows/ft-axolotl-image.yml
# Pulled by the BullMQ ft-runner when provisioning a RunPod pod.
#
# Image size: ~22 GB (PyTorch CUDA base accounts for most of it). First
# build takes 25-40 min; subsequent builds with cached layers ~5-10 min.

FROM pytorch/pytorch:2.4.0-cuda12.4-cudnn9-devel

# ─── System ────────────────────────────────────────────────────────────
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget jq rclone openssl ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ─── Python deps ───────────────────────────────────────────────────────
# Pin versions to keep training reproducible across the fleet. Bump
# carefully — incompatibilities between axolotl/peft/trl/transformers
# can silently break LoRA training (extras get dropped, tokenizer
# templates shift).
RUN pip install --no-cache-dir --upgrade pip wheel setuptools

RUN pip install --no-cache-dir \
    "axolotl[deepspeed,flash-attn,liger]==0.29.0" \
    "transformers==4.50.0" \
    "accelerate==1.5.0" \
    "peft==0.13.0" \
    "trl==0.13.0" \
    "bitsandbytes==0.45.0" \
    "datasets==3.2.0" \
    "huggingface_hub[hf_transfer]==0.27.0" \
    "liger-kernel==0.5.0" \
    "requests==2.32.0"

# HuggingFace download speedup (rust-based, parallelized)
ENV HF_HUB_ENABLE_HF_TRANSFER=1
ENV WANDB_DISABLED=true
ENV TRANSFORMERS_NO_ADVISORY_WARNINGS=1
ENV TOKENIZERS_PARALLELISM=true

# ─── Container scripts ─────────────────────────────────────────────────
WORKDIR /workspace
RUN mkdir -p /workspace/data /workspace/output /workspace/cache

# Container's orchestration logic + axolotl config template + heartbeat
COPY train.sh /workspace/
COPY config-template.yaml /workspace/
COPY heartbeat.py /workspace/
COPY accelerate-config.yaml /workspace/
COPY shared/ /workspace/shared/

RUN chmod +x /workspace/train.sh /workspace/shared/*.sh

# ─── Entrypoint ────────────────────────────────────────────────────────
ENTRYPOINT ["/workspace/train.sh"]
