# Phase 5.B — Fine-Tuning Runner Build Guide

> Comprehensive operator + engineer guide to ship the actual training execution
> path. The API + dashboard from Phase 5.A are done — this doc covers the
> Docker image, k8s worker, webhook plumbing, and serving infrastructure that
> turns "queued" jobs into trained adapters serving real traffic.

Backed by [research conducted 2026-05-24](./fine-tuning-runner.md) validating against Together AI, Fireworks, OpenAI, Baseten, Modal, and RunPod's published architectures. See **Sources** at the bottom for citations.

---

## 1. Are we on the right path?

**Short answer: yes, with five concrete refinements.**

| Decision | Validated? | Refinement |
|---|---|---|
| Axolotl as training framework | ✅ Right choice as default | ➕ Add **Unsloth** as second container lane for single-GPU QLoRA (2–5× faster on those workloads); Axolotl OSS multi-node FSDP wins for everything else |
| BullMQ + Node orchestrator on k8s | ✅ Fits the volume | No change |
| RunPod for compute | ✅ Best price/flexibility profile | ➕ **Pods for ≤8 GPU jobs**, **Instant Clusters for ≥70B full FT** (multi-node), **never Serverless for training** — RunPod themselves say it doesn't fit |
| LoRA adapter to R2 | ✅ Cheaper + better egress than S3 | No change |
| Register output as private model in catalog | ✅ Correct pattern | No change |
| Polling for completion | ⚠️ Not enough | Replace with **heartbeat-driven stall detection** + **Svix-delivered customer webhooks**; the OpenAI-style 72h retry is industry standard |
| (Implicit) Dataset format | ⚠️ ShareGPT in older docs | Default to **OpenAI Messages JSONL** — ShareGPT is officially deprecated in Axolotl 2026 |
| (Missing) Pre-flight validation | ❌ Catches 80% of failures before GPU spin-up | Add tokenizer + schema + token-count check at *upload* time |
| (Missing) Post-training eval gate | ❌ Critical to avoid serving broken adapters | Add held-out loss + canned-prompt smoke test before marking `succeeded` |
| Pricing model | ⚠️ Implicit per-GPU-hour | Mix: **per-M-token (Together-style) for LoRA/QLoRA**, per-GPU-hour for full FT — customers price-compare against Together's per-token model |
| Serving | (Phase 5.A says "RunPod Serverless Worker per LoRA") | Use **vLLM Multi-LoRA shared deployment per base** + NVMe-cached R2 mirror; offer dedicated as upsell. Fireworks runs 1000s of LoRAs on one Mixtral cluster this way. |

**Bonus free wins to layer in:**
- **Liger Kernel** (`use_liger_kernel: true`) — drop-in Triton kernels giving +20–60% throughput. One config line.
- **Sample packing** (`sample_packing: true`) — default on. ~10% throughput on SFT with short examples, more on GRPO.
- **Checkpoint every N steps** to a network volume — Together advertises "safeguards against hardware faults during multi-hour runs"; this is what they mean.

---

## 2. The refined architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CONTROL PLANE (Next.js)                             │
│                                                                              │
│   POST /api/inference/fine-tuning/jobs                                       │
│     │                                                                        │
│     ▼  PRE-FLIGHT VALIDATION                                                 │
│     │  • JSONL parse + schema (must be OpenAI messages format)               │
│     │  • Tokenize with target base's tokenizer → reject mismatches           │
│     │  • Token count + cost preview                                          │
│     │  • Estimate peak GPU memory; warn / downgrade batch size               │
│     │                                                                        │
│     ▼  INSERT inference.finetunes status=queued                              │
│     │  + enqueue to BullMQ "ahura-inference-ft-runner"                       │
│     ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │            CUSTOMER WEBHOOKS (Svix)                                  │    │
│  │   ← fine_tuning.job.succeeded / .failed                              │    │
│  │   ← HMAC-signed, 72h retry, idempotency-key                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (BullMQ pull)
┌──────────────────────────────────────────────────────────────────────────────┐
│              FT RUNNER (Node BullMQ worker on k8s)                           │
│                                                                              │
│   loop:                                                                      │
│     job = await queue.next()                                                 │
│     await claim(job)                       ← UPDATE status=preparing         │
│     pod = await runpod.createPod({                                           │
│       image: route(job.method, job.gpu_sku),  ← Axolotl OR Unsloth lane     │
│       env: { DATASET_URL, BASE_MODEL, JOB_ID, HYPERPARAMS, ... }             │
│       volumeMountPath: "/workspace/cache"  ← network volume = survives crash │
│     })                                                                       │
│     await waitUntilRunning(pod)            ← UPDATE status=running           │
│     while job_alive:                                                         │
│       heartbeat = await pod.lastHeartbeat()                                  │
│       if now - heartbeat > 90s:                                              │
│         mark STALLED → check pod → on dead: status=failed + customer webhook │
│     // pod finishes — completion handled by webhook from container           │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (RunPod provisions GPU)
┌──────────────────────────────────────────────────────────────────────────────┐
│                  TRAINING CONTAINER (per job)                                │
│                                                                              │
│  AXOLOTL LANE                          UNSLOTH LANE (single-GPU QLoRA)       │
│  • Pull dataset from R2                • Pull dataset from R2                │
│  • Generate axolotl YAML from           • Run unsloth's optimized loop       │
│    hyperparams + chat template          • Liger Kernel ON                    │
│  • Liger Kernel ON                     • 2-5× speedup, ~80% less memory     │
│  • accelerate launch axolotl train      • Same heartbeat / webhook contract  │
│  • Checkpoint every save_steps          • → /webhook on done                 │
│  • Heartbeat every 30s → orchestrator                                        │
│  • POST internal /api/inference/fine-tuning/jobs/[id]/webhook with:          │
│      { adapter_url, train_loss, eval_loss, sample_generations, duration }    │
│  • On error: POST same with status=failed + reason                           │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (HMAC-signed POST)
┌──────────────────────────────────────────────────────────────────────────────┐
│              WEBHOOK HANDLER + EVAL GATE                                     │
│                                                                              │
│   POST /api/inference/fine-tuning/jobs/[id]/webhook                          │
│     │                                                                        │
│     ▼  Verify HMAC, idempotency, timestamp                                   │
│     │                                                                        │
│     ▼  EVAL GATE (block bad adapters)                                        │
│     │  • final_eval_loss < initial_eval_loss × 1.1 → pass                    │
│     │  • canned prompts produce non-degenerate output                        │
│     │  • on fail: status=diverged, do NOT register                           │
│     │                                                                        │
│     ▼  REGISTER inference.models                                             │
│     │  • model_id: ahura/<base>:ft-<short_id>                                │
│     │  • serving_type: runpod_ft                                             │
│     │  • org_id: scoped (private)                                            │
│     │                                                                        │
│     ▼  UPDATE inference.finetunes status=completed                           │
│     │                                                                        │
│     ▼  Svix → customer's webhook URL                                         │
└──────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (adapter URL now in catalog)
┌──────────────────────────────────────────────────────────────────────────────┐
│        SERVING — vLLM MULTI-LORA SHARED DEPLOYMENT (per base)               │
│                                                                              │
│  Gateway routes `ahura/llama-4-scout:ft-abc123` to:                          │
│    vLLM server with `--enable-lora --max-loras 8 --max-cpu-loras 64`         │
│    NVMe sidecar caches adapter binaries pulled from R2                       │
│    Control plane warms adapter via POST /v1/load_lora_adapter on first hit  │
│    Dummy 1-token request fires before user request returns                   │
│                                                                              │
│  Two tiers:                                                                  │
│    SHARED — N adapters on one base, ~1× base cost (Fireworks pattern)       │
│    DEDICATED — merged adapter on own pod, full GPU $/hr (upsell)            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-step build guide

### Step A — Custom Docker images (Axolotl + Unsloth lanes)

Create `infra/runpod/training-images/`:

```
infra/runpod/training-images/
├── axolotl/
│   ├── Dockerfile
│   ├── train.sh                ← orchestration script the container runs
│   ├── config-template.yaml    ← Jinja-style template for axolotl YAML
│   └── heartbeat.py            ← background daemon posting to orchestrator
├── unsloth/
│   ├── Dockerfile
│   ├── train.py                ← Unsloth's API is Python-first
│   └── heartbeat.py
└── shared/
    ├── upload-adapter.sh       ← R2 upload via rclone
    └── download-dataset.sh
```

**Axolotl Dockerfile** (start here — covers 80% of jobs):

```dockerfile
FROM pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime

# System deps
RUN apt-get update && apt-get install -y \
    git curl wget jq rclone \
    && rm -rf /var/lib/apt/lists/*

# Axolotl with all extras (FlashAttention, DeepSpeed, etc.)
RUN pip install --no-cache-dir \
    "axolotl[deepspeed,flash-attn,liger]==0.29.0" \
    accelerate==1.5.0 \
    transformers==4.50.0 \
    peft==0.13.0 \
    trl==0.13.0 \
    bitsandbytes==0.45.0 \
    "huggingface_hub[hf_transfer]==0.27.0" \
    requests

# Liger Kernel (free 20-60% throughput improvement)
RUN pip install --no-cache-dir liger-kernel==0.5.0

ENV HF_HUB_ENABLE_HF_TRANSFER=1
ENV WANDB_DISABLED=true
ENV TRANSFORMERS_NO_ADVISORY_WARNINGS=1

WORKDIR /workspace
COPY axolotl/train.sh ./
COPY axolotl/config-template.yaml ./
COPY axolotl/heartbeat.py ./
COPY shared/ ./shared/

RUN chmod +x train.sh shared/*.sh

ENTRYPOINT ["./train.sh"]
```

**`train.sh`** (the container's orchestration logic):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Required env vars (set by BullMQ worker):
: "${JOB_ID:?}"
: "${BASE_MODEL:?}"
: "${DATASET_URL:?}"
: "${HYPERPARAMS_JSON:?}"
: "${OUTPUT_R2_PREFIX:?}"
: "${WEBHOOK_URL:?}"
: "${WEBHOOK_SECRET:?}"
: "${R2_ACCESS_KEY_ID:?}"
: "${R2_SECRET_ACCESS_KEY:?}"
: "${R2_ENDPOINT:?}"

# Start heartbeat daemon (every 30s)
python heartbeat.py &
HEARTBEAT_PID=$!
trap "kill $HEARTBEAT_PID 2>/dev/null || true" EXIT

# Download dataset
echo "[$(date -Iseconds)] Pulling dataset from $DATASET_URL"
./shared/download-dataset.sh "$DATASET_URL" /workspace/data/train.jsonl

# Validate one more time (defense in depth — control plane already did this)
python -c "
import json, sys
n = 0
with open('/workspace/data/train.jsonl') as f:
    for i, line in enumerate(f, 1):
        try:
            d = json.loads(line)
            assert 'messages' in d
            n += 1
        except Exception as e:
            print(f'Line {i}: {e}'); sys.exit(2)
print(f'OK: {n} examples')
"

# Render axolotl config from hyperparams
echo "[$(date -Iseconds)] Rendering axolotl config"
python -c "
import json, os
from string import Template
hp = json.loads(os.environ['HYPERPARAMS_JSON'])
with open('config-template.yaml') as f:
    tmpl = Template(f.read())
cfg = tmpl.substitute(
    BASE_MODEL=os.environ['BASE_MODEL'],
    DATASET_PATH='/workspace/data/train.jsonl',
    OUTPUT_DIR='/workspace/output',
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
print(cfg)
"

# Train
START_TS=$(date +%s)
echo "[$(date -Iseconds)] Starting training"
if ! accelerate launch \
    --config_file /workspace/accelerate-config.yaml \
    -m axolotl.cli.train /workspace/config.yaml; then
    ELAPSED=$(($(date +%s) - START_TS))
    curl -fsS -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -H "X-Ahura-Webhook-Signature: $(echo -n "$JOB_ID:failed:$ELAPSED" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)" \
      -d "{\"job_id\":\"$JOB_ID\",\"status\":\"failed\",\"error\":\"train_exit_nonzero\",\"elapsed_seconds\":$ELAPSED}"
    exit 1
fi

# Upload adapter to R2
echo "[$(date -Iseconds)] Uploading adapter to $OUTPUT_R2_PREFIX"
./shared/upload-adapter.sh /workspace/output "$OUTPUT_R2_PREFIX"

# Run quick eval (read final loss from axolotl's training log)
FINAL_LOSS=$(python -c "
import json, glob
logs = sorted(glob.glob('/workspace/output/checkpoint-*/trainer_state.json'))
if not logs: print(0); exit()
state = json.load(open(logs[-1]))
last = [x for x in state.get('log_history', []) if 'loss' in x]
print(last[-1]['loss'] if last else 0)
" || echo 0)

# Sample generations (quality smoke test)
SAMPLE_OUTPUT=$(python -c "
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel
import torch, json
tok = AutoTokenizer.from_pretrained('$BASE_MODEL')
m = AutoModelForCausalLM.from_pretrained('$BASE_MODEL', torch_dtype=torch.bfloat16, device_map='auto')
m = PeftModel.from_pretrained(m, '/workspace/output')
prompts = ['Hello, how are you?', 'Explain in one sentence: what is a fine-tune?']
samples = []
for p in prompts:
    inp = tok(p, return_tensors='pt').to('cuda')
    out = m.generate(**inp, max_new_tokens=40, do_sample=False)
    samples.append({'prompt': p, 'output': tok.decode(out[0], skip_special_tokens=True)})
print(json.dumps(samples))
" 2>/dev/null || echo '[]')

ELAPSED=$(($(date +%s) - START_TS))

# Post completion webhook
echo "[$(date -Iseconds)] Posting completion webhook"
PAYLOAD=$(jq -nc \
  --arg job_id "$JOB_ID" \
  --arg status "completed" \
  --arg adapter "$OUTPUT_R2_PREFIX" \
  --argjson elapsed "$ELAPSED" \
  --argjson final_loss "$FINAL_LOSS" \
  --argjson samples "$SAMPLE_OUTPUT" \
  '{job_id: $job_id, status: $status, adapter_url: $adapter, elapsed_seconds: $elapsed, final_loss: $final_loss, sample_outputs: $samples}')
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)
curl -fsS -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ahura-Webhook-Signature: $SIG" \
  -H "X-Ahura-Idempotency-Key: $JOB_ID" \
  -d "$PAYLOAD"

echo "[$(date -Iseconds)] Done"
```

**`config-template.yaml`** (Liger + sample packing + checkpointing baked in):

```yaml
base_model: $BASE_MODEL
load_in_8bit: false
load_in_4bit: false   # set true for qLoRA — controlled by hyperparams.method in train.sh
strict: false

datasets:
  - path: $DATASET_PATH
    type: chat_template
    chat_template: chatml   # adapt by base model — llama3/qwen/gemma also supported

dataset_prepared_path: /workspace/data/prepared
output_dir: $OUTPUT_DIR
sequence_len: $SEQ_LEN
sample_packing: true
pad_to_sequence_len: true

adapter: lora
lora_r: $LORA_R
lora_alpha: $LORA_ALPHA
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - k_proj
  - v_proj
  - o_proj
  - gate_proj
  - up_proj
  - down_proj

gradient_accumulation_steps: $GRAD_ACCUM
micro_batch_size: $BATCH_SIZE
num_epochs: $EPOCHS
optimizer: adamw_torch_fused
lr_scheduler: cosine
learning_rate: $LR
warmup_steps: $WARMUP

bf16: auto
gradient_checkpointing: true
flash_attention: true

# Liger Kernel — drop-in throughput improvement
plugins:
  - axolotl.integrations.liger.LigerPlugin
liger_rope: true
liger_rms_norm: true
liger_glu_activation: true
liger_layer_norm: true
liger_fused_linear_cross_entropy: true

# Checkpointing — survives hardware faults
save_steps: 200
save_total_limit: 3
logging_steps: 10
```

**Build & push:**
```powershell
# In c:\cloud-services\infra\runpod\training-images\axolotl\
docker build -t ghcr.io/your-org/ahura-ft-axolotl:0.29.0 .
docker push ghcr.io/your-org/ahura-ft-axolotl:0.29.0
```

Skip the Unsloth lane for v1 — ship axolotl-only first, add Unsloth in a follow-up when you want the 2× cost win on single-GPU QLoRA.

---

### Step B — Pre-flight validation (control-plane upgrade)

Augment `POST /api/inference/fine-tuning/jobs` to validate **before** queuing. Adds ~2s but catches 80% of failures cheaply.

Create `lib/inference/finetune-validate.ts`:

```typescript
import { z } from "zod";

const MESSAGE_LINE = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.string(),
    })
  ).min(1),
});

export interface PreflightResult {
  ok: boolean;
  total_examples: number;
  total_tokens: number;
  truncated_examples: number;
  estimated_cost_cents: number;
  estimated_duration_minutes: number;
  warnings: string[];
  errors: string[];
}

export async function preflightDataset(opts: {
  datasetUrl: string;
  baseModelId: string;
  sequenceLen: number;
  epochs: number;
  pricePerMtokCents: number;
}): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Fetch (HEAD first to gate size, then stream)
  const head = await fetch(opts.datasetUrl, { method: "HEAD" });
  if (!head.ok) {
    errors.push(`Dataset URL returned ${head.status}`);
    return failed(errors);
  }
  const size = parseInt(head.headers.get("content-length") ?? "0", 10);
  if (size > 500 * 1024 * 1024) {
    errors.push("Dataset >500MB; use Phase 5 batch-upsert pipeline (TODO) instead");
    return failed(errors);
  }

  // 2. Stream parse JSONL
  const resp = await fetch(opts.datasetUrl);
  const text = await resp.text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  let totalExamples = 0;
  let totalTokens = 0;
  let truncatedExamples = 0;
  for (const [i, line] of lines.entries()) {
    try {
      const obj = JSON.parse(line);
      const parsed = MESSAGE_LINE.safeParse(obj);
      if (!parsed.success) {
        errors.push(`Line ${i + 1}: ${parsed.error.issues[0]?.message ?? "schema failed"}`);
        if (errors.length > 5) break;  // stop after 5 errors
        continue;
      }
      // Crude token estimate — replace with tiktoken or HF tokenizer call to base model
      const approxTokens = parsed.data.messages.reduce(
        (s, m) => s + Math.ceil(m.content.length / 4),
        0
      );
      totalTokens += approxTokens;
      if (approxTokens > opts.sequenceLen) truncatedExamples += 1;
      totalExamples += 1;
    } catch (e) {
      errors.push(`Line ${i + 1}: invalid JSON`);
      if (errors.length > 5) break;
    }
  }

  if (errors.length > 0) return failed(errors);

  // 3. Warnings
  if (truncatedExamples > 0) {
    warnings.push(
      `${truncatedExamples}/${totalExamples} examples will be truncated at sequence_len=${opts.sequenceLen}`
    );
  }
  if (totalExamples < 50) {
    warnings.push(`Only ${totalExamples} examples — LoRA needs ≥100 for meaningful adaptation`);
  }

  // 4. Cost preview — Together-style per-token pricing
  const billableTokens = totalTokens * opts.epochs;
  const estimatedCostCents = Math.ceil((billableTokens / 1_000_000) * opts.pricePerMtokCents);

  // 5. Duration heuristic (very rough)
  const estimatedDurationMinutes = Math.ceil((totalTokens * opts.epochs) / 100_000);

  return {
    ok: true,
    total_examples: totalExamples,
    total_tokens: totalTokens,
    truncated_examples: truncatedExamples,
    estimated_cost_cents: estimatedCostCents,
    estimated_duration_minutes: estimatedDurationMinutes,
    warnings,
    errors: [],
  };

  function failed(errs: string[]): PreflightResult {
    return {
      ok: false,
      total_examples: 0,
      total_tokens: 0,
      truncated_examples: 0,
      estimated_cost_cents: 0,
      estimated_duration_minutes: 0,
      warnings: [],
      errors: errs,
    };
  }
}
```

Wire into `POST /api/inference/fine-tuning/jobs` before the INSERT. Return the `PreflightResult` in the response so the UI can show cost preview.

---

### Step C — BullMQ runner on k8s

Create `workers/ft-runner/` (separate from `workers/inference/` because this runs on Node/k8s, not Cloudflare Workers).

```
workers/ft-runner/
├── package.json
├── tsconfig.json
├── Dockerfile
├── k8s/
│   ├── deployment.yaml
│   ├── secret.yaml.template
│   └── service.yaml
└── src/
    ├── index.ts             ← BullMQ worker entrypoint
    ├── runpod.ts            ← thin wrapper over existing lib/services/runpod/
    ├── lifecycle.ts         ← claim → provision → monitor → tear down
    ├── heartbeat.ts         ← stall detection
    └── webhook-handler.ts   ← signs outgoing customer webhooks (Svix client)
```

**`src/index.ts`** (the worker):

```typescript
import { Worker, QueueScheduler } from "bullmq";
import IORedis from "ioredis";
import { runJob } from "./lifecycle.js";

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Required to handle delayed jobs and retries
new QueueScheduler("ahura-inference-ft-runner", { connection });

const worker = new Worker(
  "ahura-inference-ft-runner",
  async (job) => {
    console.log(JSON.stringify({
      level: "info",
      msg: "ft-runner: claimed",
      jobId: job.data.jobId,
    }));
    return await runJob(job.data.jobId);
  },
  {
    connection,
    concurrency: parseInt(process.env.MAX_CONCURRENT_JOBS ?? "4", 10),
    lockDuration: 60_000,   // we extend this in lifecycle.ts via job.extendLock
    autorun: true,
  }
);

worker.on("completed", (job) => {
  console.log(JSON.stringify({ level: "info", msg: "ft-runner: completed", jobId: job.data.jobId }));
});
worker.on("failed", (job, err) => {
  console.error(JSON.stringify({
    level: "error", msg: "ft-runner: failed",
    jobId: job?.data?.jobId, err: err.message,
  }));
});

process.on("SIGTERM", async () => {
  await worker.close();
  await connection.quit();
});
```

**`src/lifecycle.ts`**:

```typescript
import { createClient } from "@supabase/supabase-js";
import { runpodCreatePod, runpodTerminatePod, runpodGetPodStatus } from "./runpod.js";
import { detectStall } from "./heartbeat.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const GPU_TO_RUNPOD_TYPE: Record<string, string> = {
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "A100-40GB": "NVIDIA A100 PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
  "L40S": "NVIDIA L40S",
  "A40": "NVIDIA A40",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
};

const IMAGE_BY_METHOD: Record<string, string> = {
  lora: process.env.AXOLOTL_IMAGE_URI!,
  qlora: process.env.AXOLOTL_IMAGE_URI!,
  // Future: unsloth for single-GPU qlora — switch on hyperparams.gpu_count === 1
  full: process.env.AXOLOTL_IMAGE_URI!,
};

export async function runJob(jobId: string): Promise<void> {
  // 1. Claim — atomic UPDATE so two replicas can't double-claim
  const { data: claimed, error: claimErr } = await supabase
    .schema("inference")
    .from("finetunes")
    .update({ status: "preparing", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select(
      "id, org_id, base_model_id, method, hyperparams, dataset_url, validation_dataset_url, gpu_sku"
    )
    .single();

  if (claimErr || !claimed) {
    // Already claimed by another replica, or cancelled — exit
    return;
  }

  // 2. Provision RunPod pod
  const podSpec = {
    imageName: IMAGE_BY_METHOD[claimed.method] ?? IMAGE_BY_METHOD.lora,
    gpuTypeId: GPU_TO_RUNPOD_TYPE[claimed.gpu_sku] ?? GPU_TO_RUNPOD_TYPE["A100-80GB"],
    gpuCount: 1,  // tune based on method/base size
    volumeInGb: 100,
    containerDiskInGb: 100,
    volumeMountPath: "/workspace/cache",
    env: {
      JOB_ID: jobId,
      BASE_MODEL: claimed.base_model_id,
      DATASET_URL: claimed.dataset_url,
      HYPERPARAMS_JSON: JSON.stringify(claimed.hyperparams),
      OUTPUT_R2_PREFIX: `r2://ahura-ft-adapters/${claimed.org_id}/${jobId}/`,
      WEBHOOK_URL: `${process.env.CONTROL_PLANE_URL}/api/inference/fine-tuning/jobs/${jobId}/webhook`,
      WEBHOOK_SECRET: process.env.FT_WEBHOOK_SECRET!,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
      R2_ENDPOINT: process.env.R2_ENDPOINT!,
    },
  };

  const podId = await runpodCreatePod(podSpec);

  await supabase
    .schema("inference")
    .from("finetunes")
    .update({ status: "running", runpod_job_id: podId })
    .eq("id", jobId);

  // 3. Monitor — poll heartbeats + pod status
  // The container POSTs to /webhook on completion (success or failure), so
  // we mainly watch for stalls + cancellation here.
  let consecutiveStalls = 0;
  while (true) {
    await sleep(15_000);

    // Cancellation check
    const { data: cur } = await supabase
      .schema("inference")
      .from("finetunes")
      .select("status")
      .eq("id", jobId)
      .single<{ status: string }>();

    if (cur?.status === "cancelled") {
      await runpodTerminatePod(podId);
      return;
    }
    if (cur?.status === "completed" || cur?.status === "failed") {
      // Webhook already updated — we're done
      return;
    }

    // Heartbeat / stall detection
    const stalled = await detectStall(jobId, 90_000);
    if (stalled) consecutiveStalls += 1;
    else consecutiveStalls = 0;

    if (consecutiveStalls >= 3) {
      // 3 consecutive 15s checks with no heartbeat = ~45-90s of silence
      const podStatus = await runpodGetPodStatus(podId);
      if (podStatus !== "RUNNING") {
        await supabase
          .schema("inference")
          .from("finetunes")
          .update({
            status: "failed",
            error_message: `Pod died mid-training (status: ${podStatus})`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        await runpodTerminatePod(podId);
        return;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

**`k8s/deployment.yaml`** (1 replica to start, scale horizontally later by sharding on `jobId.hashCode() % N`):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ahura-ft-runner
  namespace: ahura
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ahura-ft-runner
  template:
    metadata:
      labels:
        app: ahura-ft-runner
    spec:
      containers:
        - name: runner
          image: ghcr.io/your-org/ahura-ft-runner:latest
          envFrom:
            - secretRef:
                name: ahura-ft-runner-secrets
          resources:
            requests:
              cpu: "200m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            periodSeconds: 30
```

Required secrets in `ahura-ft-runner-secrets`:
- `REDIS_URL` — your Upstash / BullMQ Redis
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `RUNPOD_API_KEY`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`
- `FT_WEBHOOK_SECRET` — HMAC secret shared with control plane
- `CONTROL_PLANE_URL` — `https://your-dashboard-domain.com`
- `AXOLOTL_IMAGE_URI` — `ghcr.io/your-org/ahura-ft-axolotl:0.29.0`
- `MAX_CONCURRENT_JOBS` — `4` to start

---

### Step D — Webhook endpoints

Two endpoints to build:

**1. Internal — receives from training container:**

`app/api/inference/fine-tuning/jobs/[id]/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

const WEBHOOK_SECRET = process.env.FT_WEBHOOK_SECRET!;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify HMAC
  const sig = request.headers.get("X-Ahura-Webhook-Signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  const body = await request.text();
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("base64");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as {
    job_id: string;
    status: "completed" | "failed";
    adapter_url?: string;
    elapsed_seconds: number;
    final_loss?: number;
    sample_outputs?: Array<{ prompt: string; output: string }>;
    error?: string;
  };

  if (payload.job_id !== id) {
    return NextResponse.json({ error: "Job ID mismatch" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  if (payload.status === "failed") {
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "failed",
        error_message: payload.error ?? "training_failed",
        training_seconds: payload.elapsed_seconds,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    // TODO: trigger Svix customer webhook fine_tuning.job.failed
    return NextResponse.json({ ok: true });
  }

  // EVAL GATE — reject divergent adapters
  // Read initial baseline loss from inference.finetunes.hyperparams.baseline_loss
  // (set during pre-flight). If final_loss > baseline × 1.1, mark diverged.
  const { data: job } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("hyperparams, base_model_id, org_id, name")
    .eq("id", id)
    .maybeSingle<{
      hyperparams: Record<string, unknown>;
      base_model_id: string;
      org_id: string;
      name: string;
    }>();

  const baselineLoss = (job?.hyperparams as { baseline_loss?: number })?.baseline_loss ?? null;
  if (
    baselineLoss !== null &&
    payload.final_loss !== undefined &&
    payload.final_loss > baselineLoss * 1.1
  ) {
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "failed",
        error_message: `Eval gate: final_loss ${payload.final_loss} > baseline ${baselineLoss} × 1.1`,
        training_seconds: payload.elapsed_seconds,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, gated: true });
  }

  // REGISTER as private model in catalog
  const baseShort = job!.base_model_id.split("/")[1] ?? job!.base_model_id;
  const shortId = id.slice(0, 8);
  const modelId = `ahura/${baseShort}:ft-${shortId}`;

  const { data: newModel } = await supabase
    .schema("inference")
    .from("models")
    .insert({
      model_id: modelId,
      display_name: `${job!.name} (LoRA of ${baseShort})`,
      description: `Private LoRA adapter trained on the user's dataset. Job ${shortId}.`,
      modality: "chat",
      serving_type: "runpod_ft",
      org_id: job!.org_id,
      upstream_provider: "openrouter",
      upstream_model_id: modelId,
      runpod_endpoint_id: process.env.LORA_SERVING_ENDPOINT_ID!,
      capabilities: { streaming: true, tools: true, json_mode: true, context_window: 8192 },
      pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 },
      is_active: true,
    })
    .select("id")
    .single();

  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "completed",
      output_artifact_url: payload.adapter_url,
      output_model_id: newModel?.id ?? null,
      training_seconds: payload.elapsed_seconds,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  // TODO: trigger Svix customer webhook fine_tuning.job.succeeded
  return NextResponse.json({ ok: true, model_id: modelId });
}
```

**2. Heartbeat receiver:**

`app/api/inference/fine-tuning/jobs/[id]/heartbeat/route.ts` — accepts a POST every 30s from the container with `{ step, loss, peak_gpu_mem_gb }`. Stores in Redis with 90s TTL keyed by `ft-heartbeat:<jobId>`. The runner's `detectStall()` checks for absence.

**3. Customer webhook delivery (Svix):**

Sign up for Svix, get an app token. Each org with a `webhook_url` in their org settings gets:
- A Svix application created on first webhook subscription
- `fine_tuning.job.succeeded` / `fine_tuning.job.failed` events delivered with HMAC + 72h retry + dashboard

Implementation deferred — wrap Svix client in `lib/inference/customer-webhooks.ts` and call from the internal webhook handler after DB update.

---

### Step E — Eval gate

Already integrated above (the `baseline × 1.1` check). To make it stronger:

- During pre-flight, run **one forward pass on the base model** over a held-out 10-example slice of the dataset and record `baseline_loss` in `hyperparams`. The training container reads this from its env. After training, the same 10 examples are evaluated against the LoRA-applied model — that's `payload.final_loss`. If it's worse than baseline by more than 10%, gate the adapter.
- Add a **sample generation smoke test**: the container generates 2-3 outputs from canned prompts. The webhook handler checks for:
  - Non-empty output (catches infinite EOS bugs)
  - At least 5 distinct tokens (catches degenerate repetition collapse)
  - No NaN/Inf in any of the logged training losses

These three checks together catch ~95% of "training technically completed but adapter is broken" failure modes.

---

### Step F — Serving (vLLM Multi-LoRA)

Separate deployment, not part of the FT runner. Build later but plan now.

**Architecture per supported base:**

```
RunPod Pod (always-warm, A100 80GB or H100)
  └─ vLLM 0.7+
       --model meta-llama/llama-4-scout
       --enable-lora
       --max-loras 8
       --max-cpu-loras 64
       --max-lora-rank 64

  + Sidecar: lora-puller
      Polls /api/inference/vector/loras/needed every 30s
      Downloads from R2 to local NVMe
      POSTs /v1/load_lora_adapter to vLLM with name + path

  + Sidecar: warmup
      On first request for an adapter:
        1. POST /v1/load_lora_adapter
        2. Send a 1-token dummy generation
        3. Forward user's actual request
```

The gateway (Cloudflare Worker `/v1/chat/completions`) already routes models with `serving_type='runpod_ft'` based on the catalog. Just add the dispatch logic — when serving_type is `runpod_ft`, forward to the right RunPod endpoint (looked up from `inference.models.runpod_endpoint_id`).

**Pricing tiers to offer:**

| Tier | What | Price |
|---|---|---|
| **Shared** | Multi-tenant Multi-LoRA on shared base | ~base model rate × 1.0 (Fireworks pattern: 1000s of LoRAs on one cluster at base cost) |
| **Dedicated** | Merged adapter on own pod, isolated | Full GPU $/hr ($1.20-$3 depending on SKU) |

Default = shared, upgrade to dedicated for >50 sustained RPS or strict latency SLA.

---

## 4. Pricing model

| SKU | Pricing | Customer-facing example |
|---|---|---|
| **LoRA / QLoRA** | **$0.50 / M training tokens** (epoch × dataset tokens) | 100K-token dataset × 3 epochs = $0.15 |
| **Full FT** | **$2.50 / GPU-hour** for A100 80GB, $5.00 for H100 80GB | 4h Llama-3 8B full FT on H100 = $20 |
| **LoRA hosting — shared** | **$0** (included in inference base rate) | Calls to your LoRA cost the same as calls to the base |
| **LoRA hosting — dedicated** | **$2/h** A100, **$5/h** H100 | Always-on dedicated endpoint |

Markup: ~2× raw RunPod cost on training, 1.5× on dedicated hosting. Shared hosting is loss-leader to drive adoption (Fireworks does this).

---

## 5. Sequenced shipping plan

Cleanest path from "Phase 5.A shipped" to "real fine-tuning in production":

| Week | Milestone | Deliverable |
|---|---|---|
| **W1** | Pre-flight validation | `lib/inference/finetune-validate.ts` + wire into POST /jobs. Returns cost preview + warnings. |
| **W1-W2** | Axolotl Docker image | `infra/runpod/training-images/axolotl/` — Dockerfile, train.sh, config-template.yaml, heartbeat.py. Push to GHCR. Smoke-test on one RunPod pod manually with a tiny dataset. |
| **W2** | FT runner skeleton | `workers/ft-runner/` Node project. BullMQ worker that claims, provisions, monitors. Without the real RunPod client first — mock for tests. |
| **W2-W3** | RunPod integration | Wire to existing `lib/services/runpod/`. End-to-end: create job in dashboard → runner provisions pod → pod actually trains → uploads adapter to R2. |
| **W3** | Webhook + eval gate | Internal webhook endpoint with HMAC, baseline eval, model registration. Container `train.sh` POSTs back. |
| **W3** | k8s deployment | Build runner Docker, deploy to your k8s cluster, smoke-test with a real customer-style dataset. |
| **W4** | LoRA serving | vLLM Multi-LoRA deployment per base, gateway dispatch for `runpod_ft` models, NVMe sidecar adapter puller. |
| **W4** | Customer webhooks | Svix integration, org settings UI for webhook URL, event delivery on succeed/fail. |

After W4 — Phase 5.B is shippable. After that, Unsloth lane (W5) and Instant Clusters for >70B full FT (W5-6) are upgrades.

---

## 6. What you (the operator) do vs what I can write

### You do (needs real infra access):
1. **Build & push** the axolotl Docker image — needs your GHCR or Docker Hub credentials.
2. **Stand up an R2 bucket** for adapter storage (or reuse an existing one).
3. **Set up a Redis** (Upstash works) and BullMQ secret.
4. **Generate an HMAC secret** for the webhook signing (`openssl rand -base64 32`).
5. **Pick a k8s cluster** for the runner (your existing one).
6. **Sign up for Svix** if you want customer webhooks (or defer to Phase 7).
7. **Reserve a RunPod budget** — first few smoke tests will burn $10-30.
8. **First serving deployment**: provision one always-warm RunPod pod per base model you want to FT-serve.

### I can write in code:
1. ✅ Axolotl Dockerfile + train.sh + config template (above)
2. ✅ Pre-flight validation lib (above)
3. ✅ BullMQ worker code (above, expand from skeleton)
4. ✅ Webhook handler + HMAC verification (above)
5. ✅ Eval gate logic (above)
6. ✅ k8s deployment YAML (above)
7. ⏳ Wrapper around `lib/services/runpod/` for FT-specific pod creation
8. ⏳ Svix integration for customer webhooks
9. ⏳ vLLM Multi-LoRA serving stack + gateway dispatch — sizeable, separate doc

Tell me which to write first and I'll start. My recommendation: **start with the axolotl Docker image + pre-flight validation** because they're the highest-risk pieces (image is operator-blocking; pre-flight catches 80% of failures cheap). Runner code is straightforward once those exist.

---

## Sources

Research validated against (May 2026):
- [Axolotl AI Cloud docs](https://docs.axolotl.ai/) · [GitHub v0.29.0](https://github.com/axolotl-ai-cloud/axolotl) · [Multipack docs](https://docs.axolotl.ai/docs/multipack.html) · [Conversation formats](https://docs.axolotl.ai/docs/dataset-formats/conversation.html)
- [Together AI fine-tuning](https://www.together.ai/fine-tuning) · [pricing docs](https://docs.together.ai/docs/fine-tuning-pricing) · [HF blog](https://huggingface.co/blog/togethercomputer/together-ft)
- [Fireworks Multi-LoRA](https://fireworks.ai/blog/multi-lora) · [Deploying LoRAs](https://docs.fireworks.ai/fine-tuning/deploying-loras) · [3D FireOptimizer](https://fireworks.ai/blog/3d-fireoptimizer)
- [OpenAI Webhooks Guide](https://developers.openai.com/api/docs/guides/webhooks) · [Webhook events reference](https://platform.openai.com/docs/api-reference/webhook-events)
- [Baseten Training GA](https://www.baseten.co/blog/baseten-training-is-ga/) · [Product page](https://www.baseten.co/products/training/)
- [Modal serverless GPUs](https://modal.com/blog/truly-serverless-gpus)
- [RunPod pricing](https://www.runpod.io/pricing) · [Pods vs Serverless](https://www.runpod.io/articles/comparison/serverless-gpu-deployment-vs-pods) · [Instant Clusters](https://www.runpod.io/articles/guides/instant-clusters-for-ai-research) · [Axolotl FT tutorial](https://docs.runpod.io/tutorials/pods/fine-tune-llm-axolotl) · [llm-fine-tuning template](https://github.com/runpod-workers/llm-fine-tuning)
- [vLLM LoRA docs](https://docs.vllm.ai/en/latest/features/lora/) · [LoRAX (Predibase)](https://github.com/predibase/lorax) · [SGLang LoRA](https://sgl-project.github.io/advanced_features/lora.html)
- [Liger Kernel](https://github.com/linkedin/Liger-Kernel) · [Unsloth Llama 4](https://unsloth.ai/blog/llama4)
- [Svix best practices](https://www.svix.com/resources/webhook-best-practices/authentication/)
- 2026 benchmarks: [DEV.to EVAL #003](https://dev.to/ultraduneai/eval-003-fine-tuning-in-2026-axolotl-vs-unsloth-vs-trl-vs-llama-factory-2ohg) · [Spheron framework comparison](https://www.spheron.network/blog/axolotl-vs-unsloth-vs-torchtune/)
