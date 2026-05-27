# Fine-Tuning Runner — Operator Contract (Phase 5.B)

The Phase 5.A API + dashboard at [app/api/inference/fine-tuning](../../app/api/inference/fine-tuning/) accept job submissions and persist them to `inference.finetunes` with `status='queued'`. **They do not start training.** That's the job of the FT runner — a separate Node process on k8s that picks up queued jobs, drives a RunPod pod through the training lifecycle, and webhooks back when done.

This doc is the contract: what the runner must do, what state it touches, what it can rely on.

---

## What the runner reads

It polls or subscribes to `inference.finetunes` for jobs in `status IN ('queued', 'preparing', 'running')` belonging to its assigned shard. For each, it pulls:

| Column | Use |
|---|---|
| `id`, `org_id`, `name` | Identifiers; org for any side reads (BYOK keys, etc.) |
| `base_model_id` | Hugging Face / OpenRouter model id (e.g. `meta-llama/llama-4-scout`) |
| `method` | `lora` / `qlora` / `full` — controls axolotl config template |
| `hyperparams` | jsonb: rank, alpha, lr, epochs, batch_size, gradient_accumulation_steps, max_seq_length, warmup_steps, target_modules |
| `dataset_url` | https:// or s3:// or r2:// pointer to JSONL chat-format file |
| `validation_dataset_url` | optional, same format |
| `gpu_sku` | RunPod GPU type identifier |

---

## Lifecycle the runner drives

```
   queued                     ← job inserted by Next.js API
      │
      ▼  runner claims it (status=preparing)
      │
   preparing                  ← runner provisioning pod + downloading dataset
      │
      ▼  pod up, training started (status=running, runpod_job_id set)
      │
   running                    ← axolotl/unsloth running
      │
      ├─→ completed           ← adapter pushed to R2, output_model_id set,
      │                          inference.models row inserted
      │
      ├─→ failed              ← error_message populated, pod torn down
      │
      └─→ cancelled           ← user-initiated; runner should pick up the
                                 transition within its poll window
```

State transitions are exclusively the runner's responsibility once it claims a job. The Next.js API only writes:
- `status='queued'` on POST (initial)
- `status='cancelled'` on DELETE (user cancel — runner must honor this on next check)

---

## What the runner writes

After each lifecycle step, UPDATE the row:

```sql
-- On claim:
UPDATE inference.finetunes
SET status = 'preparing',
    started_at = NOW()
WHERE id = $job_id AND status = 'queued';
-- (Use the WHERE to avoid double-claim races between runner replicas.)

-- After pod provisioned + training started:
UPDATE inference.finetunes
SET status = 'running',
    runpod_job_id = $pod_id
WHERE id = $job_id AND status = 'preparing';

-- On completion:
UPDATE inference.finetunes
SET status = 'completed',
    completed_at = NOW(),
    output_artifact_url = $r2_url,
    training_seconds = $elapsed,
    cost_cents = $compute_cost
WHERE id = $job_id;

-- Then register the output model:
INSERT INTO inference.models (
  model_id, display_name, description, modality, serving_type,
  org_id, runpod_endpoint_id, capabilities, pricing, is_active
) VALUES (
  'ahura/' || split_part($base_model_id, '/', 2) || ':ft-' || $short_id,
  $job_name || ' (fine-tune of ' || split_part($base_model_id, '/', 2) || ')',
  'Private LoRA adapter trained on ' || $dataset_url,
  'chat', 'runpod_ft',
  $org_id, $runpod_endpoint_id,
  $base_model_capabilities,
  $pricing_per_gpu_hour,
  TRUE
);

-- Then link the model id back to the job:
UPDATE inference.finetunes
SET output_model_id = $model_uuid
WHERE id = $job_id;

-- On failure:
UPDATE inference.finetunes
SET status = 'failed',
    completed_at = NOW(),
    error_message = $error_msg,
    training_seconds = $elapsed_so_far,
    cost_cents = $partial_cost
WHERE id = $job_id;
```

Use the service-role Supabase key for all writes. RLS bypassed.

---

## RunPod orchestration outline

For each claimed job:

1. **Build / pull the training image.** Operator-provided. Recommended base: PyTorch 2.4 + axolotl preinstalled. See `infra/runpod-training-image/` (TODO — operator needs to create).
2. **Provision a RunPod Serverless Worker or pod** via `lib/services/runpod/operations/pod-lifecycle-operations.ts`. Pass:
   - `gpu_sku` (e.g. `A100-80GB`)
   - Container image URI
   - Environment vars: `DATASET_URL`, `BASE_MODEL`, `OUTPUT_S3_PREFIX`, `HYPERPARAMS_JSON`, `JOB_ID`, `WEBHOOK_URL`
3. **Wait for pod to reach RUNNING.** UPDATE `status='running'`.
4. **Poll pod logs** or wait for webhook callback.
5. **On axolotl completion**, the container should `curl` POST to `WEBHOOK_URL` with the result. The runner can also poll the pod's exit status.
6. **Update DB + register output model** as above.
7. **Tear down the pod** to stop billing.

---

## The training container's job

Inside the RunPod pod, our image should:

1. Read env vars (`DATASET_URL`, `BASE_MODEL`, `HYPERPARAMS_JSON`, etc.)
2. Download dataset to local disk
3. Generate an axolotl config (yaml) from `HYPERPARAMS_JSON` + the chosen `method`
4. Run `accelerate launch axolotl train config.yaml`
5. Upload the resulting adapter (LoRA weights + tokenizer config) to `OUTPUT_S3_PREFIX` in R2/S3
6. POST `{status:'completed', artifact_url, elapsed_seconds, peak_gpu_memory_gb}` to `WEBHOOK_URL`
7. Exit 0

On any error: POST `{status:'failed', error_message, partial_elapsed_seconds}` and exit 1.

---

## Webhook endpoint (still to build)

A new Next.js route at `/api/inference/fine-tuning/jobs/[id]/webhook` should:
- Verify a signed webhook secret (HMAC over body)
- Apply the appropriate UPDATE to the finetunes row
- On success: register the output model in `inference.models`
- Emit an audit event

This webhook plus the runner together complete Phase 5.B.

---

## Recommended runner deployment

- One BullMQ queue: `ahura-inference-ft-runner`
- A worker pod on k8s (single replica to start; horizontal scale later by shard key)
- Pulls jobs every 5s from the queue + DB polling fallback for resilience
- Uses `RUNPOD_API_KEY` env var (existing — see `lib/services/runpod/client.ts`)
- Writes to Supabase via `SUPABASE_SERVICE_ROLE_KEY` env var
- Logs structured JSON to stdout for OTel collection

---

## What Phase 5.A ships (today)

Everything except the runner:
- `POST /api/inference/fine-tuning/jobs` — create + validate + insert + audit
- `GET /api/inference/fine-tuning/jobs` — list with status filter
- `GET /api/inference/fine-tuning/jobs/[id]` — details
- `DELETE /api/inference/fine-tuning/jobs/[id]` — cancel (state transition; runner honors)
- Dashboard with create form (name, base, method, dataset URL, GPU SKU, hyperparams)
- Auto-refresh while jobs are in-flight
- Status pills with glow + cancel action
- "Output Registered" indicator when complete

You can submit jobs today — they queue but don't run. Useful for testing the API contract. Wire up the runner when ready to actually train.
