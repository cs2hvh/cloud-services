# AhuraCloud Fine-Tuning — Axolotl training container
#
# WE DO NOT BUILD AXOLOTL FROM SCRATCH. Lesson learned 2026-05-25 after
# half a day of pip-pin trial-and-error: the recommended approach is to
# layer on top of axolotl's official prebuilt image which already pins
# a tested, mutually-compatible version set:
#
#   axolotl 0.16+ + transformers 5.5+ + peft 0.19+ + accelerate 1.13+
#   trl 0.29+ + bitsandbytes 0.49+ + datasets 4.5+
#   torch 2.9.1 + CUDA 12.8 + Python 3.11
#   flash-attn + liger-kernel + deepspeed + xformers (all prebuilt)
#
# Why this matters: pinning transformers/peft/accelerate yourself, then
# `pip install axolotl[deepspeed]`, lets axolotl's own hard pins
# (transformers==5.5.0 etc.) override yours and pull in transitive
# combinations that ship the BloomPreTrainedModel import crash. Don't.
#
# Available tags: https://hub.docker.com/r/axolotlai/axolotl/tags
# Use `main-latest` while iterating; pin to a dated tag like
# `main-20260525-py3.11-cu128-2.9.1` for production reproducibility.

# IMPORTANT: do NOT use :main-latest — that tag stopped updating around
# 2026-05-21 while the team's daily builds continue under dated tags like
# main-YYYYMMDD-py3.11-cu128-2.9.1.
#
# Confirmed 2026-05-25: even the latest dated tag ships peft <0.18 which
# has the broken `from transformers import BloomPreTrainedModel` eager
# import. We patch it ourselves in the next layer.
#
# When bumping: check https://hub.docker.com/r/axolotlai/axolotl/tags
# and pick the most recent main-YYYYMMDD-py3.11-cu128-2.9.1.
FROM axolotlai/axolotl:main-20260525-py3.11-cu128-2.9.1

# ─── Surgical peft override ──────────────────────────────────────────
# Forces peft 0.19+ where the Bloom eager-import is gone. Pip's resolver
# will refuse if axolotl pins peft incompatibly — in that case bump the
# upper bound or switch to an even newer axolotl base. As of axolotl
# 0.16.1 (what this image ships) the requirements.txt says
# `peft>=0.19.1,<0.20.0` — so this upgrade is in-spec, the base just
# didn't actually install the pinned version (bug in upstream image
# build).
RUN pip install --no-cache-dir --upgrade "peft>=0.19,<0.21" \
    && python -c "import peft; print(f'peft={peft.__version__}'); from peft import PeftModel" \
    && echo "peft sanity check passed"

# ─── System tools train.sh + download-dataset.sh need ─────────────────
# Axolotl's image is Debian-based. We add: rclone (R2/S3 dataset pulls),
# jq (webhook payload construction), curl/openssl/wget (HMAC signing,
# HTTP webhook POSTs). Most are usually present but we pin them so this
# doesn't break if upstream slims the base image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    rclone jq curl openssl wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Runtime tunables ────────────────────────────────────────────────
# HF_HUB_ENABLE_HF_TRANSFER: rust-based parallel downloader, 5-10× faster
#   on the 14B-235B base weight pulls that dominate cold-start time.
# WANDB_DISABLED: we don't have wandb wired in v1; suppress noisy login warnings.
# TOKENIZERS_PARALLELISM: small SFT-dataset prep speedup.
# AXOLOTL_PROMOTE_FLOAT_TO_BFLOAT16: 0.16+ recommended runtime default
#   for mixed-precision LoRA — avoids a class of fp16 NaN issues on
#   Ampere/Hopper.
ENV HF_HUB_ENABLE_HF_TRANSFER=1 \
    WANDB_DISABLED=true \
    TRANSFORMERS_NO_ADVISORY_WARNINGS=1 \
    TOKENIZERS_PARALLELISM=true \
    AXOLOTL_PROMOTE_FLOAT_TO_BFLOAT16=1

# ─── Container orchestration scripts ─────────────────────────────────
WORKDIR /workspace
RUN mkdir -p /workspace/data /workspace/output /workspace/cache

COPY train.sh /workspace/
COPY config-template.yaml /workspace/
COPY heartbeat.py /workspace/
COPY accelerate-config.yaml /workspace/
COPY shared/ /workspace/shared/

RUN chmod +x /workspace/train.sh /workspace/shared/*.sh

# ─── Entrypoint ──────────────────────────────────────────────────────
ENTRYPOINT ["/workspace/train.sh"]
