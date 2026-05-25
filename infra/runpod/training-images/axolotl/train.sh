#!/usr/bin/env bash
# AhuraCloud Fine-Tuning — Axolotl container orchestration script.
#
# Lifecycle:
#   1. validate required env vars are set
#   2. start the heartbeat daemon (POSTs every 30s to ft-runner)
#   3. download dataset from R2/S3/HTTPS to local disk
#   4. validate dataset (JSONL parse + schema)
#   5. render axolotl config from hyperparams
#   6. launch training via accelerate
#   7. upload adapter to R2
#   8. run quality smoke tests (sample generations)
#   9. POST completion webhook to control plane (HMAC-signed)
#
# Required env vars (set by the ft-runner BullMQ worker when provisioning
# the RunPod pod):
#
#   JOB_ID              — uuid of inference.finetunes row
#   BASE_MODEL          — HF model id, e.g. "meta-llama/Llama-4-Scout-17B-16E-Instruct"
#   DATASET_URL         — s3://, r2://, or https:// URL to JSONL
#   HYPERPARAMS_JSON    — JSON string: {rank, alpha, lr, epochs, batch_size, ...}
#   METHOD              — "lora" | "qlora" | "full"
#   OUTPUT_R2_PREFIX    — r2://bucket/path/ where adapter is uploaded
#   WEBHOOK_URL         — internal control-plane endpoint
#   WEBHOOK_SECRET      — HMAC secret (shared with control plane)
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
#   HF_TOKEN            — for pulling gated bases (optional)

set -euo pipefail

# ─── Required env vars ─────────────────────────────────────────────────
: "${JOB_ID:?missing JOB_ID}"
: "${BASE_MODEL:?missing BASE_MODEL}"
: "${DATASET_URL:?missing DATASET_URL}"
: "${HYPERPARAMS_JSON:?missing HYPERPARAMS_JSON}"
: "${METHOD:=lora}"
: "${OUTPUT_R2_PREFIX:?missing OUTPUT_R2_PREFIX}"
: "${WEBHOOK_URL:?missing WEBHOOK_URL}"
: "${WEBHOOK_SECRET:?missing WEBHOOK_SECRET}"
: "${R2_ACCESS_KEY_ID:?missing R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?missing R2_SECRET_ACCESS_KEY}"
: "${R2_ENDPOINT:?missing R2_ENDPOINT}"

log() { echo "[$(date -Iseconds)] $*"; }

# ─── Helpers ───────────────────────────────────────────────────────────
post_webhook() {
    local payload="$1"
    local sig
    sig=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64 -w 0)
    curl -fsS --retry 5 --retry-delay 2 \
        -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "X-Ahura-Webhook-Signature: $sig" \
        -H "X-Ahura-Idempotency-Key: $JOB_ID" \
        -d "$payload" || log "WARN: webhook POST failed"
}

post_failure() {
    local reason="$1"
    local elapsed="${2:-0}"
    local payload
    payload=$(jq -nc \
        --arg job_id "$JOB_ID" \
        --arg reason "$reason" \
        --argjson elapsed "$elapsed" \
        '{job_id: $job_id, status: "failed", error: $reason, elapsed_seconds: $elapsed}')
    post_webhook "$payload"
    exit 1
}

# ─── 1. Start heartbeat daemon ─────────────────────────────────────────
log "Starting heartbeat daemon (30s interval)"
python /workspace/heartbeat.py &
HEARTBEAT_PID=$!
trap "kill $HEARTBEAT_PID 2>/dev/null || true" EXIT

# ─── 2. Download dataset ───────────────────────────────────────────────
log "Pulling dataset from $DATASET_URL"
if ! /workspace/shared/download-dataset.sh "$DATASET_URL" /workspace/data/train.jsonl; then
    post_failure "dataset_download_failed"
fi

DATASET_LINES=$(wc -l < /workspace/data/train.jsonl)
log "Dataset has $DATASET_LINES lines"

# ─── 3. Validate JSONL schema ──────────────────────────────────────────
log "Validating dataset schema"
if ! python -c "
import json, sys
errors = []
n = 0
with open('/workspace/data/train.jsonl') as f:
    for i, line in enumerate(f, 1):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
            if 'messages' not in d or not isinstance(d['messages'], list):
                errors.append(f'Line {i}: missing or non-array messages')
                if len(errors) > 3:
                    break
                continue
            n += 1
        except Exception as e:
            errors.append(f'Line {i}: {e}')
            if len(errors) > 3:
                break
if errors:
    print('SCHEMA_FAIL'); print('\\n'.join(errors)); sys.exit(2)
print(f'OK: {n} valid examples')
"; then
    post_failure "dataset_schema_invalid"
fi

# ─── 4. Render axolotl config ──────────────────────────────────────────
log "Rendering axolotl config for $METHOD"
python << 'PYEOF'
import json
import os
from string import Template

hp = json.loads(os.environ['HYPERPARAMS_JSON'])
method = os.environ.get('METHOD', 'lora')
base = os.environ['BASE_MODEL']

# Pick chat template based on the base model family.
# Wrong template = silently broken training, so be explicit.
def chat_template(model_id: str) -> str:
    mid = model_id.lower()
    if 'llama-4' in mid or 'llama-3' in mid or 'llama-2' in mid:
        return 'llama3'
    if 'qwen' in mid:
        return 'qwen'
    if 'gemma' in mid:
        return 'gemma'
    if 'mistral' in mid or 'mixtral' in mid:
        return 'mistral'
    if 'deepseek' in mid:
        return 'chatml'
    if 'phi' in mid:
        return 'chatml'
    return 'chatml'  # safe default

with open('/workspace/config-template.yaml') as f:
    tmpl = Template(f.read())

cfg = tmpl.substitute(
    BASE_MODEL=base,
    DATASET_PATH='/workspace/data/train.jsonl',
    OUTPUT_DIR='/workspace/output',
    CHAT_TEMPLATE=chat_template(base),
    LOAD_4BIT='true' if method == 'qlora' else 'false',
    ADAPTER='lora' if method in ('lora', 'qlora') else '',
    LORA_R=hp.get('rank', 16),
    LORA_ALPHA=hp.get('alpha', 32),
    LR=hp.get('lr', 0.0002),
    EPOCHS=hp.get('epochs', 3),
    BATCH_SIZE=hp.get('batch_size', 4),
    GRAD_ACCUM=hp.get('gradient_accumulation_steps', 4),
    SEQ_LEN=hp.get('max_seq_length', 4096),
    WARMUP=hp.get('warmup_steps', 100),
)

with open('/workspace/config.yaml', 'w') as f:
    f.write(cfg)

print('--- axolotl config ---')
print(cfg)
print('---')
PYEOF

# ─── 5. Train ──────────────────────────────────────────────────────────
START_TS=$(date +%s)
log "Starting training (this is the long part)"

if ! accelerate launch \
    --config_file /workspace/accelerate-config.yaml \
    -m axolotl.cli.train /workspace/config.yaml 2>&1 | tee /workspace/training.log; then
    ELAPSED=$(($(date +%s) - START_TS))
    log "Training process exited non-zero after ${ELAPSED}s"
    # Capture the tail of accelerate's output so the operator sees the real
    # error in the dashboard instead of a useless "training_crashed" string.
    # 2000 chars covers most Python tracebacks; the DB column truncates to
    # 500 in markFailedIfStillRunning but the webhook receiver gets the full
    # text (Phase 7: also upload training.log to R2 for full inspection).
    LOG_TAIL=$(tail -n 60 /workspace/training.log 2>/dev/null | tail -c 2000)
    post_failure "training_crashed: ${LOG_TAIL}" "$ELAPSED"
fi

ELAPSED=$(($(date +%s) - START_TS))
log "Training finished in ${ELAPSED}s"

# ─── 6. Upload adapter to R2 ───────────────────────────────────────────
log "Uploading adapter to $OUTPUT_R2_PREFIX"
if ! /workspace/shared/upload-adapter.sh /workspace/output "$OUTPUT_R2_PREFIX"; then
    post_failure "adapter_upload_failed" "$ELAPSED"
fi

# ─── 7. Quality smoke test ─────────────────────────────────────────────
log "Running sample generations for smoke test"
SAMPLE_OUTPUT=$(python << 'PYEOF' || echo '[]'
import json
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel
import os

base = os.environ['BASE_MODEL']
tok = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
m = AutoModelForCausalLM.from_pretrained(
    base, torch_dtype=torch.bfloat16, device_map='auto', trust_remote_code=True
)
try:
    m = PeftModel.from_pretrained(m, '/workspace/output')
except Exception as e:
    print(json.dumps([{'error': f'adapter_load_failed: {e}'}]))
    exit()

prompts = [
    'Hello, how are you?',
    'Explain in one sentence: what is gradient descent?',
]
samples = []
for p in prompts:
    inp = tok(p, return_tensors='pt').to('cuda')
    with torch.no_grad():
        out = m.generate(**inp, max_new_tokens=40, do_sample=False, pad_token_id=tok.eos_token_id)
    samples.append({
        'prompt': p,
        'output': tok.decode(out[0][inp['input_ids'].shape[1]:], skip_special_tokens=True),
    })
print(json.dumps(samples))
PYEOF
)

# Read final loss from axolotl's trainer_state
FINAL_LOSS=$(python << 'PYEOF' || echo 0
import json, glob
states = sorted(glob.glob('/workspace/output/checkpoint-*/trainer_state.json'))
if not states:
    print(0); exit()
state = json.load(open(states[-1]))
losses = [x['loss'] for x in state.get('log_history', []) if 'loss' in x]
print(losses[-1] if losses else 0)
PYEOF
)

log "Final training loss: $FINAL_LOSS"

# ─── 8. Post completion webhook ────────────────────────────────────────
log "Posting completion webhook"
PAYLOAD=$(jq -nc \
    --arg job_id "$JOB_ID" \
    --arg status "completed" \
    --arg adapter "$OUTPUT_R2_PREFIX" \
    --argjson elapsed "$ELAPSED" \
    --argjson final_loss "$FINAL_LOSS" \
    --argjson samples "$SAMPLE_OUTPUT" \
    '{
        job_id: $job_id,
        status: $status,
        adapter_url: $adapter,
        elapsed_seconds: $elapsed,
        final_loss: $final_loss,
        sample_outputs: $samples
    }')
post_webhook "$PAYLOAD"

log "Done"
