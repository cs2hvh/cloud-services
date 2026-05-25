# AhuraCloud Fine-Tuning — Axolotl training container
#
# Why -cloud-uv: axolotl ships THREE image families:
#   axolotlai/axolotl              — conda env at /root/miniconda3
#   axolotlai/axolotl-cloud        — conda + Jupyter/SSH for RunPod
#   axolotlai/axolotl-cloud-uv     — uv-managed venv at /workspace/axolotl/.venv
#
# The conda variants are getting deprecated per axolotl docs, and worse:
# any `pip install` you layer on top runs against the conda site-packages
# but pip's resolver re-walks transitive deps and quietly reinstalls
# transformers / huggingface_hub / accelerate. That breaks the precompiled
# flash-attn / triton wheels at the torch C-extension ABI boundary. The
# resulting import error gets wrapped by transformers' lazy loader as
# "ModuleNotFoundError: Could not import module 'BloomPreTrainedModel'"
# — completely misleading; the actual failure is torch ABI, not Bloom.
#
# -uv keeps deps in an isolated uv venv. Even if we add packages with
# `uv pip install --no-deps`, the precompiled C-extensions stay aligned.
#
# Available tags: https://hub.docker.com/r/axolotlai/axolotl-cloud-uv/tags
# Use the latest main-YYYYMMDD-py3.11-cu128-2.9.1; do NOT use :main-latest
# (that tag stopped updating 2026-05-21).

# Note: axolotl-cloud-uv has NO dated tags published; only main-latest and
# unversioned py-cuda-torch combos. Last rebuild was 2026-05-22. We use the
# specific py3.11/cu128/2.9.1 combo (matches our RunPod GPU compatibility).
FROM axolotlai/axolotl-cloud-uv:main-py3.11-cu128-2.9.1

# ─── System tools for train.sh + download-dataset.sh ─────────────────
# rclone (R2/S3 dataset pulls), jq (webhook payloads), curl/openssl/wget
# (HMAC + HTTP). Apt-install is fine — these are system packages, not
# Python deps, so they don't touch axolotl's uv venv.
RUN apt-get update && apt-get install -y --no-install-recommends \
    rclone jq curl openssl wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Runtime tunables ────────────────────────────────────────────────
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

# ─── Build-time sanity check ─────────────────────────────────────────
# Catches torch C-extension / peft / axolotl import problems at build
# time instead of 11s into every training pod. If this fails, the build
# fails — much faster feedback loop than discovering the issue on RunPod.
RUN python -c "\
import torch; print('torch', torch.__version__); \
import transformers; print('transformers', transformers.__version__); \
import peft; from peft import PeftModel, LoraConfig; print('peft', peft.__version__); \
import axolotl; print('axolotl import OK')"

# ─── Entrypoint ──────────────────────────────────────────────────────
ENTRYPOINT ["/workspace/train.sh"]
