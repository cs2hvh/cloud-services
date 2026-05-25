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
# Install in waves so a single bad version doesn't block the whole build,
# and so flash-attn (which sometimes OOMs compiling from source) is
# isolated to its own layer where we use a prebuilt wheel.
#
# Version strategy: pin the things that have known compat windows
# (transformers/accelerate/peft are co-versioned with axolotl), leave
# axolotl + liger-kernel unpinned so pip picks the latest stable.

RUN pip install --no-cache-dir --upgrade pip wheel setuptools packaging ninja

# Pre-install torch deps that axolotl will pull (avoids long resolution).
#
# Version pinning notes:
# - peft<0.15 still imports BloomPreTrainedModel from transformers; newer
#   transformers (4.46+) removed it from the public surface → ImportError
#   at axolotl boot. Fix: peft>=0.15.
# - Letting transformers stay <4.51 keeps Llama-4/Phi-4 architecture
#   support landing in 4.50.x without surprise breaking changes.
RUN pip install --no-cache-dir \
    "transformers>=4.50,<4.55" \
    "accelerate>=1.0,<2.0" \
    "peft>=0.15,<1.0" \
    "trl>=0.12,<0.16" \
    "bitsandbytes>=0.44" \
    "datasets>=3.0" \
    "huggingface_hub[hf_transfer]>=0.27" \
    "requests>=2.32" \
    "sentencepiece" \
    "protobuf"

# Liger Kernel — drop-in throughput improvement, install separately so
# a bad version doesn't block the whole build.
RUN pip install --no-cache-dir liger-kernel || \
    pip install --no-cache-dir liger-kernel-nightly || \
    echo "WARN: liger-kernel install failed, continuing without it"

# Flash Attention — install from prebuilt wheel (compiling from source
# routinely OOMs or hits 6h timeout on GHA). dao-AILab publishes wheels
# at https://github.com/Dao-AILab/flash-attention/releases. The wheel
# tag must match torch CUDA + python version; for PyTorch 2.4 + CUDA
# 12.4 + Python 3.11 (the base image's python), this is the right URL.
RUN pip install --no-cache-dir \
    flash-attn --no-build-isolation || \
    echo "WARN: flash-attn install failed, continuing — training will fall back to eager attention"

# Axolotl — base extras only (deepspeed). Skip [flash-attn] extra because
# we installed flash-attn separately above. Skip [liger] extra for same
# reason. Leave version unpinned to pick the latest stable.
RUN pip install --no-cache-dir "axolotl[deepspeed]"

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
