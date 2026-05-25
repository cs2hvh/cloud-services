#!/usr/bin/env bash
# vLLM serving entrypoint. Two adapter source modes:
#
# 1) DOWNLOAD URL (preferred, used by dashboard's self-serve docker command):
#      ADAPTER_DOWNLOAD_URL  — presigned https URL to adapter.tar.gz
#    No credentials needed. URL typically expires in 1 hour but only needs
#    to be valid at container startup; once the tar is unpacked locally,
#    the URL can expire.
#
# 2) DIRECT R2 (operator/ops use only — full bucket access required):
#      ADAPTER_R2_URL        — r2://bucket/path/ to loose adapter files
#      R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
#
# Required regardless of source:
#   BASE_MODEL              — HuggingFace base model id, e.g. "microsoft/phi-4"
#
# Optional env:
#   HF_TOKEN                — required for gated bases (Llama, Gemma)
#   MAX_MODEL_LEN           — vllm --max-model-len override
#   GPU_MEMORY_UTILIZATION  — defaults to 0.9
#   SERVED_MODEL_NAME       — defaults to "adapter"
#
# vLLM's openai-server exposes /v1/chat/completions etc. on port 8000.

set -euo pipefail

log() { echo "[$(date -Iseconds)] $*"; }

: "${BASE_MODEL:?missing BASE_MODEL}"

# ─── 1. Download adapter ─────────────────────────────────────────────
if [ -n "${ADAPTER_DOWNLOAD_URL:-}" ]; then
    # Preferred: presigned URL to tar.gz. No credentials anywhere.
    log "Downloading adapter from presigned URL (tar.gz)"
    curl -fL --retry 3 --retry-delay 2 "$ADAPTER_DOWNLOAD_URL" -o /tmp/adapter.tar.gz
    log "Adapter tarball: $(du -h /tmp/adapter.tar.gz | cut -f1)"
    mkdir -p /workspace/adapter
    tar -xzf /tmp/adapter.tar.gz -C /workspace/adapter
    rm /tmp/adapter.tar.gz
elif [ -n "${ADAPTER_R2_URL:-}" ]; then
    # Fallback: direct R2 access with credentials. Operator path only.
    : "${R2_ACCESS_KEY_ID:?missing R2_ACCESS_KEY_ID (or set ADAPTER_DOWNLOAD_URL instead)}"
    : "${R2_SECRET_ACCESS_KEY:?missing R2_SECRET_ACCESS_KEY}"
    : "${R2_ENDPOINT:?missing R2_ENDPOINT}"
    log "Downloading adapter from $ADAPTER_R2_URL via S3 API"
    SCHEME="${ADAPTER_R2_URL%%://*}"
    REST="${ADAPTER_R2_URL#*://}"
    BUCKET="${REST%%/*}"
    PREFIX="${REST#*/}"
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
else
    echo "ERROR: must set either ADAPTER_DOWNLOAD_URL (preferred) or ADAPTER_R2_URL + R2 creds" >&2
    exit 1
fi

# Sanity-check: adapter_config.json + adapter weights must exist
if [ ! -s /workspace/adapter/adapter_config.json ]; then
    echo "ERROR: adapter_config.json missing after download" >&2
    ls -la /workspace/adapter || true
    exit 1
fi
if ! ls /workspace/adapter/adapter_model.* >/dev/null 2>&1; then
    echo "ERROR: adapter_model.safetensors / .bin missing after download" >&2
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
