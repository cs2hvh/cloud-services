#!/usr/bin/env bash
# vLLM serving entrypoint.
#
# Required env (set by the runner at endpoint create time):
#   BASE_MODEL           — HuggingFace base model id, e.g. "microsoft/phi-4"
#   ADAPTER_R2_URL       — r2://bucket/path/ to the LoRA adapter directory
#   R2_ACCESS_KEY_ID     — for adapter download
#   R2_SECRET_ACCESS_KEY — for adapter download
#   R2_ENDPOINT          — e.g. https://<accountid>.r2.cloudflarestorage.com
#
# Optional env:
#   HF_TOKEN             — required for gated bases (Llama, Gemma)
#   MAX_MODEL_LEN        — vllm --max-model-len override (defaults to model default)
#   GPU_MEMORY_UTILIZATION — defaults to 0.9
#
# vLLM's openai-server then exposes /v1/chat/completions etc. on port 8000.
# The provider's serverless layer wraps this and adds auth + autoscale.

set -euo pipefail

log() { echo "[$(date -Iseconds)] $*"; }

: "${BASE_MODEL:?missing BASE_MODEL}"
: "${ADAPTER_R2_URL:?missing ADAPTER_R2_URL}"
: "${R2_ACCESS_KEY_ID:?missing R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?missing R2_SECRET_ACCESS_KEY}"
: "${R2_ENDPOINT:?missing R2_ENDPOINT}"

# ─── 1. Download adapter from R2 ──────────────────────────────────────
log "Downloading adapter from $ADAPTER_R2_URL"

SCHEME="${ADAPTER_R2_URL%%://*}"
REST="${ADAPTER_R2_URL#*://}"
BUCKET="${REST%%/*}"
PREFIX="${REST#*/}"
# Strip trailing slash from prefix
PREFIX="${PREFIX%/}"

cat > /tmp/rclone.conf <<EOF
[remote]
type = s3
provider = ${SCHEME^^}
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = ${R2_ENDPOINT}
acl = private
EOF

rclone --config /tmp/rclone.conf copy "remote:$BUCKET/$PREFIX" /workspace/adapter --retries 3

# Sanity-check: adapter_config.json + adapter_model.safetensors must exist
if [ ! -s /workspace/adapter/adapter_config.json ]; then
    echo "ERROR: adapter_config.json missing after R2 sync" >&2
    ls -la /workspace/adapter || true
    exit 1
fi
if ! ls /workspace/adapter/adapter_model.* >/dev/null 2>&1; then
    echo "ERROR: adapter_model.safetensors / .bin missing after R2 sync" >&2
    ls -la /workspace/adapter || true
    exit 1
fi

log "Adapter ready: $(ls -1 /workspace/adapter | tr '\n' ' ')"

# ─── 2. Launch vLLM with LoRA enabled ────────────────────────────────
log "Starting vLLM with base=$BASE_MODEL + LoRA adapter"

# Default knobs (overridable via env)
MAX_LEN_ARG=""
if [ -n "${MAX_MODEL_LEN:-}" ]; then
    MAX_LEN_ARG="--max-model-len $MAX_MODEL_LEN"
fi

GPU_MEM="${GPU_MEMORY_UTILIZATION:-0.9}"

# --enable-lora                : turn on LoRA support
# --max-loras 1                : we serve exactly one adapter per pod
# --max-lora-rank 64           : covers all our supported rank values (1-256
#                                in our zod schema, but real-world LoRA
#                                ranks are 8/16/32/64 — bump if a user
#                                trains with higher rank than 64)
# --lora-modules adapter=/path : name=path mapping; "adapter" is the
#                                served-model alias clients will reference
# --served-model-name <id>     : what `model` field clients pass in their
#                                /v1/chat/completions request — must match
#                                the catalog's model_id so the gateway can
#                                forward without rewriting

exec python -m vllm.entrypoints.openai.api_server \
    --model "$BASE_MODEL" \
    --enable-lora \
    --max-loras 1 \
    --max-lora-rank 64 \
    --lora-modules "adapter=/workspace/adapter" \
    --served-model-name "${SERVED_MODEL_NAME:-adapter}" \
    --host 0.0.0.0 \
    --port 8000 \
    --gpu-memory-utilization "$GPU_MEM" \
    --dtype bfloat16 \
    $MAX_LEN_ARG
