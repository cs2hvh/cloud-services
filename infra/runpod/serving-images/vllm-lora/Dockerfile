# syntax=docker/dockerfile:1.7
#
# AhuraCloud Fine-Tune Serving image — vLLM with LoRA support.
#
# What this serves: ONE fine-tuned LoRA adapter on top of ONE base model,
# exposed as OpenAI-compatible /v1/chat/completions. Per-deployment pod;
# scales to zero between requests via the provider's serverless runtime.
#
# Architecture: vLLM's official openai-server image has LoRA built in via
# the `--enable-lora --lora-modules` flags. We layer on our own entry
# script that:
#   1. Downloads the base model from HuggingFace (env: BASE_MODEL,
#      optional HF_TOKEN for gated bases)
#   2. Downloads the adapter from R2 (env: ADAPTER_R2_URL, R2 creds)
#   3. Launches vllm serve with the adapter mounted
#
# Build: triggers via .github/workflows/ft-serving-image.yml whenever
# files under infra/runpod/serving-images/vllm-lora/** change.

FROM vllm/vllm-openai:v0.7.3

# ─── System tools the entry script needs ─────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    rclone curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── HF download speedup ──────────────────────────────────────────────
ENV HF_HUB_ENABLE_HF_TRANSFER=1 \
    HF_HOME=/workspace/.cache/huggingface

# ─── Entry script ─────────────────────────────────────────────────────
WORKDIR /workspace
RUN mkdir -p /workspace/base /workspace/adapter /workspace/.cache

COPY entrypoint.sh /workspace/entrypoint.sh
RUN chmod +x /workspace/entrypoint.sh

# The vllm base image's ENTRYPOINT is the openai-server. We override with
# our entry script which prepares model+adapter then exec's vllm.
ENTRYPOINT ["/workspace/entrypoint.sh"]
