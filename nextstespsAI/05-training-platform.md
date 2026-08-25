# Training Platform Expansion — Design Document

*AhuraCloud · June 2026 · principal-engineering design for the Training cluster*

This cluster generalizes the proven single-pod LoRA path (`inference.finetunes` + `workers/ft-runner` + the billing spine) into a full training platform: full FT, preference/RL tuning, continued pretraining, distillation, quantization, multi-node clusters, experiment tracking, checkpoint management, and a versioned model registry. The design reuses the existing claim/heartbeat/webhook lifecycle, the `active_*` + grace billing enrollment, the brand-scrub discipline, and the gateway routing pattern, and slots own-fleet B300/H200 reserved capacity in behind RunPod without changing the customer surface.

## 1. Services & customer value

Nine distinct, separately-sold services. Each is a SKU on the dashboard and (where it has inference-time output) a routable model in `inference.models`.

| Service | What the customer buys | Competitor reference |
|---|---|---|
| **Full fine-tuning + QLoRA tiers** | Train any open base model with full-parameter or (Q)LoRA SFT; pick GPU SKU + node count; per-second GPU billing. `method` already exists (`lora`/`qlora`/`full`) — we make `full` real. | OpenAI FT, Together full-FT, Fireworks |
| **Preference tuning (DPO/ORPO/KTO)** | Align a model from a preference dataset (chosen/rejected pairs). axolotl supports these natively. | Together DPO, Fireworks DPO |
| **Reinforcement fine-tuning (RFT / GRPO)** | Reward-model- or verifier-driven RL on a task; customer supplies a grader (regex/JSON-schema/code-exec/LLM-judge) or a reward endpoint. The marquee differentiator. | OpenAI RFT, Predibase GRPO |
| **Continued pretraining** | Domain-adapt a base on a raw corpus (no instruction format); long multi-day, multi-node runs. | Together continued pretraining |
| **Distillation** | Teacher → student: generate completions from a frontier teacher (via our own `/v1` gateway), then SFT a small student. Composes batch API + FT. | OpenAI distillation, Together |
| **Quantization** | Convert any owned/registry checkpoint to GGUF / AWQ / GPTQ / FP8; one-shot job, artifact to registry. CPU/small-GPU, cheap, high-margin. | Fireworks/Together quantize, Predibase |
| **Multi-node instant clusters** | Reserve N interconnected GPU nodes (NVLink/IB) as one Slurm/k8s job for large FT/CPT; per-node-second billing; the monetization hook for the Yotta B300/H200 fleet. | Together Instant Clusters, CoreWeave, Lambda |
| **Experiment tracking** | W&B-style runs/metrics/artifacts: live loss/reward/grad-norm curves, system metrics, config snapshot, artifact lineage, run compare. Already half-built (`finetunes.current_step/latest_loss/last_heartbeat_at`). | Weights & Biases, MLflow |
| **Model registry + checkpoints** | Versioned models with lineage (base → run → checkpoint → quant), immutable R2 checkpoint store, promote/rollback, one-click deploy to managed serving. | HF Hub, W&B Registry, MLflow Registry |

The bundle's value-add (consistent with `architecture.md`) is the *integrated train → track → register → quantize → serve loop* under one balance, one API key, one audit log — not per-unit GPU price.

## 2. Build vs proxy

The hard rule (`docs/inference/architecture.md` §"deliberately NOT in scope" + memory): inference is proxied to OpenRouter, **training is built on our own substrate** (RunPod now, B300/H200 later). Training is where we own the GPU operational burden because it's the differentiator and the DPR justification.

| Service | Decision | Justification |
|---|---|---|
| Full FT / DPO / ORPO / CPT | **Build** (RunPod pods → own fleet) | Extends the existing axolotl image + `ft-runner` lifecycle. Only config + GPU sizing differ from LoRA. Same `createPod` path. |
| RFT / GRPO | **Build** | No clean brand-hideable proxy exists at usable economics; rollout-heavy, owns the differentiator. Needs a *grader sidecar* (new container) but rides the same runner. |
| Distillation | **Build (teacher = our own `/v1`)** | Teacher inference proxies to OpenRouter *internally* via `api.ahurasense.com/v1` (customer never sees the upstream); student training is a normal FT job. Zero new upstream. |
| Quantization | **Build** | Tiny job (llama.cpp / AutoAWQ / llm-compressor in a CPU+small-GPU pod). No external service worth proxying; high margin. |
| Multi-node clusters | **Build — sequence behind fleet** | RunPod Instant Clusters work *now* for v1; the real economics land on owned B300/H200 with IB. This is the reserved-capacity monetization layer. |
| Experiment tracking | **Build on Postgres + R2** | We already ingest heartbeats; a W&B proxy would leak a brand and externalize customer data. Building also keeps it inside our RLS + ZDR story. |
| Registry / checkpoints | **Build on Supabase + R2** | Pure control-plane + object store. Same R2 the adapters already live in (`r2://ahura-ft-adapters/...`). |

**Candidate upstreams (never customer-visible):** RunPod (pods + Instant Clusters today), the future Yotta-hosted B300/H200 fleet (own k8s/Slurm), OpenRouter (distillation teacher only), Cloudflare R2 (checkpoints/artifacts). All masked via `lib/inference/branding.ts` + `error-messages.ts` + `customerSafeErrorMessage()`; the runner already sanitizes provision errors to "Could not start training…" (see `lifecycle.ts`).

## 3. Architecture

Maps onto the 4 existing deployables, adding **one new deployable** only for multi-node scheduling.

**Deployable 1 — CF Worker gateway (`workers/inference`).** No new request-path role for training *control* (training launches go to the control plane, not the edge — too long-lived for Workers). The Worker gains:
- **Cron sweeps** (extends the existing `scheduled()` dispatcher in `index.ts`): a new `/api/inference/internal/training-meter` sweep at `minute % 5 === 0` (meters running runs that lack a terminal webhook, mirroring `runDeploymentMeter`), and `/api/inference/internal/cluster-watchdog` (reaps idle reserved clusters past `auto_release_at`, mirroring the serving-pod watchdog).
- **Metrics ingest fast-path** (optional): a `POST /v1/runs/{id}/metrics` route guarded by `authMiddleware` so customer training code running *anywhere* (incl. BYO clusters) can stream metrics through the edge into a CF Queue → consumer. Internal pod heartbeats keep the existing direct control-plane path.
- Distillation teacher calls loop back through `/v1/chat/completions` with an internal service key.

**Deployable 2 — Next.js control plane (`app/`, `lib/inference`).** Owns all training CRUD: `POST /api/inference/training/runs`, registry, checkpoints, cluster reservations, grader config, webhook + heartbeat receivers (extend the existing `fine-tuning/jobs/[id]/webhook` + `heartbeat` handlers). Hosts the dashboard run/registry UI. Pre-flight balance + quota guards live here (slice 1 of the inference-billing-gaps work already established this pattern). New `lib/inference/` modules: `training-queue.ts`, `training-billing.ts`, `registry.ts`, `checkpoints.ts`, `cluster-billing.ts`, `quant-queue.ts`, mirroring `finetune-queue.ts` / `finetune-billing.ts`.

**Deployable 3 — k8s runners.** Generalize `ft-runner` → **`training-runner`** (same Postgres-claim → BullMQ → provision → monitor lifecycle). The `Claimer` polls `inference.training_runs WHERE status='queued'` (was `finetunes`); `lifecycle.ts` branches on `run_type` to choose the image/entrypoint (axolotl SFT/DPO, GRPO+grader, CPT, distill driver). **`quant-runner`** is a second BullMQ worker in the same deployment (cheap CPU pods, separate queue `ahura-inference-quant`). Both reuse `runpod.ts`, `heartbeat.ts`, `claimer.ts` verbatim in pattern.

**Deployable 4 — billing cron.** Already covered by Worker `scheduled()` (above) calling control-plane internal sweeps; hourly `bill_service_cycle_atomic` handles reserved clusters via a new `billing.active_training_cluster` table.

**NEW deployable — `cluster-scheduler` (k8s).** Only multi-node needs it: a thin service that translates a cluster reservation into a Slurm `sbatch` (own fleet) or a RunPod Instant Cluster API call, wires up the IB/NVLink topology, and reports node-set health back to `inference.training_clusters`. It claims `reservation` rows the same way `Claimer` does. Justified as new (not folded into `training-runner`) because it manages *fleet capacity* (a finite, reservable pool with a scheduler) rather than per-job pods — a different lifecycle and blast radius.

**Request flow — `POST /api/inference/training/runs` (a GRPO run):**
1. Control plane authenticates dashboard session → `getActiveOrgForUser()` → org + role (RBAC: developer+).
2. Validate (new `training-validate.ts`): dataset URL reachable, `run_type='grpo'` grader config valid, GPU SKU + node count allowed, **pre-flight balance ≥ est. min cost** + quota guard.
3. Insert `inference.training_runs` (status `queued`) + enroll meter row.
4. `enqueueTrainingJob(runId)` best-effort to BullMQ (`training-queue.ts`, exact `finetune-queue.ts` shape); claimer-poll is source of truth.
5. `training-runner` claims atomically (`update status preparing WHERE status='queued'`), provisions pod(s)/cluster via `runpod.ts`, persists `hourly_cost_cents` + pod ids, flips to `running`.
6. Container streams heartbeats (`current_step/latest_loss/reward_mean`) → control-plane heartbeat receiver → updates row → dashboard live curves. GRPO grader runs as a sidecar; rewards POST to the metrics ingest.
7. `train.sh` uploads checkpoints to `r2://ahura-ft-checkpoints/{org}/{run}/step-{n}/`, registers each as a `checkpoints` row, and POSTs the HMAC-signed completion webhook → final `cost_cents` computed + `chargeTrainingUsage()` → registry version created.
8. Watchdog cron reaps orphans (stale heartbeat / pod EXITED w/o webhook), exactly as `runFinetuneWatchdog` does today.

**Where state lives:** run/registry/checkpoint/cluster metadata + metrics → Supabase (`inference` schema); live heartbeat snapshots → Upstash (90s TTL, then promoted to Postgres on ping); checkpoints/artifacts/datasets → R2; meter state → `billing.active_*`; BullMQ queues → Redis.

## 4. Data model

Migration `20260616000001_training_platform.sql` (matches the repo's `IF NOT EXISTS` + RLS-via-`DO $$` + `inference`/`billing` schema split style).

```sql
-- ── Core run table (generalizes inference.finetunes; finetunes kept as a
--     compatible VIEW over training_runs WHERE run_type IN ('lora','qlora','full')) ──
CREATE TYPE inference.training_run_type AS ENUM
  ('lora','qlora','full','dpo','orpo','kto','grpo','rft','cpt','distill');

CREATE TABLE IF NOT EXISTS inference.training_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  run_type           inference.training_run_type NOT NULL,
  base_model_id      TEXT NOT NULL,
  parent_run_id      UUID REFERENCES inference.training_runs(id), -- lineage (distill/continue)
  method_config      JSONB NOT NULL DEFAULT '{}',  -- hyperparams + grader/reward cfg + node_count
  dataset_url        TEXT NOT NULL,
  validation_dataset_url TEXT,
  gpu_sku            TEXT NOT NULL,
  node_count         INTEGER NOT NULL DEFAULT 1 CHECK (node_count >= 1),
  cluster_id         UUID,                          -- set for multi-node runs
  status             TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','preparing','running','completed','failed','cancelled')),
  -- live progress (already proven on finetunes)
  current_step INTEGER, max_steps INTEGER, current_epoch NUMERIC(10,4),
  latest_loss NUMERIC(12,6), reward_mean NUMERIC(12,6), last_heartbeat_at TIMESTAMPTZ,
  hourly_cost_cents  INTEGER,                       -- per node; × node_count at meter time
  cost_cents         INTEGER,
  runpod_job_id      TEXT, bullmq_job_id TEXT,
  output_model_id    UUID,                          -- registry version produced
  training_log_url   TEXT, error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_training_runs_queued ON inference.training_runs(created_at)
  WHERE status='queued';
CREATE INDEX IF NOT EXISTS idx_training_runs_org ON inference.training_runs(org_id, created_at DESC);

-- ── Experiment metrics (high-cardinality time series; partition monthly like usage) ──
CREATE TABLE IF NOT EXISTS inference.training_metrics (
  run_id UUID NOT NULL REFERENCES inference.training_runs(id) ON DELETE CASCADE,
  step   INTEGER NOT NULL,
  ts     TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL                            -- {loss, reward, grad_norm, lr, gpu_util,...}
) PARTITION BY RANGE (ts);                          -- pre-create 8 months, as usage/audit_log do

-- ── Model registry + versions + checkpoints (lineage) ──
CREATE TABLE IF NOT EXISTS inference.registry_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, UNIQUE(org_id, name),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inference.registry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES inference.registry_models(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source_run_id UUID REFERENCES inference.training_runs(id),
  artifact_format TEXT NOT NULL DEFAULT 'safetensors'
                  CHECK (artifact_format IN ('safetensors','lora','gguf','awq','gptq','fp8')),
  r2_uri TEXT NOT NULL, size_bytes BIGINT, stage TEXT NOT NULL DEFAULT 'none'
                  CHECK (stage IN ('none','staging','production','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(model_id, version)
);
CREATE TABLE IF NOT EXISTS inference.checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES inference.training_runs(id) ON DELETE CASCADE,
  step INTEGER NOT NULL, r2_uri TEXT NOT NULL, size_bytes BIGINT,
  is_best BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Reservable clusters (own-fleet capacity) ──
CREATE TABLE IF NOT EXISTS inference.training_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  node_sku TEXT NOT NULL, node_count INTEGER NOT NULL CHECK (node_count >= 2),
  interconnect TEXT NOT NULL DEFAULT 'infiniband',
  state TEXT NOT NULL DEFAULT 'reservation'
        CHECK (state IN ('reservation','provisioning','ready','running','releasing','released')),
  hourly_cents_per_node INTEGER NOT NULL,
  auto_release_at TIMESTAMPTZ, scheduler_ref TEXT,  -- slurm job id / instant-cluster id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), released_at TIMESTAMPTZ
);
```

**RLS** (every table): `ENABLE ROW LEVEL SECURITY`; `GRANT SELECT TO authenticated`, `ALL TO service_role`; member-scoped read policy via the existing `inference.is_org_member(org_id)` helper; service-role full policy — created inside `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` exactly like `20260615000002`.

**Billing tables / keys.** Add `active_training_cluster` to the spine (reserved clusters are *uptime*-metered like compute). Per-run training is **usage-event metered** (terminal charge on completion, like `inference_finetune`), so it does **not** get an `active_*` row — only the long-lived reservable cluster does:
```sql
CREATE TABLE IF NOT EXISTS billing.active_training_cluster (LIKE billing.active_compute INCLUDING ALL);
-- and append 'active_training_cluster' to GRACE_SERVICE_TABLES in lib/billing/grace/constants.ts
```
New `transactions.service_type` values (extend the allowlist migration pattern `20260615000012`): `inference_training`, `inference_quant`, `inference_cluster`, `inference_registry_storage`. New `product_type` enum values (pattern `20260615000014`) for the dashboard.

## 5. API surface

**Customer `/v1/*` (gateway).** Read-only training control + metrics ingest; heavy launches go through the dashboard API (long-lived, Workers-inappropriate). Routes added to the authenticated `v1` group in `workers/inference/src/index.ts`:
- `POST /v1/runs/{id}/metrics` — push metrics from any compute (incl. BYO cluster).
- `GET /v1/runs/{id}` — status + cost-so-far.
- `POST /v1/registry/{model}/{version}:deploy` — promote a version to managed serving.

**Dashboard `/api/inference/*` (control plane).**

`POST /api/inference/training/runs`
```json
{ "run_type": "grpo", "base_model": "qwen/qwen-3-8b-instruct",
  "dataset_url": "ahura://datasets/ds_123",
  "method_config": { "node_count": 1, "gpu_sku": "H200-141GB",
    "grader": { "type": "json_schema", "schema_ref": "sch_9" },
    "kl_coef": 0.04, "group_size": 8 } }
```
→ `201 { "run_id": "run_abc", "status": "queued", "estimated_min_cost_usd": 4.20 }`

`GET /api/inference/training/runs/run_abc`
```json
{ "run_id": "run_abc", "run_type": "grpo", "status": "running",
  "progress": { "current_step": 340, "max_steps": 1000,
    "latest_loss": 0.83, "reward_mean": 0.61 },
  "cost_so_far_usd": 2.10, "log_url": null }
```

`POST /api/inference/training/quantize`
```json
{ "source": { "model": "mdl_42", "version": 3 }, "format": "awq", "bits": 4 }
```
→ `202 { "job_id": "qz_77", "status": "queued" }`

`POST /api/inference/training/clusters` (reserve)
```json
{ "node_sku": "B300-192GB", "node_count": 8, "interconnect": "infiniband",
  "hold_hours": 6 }
```
→ `201 { "cluster_id": "cl_5", "state": "provisioning", "hourly_usd": 124.00 }`

`POST /api/inference/registry/{model}/versions/{v}/promote` → `{ "stage": "production" }`
`GET  /api/inference/registry/{model}` → versions + lineage tree
`GET  /api/inference/training/runs/run_abc/metrics?metric=reward&from_step=0` → run-compare series

All customer-facing responses pass through `customerSafeErrorMessage()`; no `runpod_job_id`, `scheduler_ref`, or SKU-vendor strings are ever serialized to these surfaces.

## 6. Code sketches

**(a) Gateway Hono route — metrics ingest → CF Queue** (matches `workers/inference/src/routes/*.ts`):
```ts
// workers/inference/src/routes/run-metrics.ts
import type { Context } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export async function pushRunMetrics(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const auth = c.var.auth;                    // populated by authMiddleware
  const runId = c.req.param("id");
  const body = await c.req.json<{ step: number; metrics: Record<string, number> }>();
  if (!Number.isInteger(body?.step) || typeof body?.metrics !== "object") {
    return c.json({ error: { message: "step (int) and metrics (object) required",
      type: "invalid_request", code: "invalid_request",
      request_id: c.get("requestId") } }, 400);
  }
  // Non-blocking enqueue — same waitUntil + CF Queue pattern as usage/audit events.
  c.executionCtx.waitUntil(
    c.env.TRAINING_METRICS_QUEUE.send(
      { orgId: auth.orgId, runId, step: body.step, ts: Date.now(), metrics: body.metrics },
      { contentType: "json" }
    )
  );
  return c.body(null, 202);
}
```

**(b) Runner job handler — quantization job** (mirrors `ft-runner/src/lifecycle.ts` claim + sanitized-error discipline):
```ts
// workers/training-runner/src/quant-lifecycle.ts
export async function runQuantJob(deps: QuantDeps, bullJob: Job<{ jobId: string }>) {
  const { supabase, runpod, log, env } = deps;
  const { jobId } = bullJob.data;
  // Atomic claim — only one replica moves queued → preparing
  const { data: job } = await supabase.schema("inference").from("quant_jobs")
    .update({ status: "preparing", started_at: new Date().toISOString() })
    .eq("id", jobId).eq("status", "queued")
    .select("id, org_id, source_r2_uri, format, bits, gpu_sku").maybeSingle();
  if (!job) { log.info({ jobId }, "not queued — skipping"); return; }
  try {
    const pod = await runpod.createPod({                 // small GPU; llm-compressor/AutoAWQ image
      jobId, imageUri: env.quantImageUri, gpuSku: job.gpu_sku,
      args: ["--src", job.source_r2_uri, "--format", job.format, "--bits", String(job.bits),
             "--out", `r2://ahura-ft-checkpoints/${job.org_id}/quant/${jobId}/`],
      webhookUrl: `${env.controlPlaneUrl}/api/inference/training/quant/${jobId}/webhook`,
      webhookSecret: env.ftWebhookSecret, r2: env.r2,
    });
    await supabase.schema("inference").from("quant_jobs")
      .update({ status: "running", runpod_job_id: pod.podId,
                hourly_cost_cents: Math.round((pod.hourlyCostUsd ?? 0) * 100) })
      .eq("id", jobId).eq("status", "preparing");
    await monitorUntilDone(deps, jobId, pod.podId, Date.now(), log); // reuse shared monitor
  } catch (err) {
    log.error({ err: String(err).slice(0, 1000) }, "quant provision failed");
    await supabase.schema("inference").from("quant_jobs").update({
      status: "failed",
      error_message: "Could not start quantization. Try again in a moment.", // vendor-neutral
      completed_at: new Date().toISOString(),
    }).eq("id", jobId).in("status", ["preparing", "queued"]);
    throw err;
  }
}
```

**(c) Billing integration — terminal training charge** (clone of `lib/inference/finetune-billing.ts`, node-aware):
```ts
// lib/inference/training-billing.ts
export async function chargeTrainingUsage(
  supabase: ServiceClient, orgId: string, runId: string, runName: string,
  hourlyCentsPerNode: number, nodeCount: number, elapsedSeconds: number,
): Promise<void> {
  const cents = Math.ceil((hourlyCentsPerNode * Math.max(1, nodeCount) * Math.max(0, elapsedSeconds)) / 3600);
  if (cents <= 0) return;
  const usd = cents / 100;
  try {
    const { data: org } = await supabase.schema("inference").from("orgs")
      .select("billing_user_id, owner_user_id").eq("id", orgId).maybeSingle();
    const payer = org?.billing_user_id || org?.owner_user_id;
    if (!payer) { console.error(`[training charge] no payer org ${orgId} run ${runId}`); return; }
    const newBalance = await Billing.deduct(payer, usd);           // atomic, same spine path
    const end = new Date(), start = new Date(end.getTime() - elapsedSeconds * 1000);
    await Billing.save_transaction({
      userId: payer, amount: usd, status: "completed", type: "usage",
      balanceAfter: typeof newBalance === "number" ? newBalance : null,
      serviceId: runId, serviceType: "inference_training",
      periodStart: start.toISOString(), periodEnd: end.toISOString(),
      description: `Training: ${runName}`,
      metadata: { node_count: nodeCount, gpu_hours: Number(((elapsedSeconds * nodeCount) / 3600).toFixed(4)) },
    });
  } catch (e) {
    console.error(`[training charge] failed org ${orgId} run ${runId}:`, e instanceof Error ? e.message : e);
  }
}
```
Caller gates this on winning the atomic terminal transition (webhook `update ... .in("status", ["preparing","running"])`), guaranteeing single execution — identical to the FT path.

## 7. Billing

| Service | Unit | Spine enrollment |
|---|---|---|
| Full FT / DPO / ORPO / CPT / RFT / GRPO | **per-GPU-second** = `ceil(hourly_cost_cents × node_count × elapsed / 3600)` | **Usage-event** (terminal charge on webhook via `chargeTrainingUsage`), `service_type='inference_training'`. No `active_*` row (jobs are bounded). |
| Distillation | teacher tokens **+** student GPU-seconds | Teacher loops through `/v1` → normal per-token usage event; student → `inference_training`. |
| Quantization | **per-job** (flat by source size band) or short GPU-seconds | Usage-event, `service_type='inference_quant'`. |
| Reserved cluster | **per-node-hour while reserved** (held even if idle) | `billing.active_training_cluster` (uptime meter, hourly `bill_service_cycle_atomic`) → 7-day grace → `releasing` → release. |
| Checkpoint / artifact storage | **per-GB-month** | `active_inference_vector`-style storage meter (reuse the vector-storage billing module pattern) keyed on registry size_bytes rollup. |
| Experiment tracking | **free** (loss-leader; drives stickiness per the gap analysis) | none. |

**Markup:** the gap analysis flags inference at 0% markup; training is the right place to introduce a non-zero margin because it's owned-substrate (we control unit cost). Rates live in a `platform_settings`-style table (pattern `20260615000015`) so margin is an admin toggle, not a code deploy.

**Spend-cap interaction:** pre-flight `estimated_min_cost` is checked against balance + the key's `monthly_budget_cents`/`hard_cap_cents` at launch (the slice-1 pre-flight-guard pattern). Long runs additionally **stream-meter** via the 5-min `training-meter` cron so a multi-day run can't blow past `hard_cap` between launch and completion — the meter pauses (cancels) the run on cap breach, then the grace/notification outbox fires. This closes the metering gap the memory flags for FT/serving.

## 8. Delivery plan

Slices are independently shippable. Estimates assume the FT substrate as the baseline.

- **Slice 0 — schema + runner generalization (2.5 ew).** `training_runs` migration; `ft-runner` → `training-runner` (claimer on `training_runs`, `lifecycle` branches on `run_type`); `finetunes` becomes a view. Net-zero customer change; existing LoRA keeps working. *Dependency: none.*
- **Slice 1 — full FT + DPO/ORPO (2 ew).** Wire `run_type` `full`/`dpo`/`orpo` to axolotl configs; multi-GPU single-node sizing; `chargeTrainingUsage`. *Dep: slice 0.*
- **Slice 2 — experiment tracking (2.5 ew).** `training_metrics` (partitioned) + CF Queue metrics consumer + `/v1/runs/{id}/metrics` + dashboard live curves + run-compare. *Dep: slice 0.*
- **Slice 3 — registry + checkpoints (2 ew).** `registry_models`/`versions`/`checkpoints`, lineage UI, promote/rollback, one-click deploy to managed serving (reuses existing serving-pod path), storage meter. *Dep: slice 0.*
- **Slice 4 — quantization (1.5 ew).** `quant_jobs` + `quant-runner` queue + GGUF/AWQ/FP8 image + `inference_quant` billing. *Dep: slice 3 (writes to registry).*
- **Slice 5 — RFT/GRPO (3 ew).** Grader sidecar container (regex/json-schema/code-exec/LLM-judge), reward streaming, KL/group config. The differentiator. *Dep: slices 0,2.*
- **Slice 6 — continued pretraining (1 ew).** Mostly config + long-run tolerances + stream-metering hardening. *Dep: slice 1.*
- **Slice 7 — distillation (1.5 ew).** Teacher driver looping through `/v1` with internal key → dataset → student FT. *Dep: slices 1,3 + Inference cluster (gateway).*
- **Slice 8 — multi-node clusters + scheduler (4 ew, gated).** New `cluster-scheduler` deployable; `active_training_cluster` meter; RunPod Instant Clusters for v1. *Dep: slices 0,1; gated on **Compliance/enterprise** cluster (reserved-capacity contracts) + the **own-fleet DPR decision**.*

**Cross-cluster dependencies:** Billing-completeness cluster (markup + stream-metering plumbing); Compliance cluster (reserved-capacity SLAs, audit retention for training data); Inference cluster (distillation teacher, registry→serving handoff).

**Cut for v1:** RFT/GRPO (slice 5 — highest eng risk), multi-node (slice 8 — gate on fleet), KTO, code-exec grader (ship json-schema/regex/LLM-judge graders first). v1 = slices 0–4 + 6 (full FT, DPO/ORPO, CPT, tracking, registry, quantization) ≈ 11.5 ew.

## 9. Risks & open questions

- **GRPO substrate maturity.** RFT/GRPO is the differentiator but the riskiest: rollout throughput, reward-hacking, grader sandboxing (code-exec graders are an RCE surface — must run isolated, network-egress-locked, never sharing the customer's pod). Mitigation: ship non-code graders first; treat code-exec as its own hardened sub-slice.
- **`finetunes` → view migration.** Existing serving-pod columns live *on* `finetunes`. Making it a view over `training_runs` risks breaking `serving-pod-billing.ts` (it `UPDATE`s `finetunes.serving_pod_state`). **Open:** keep serving columns on a sidecar table vs. a writable view vs. leave LoRA rows dual-written during transition. Lowest-risk path: additive `training_runs` + a backfill, keep `finetunes` real for one release, cut over in a follow-up.
- **Stream-metering vs. cap latency.** The 5-min meter means up to ~5 min of over-spend past `hard_cap` on a fast-burning multi-node run. **Open:** acceptable, or do we need a node-count-scaled meter cadence?
- **Reserved-cluster idle billing.** Charging for held-but-idle reserved nodes is correct economics but a support/refund magnet. **Open:** auto-release default window + clear dashboard countdown; does enterprise get postpaid reserved contracts (ties to Compliance cluster)?
- **Checkpoint storage blow-up.** Every-N-step full checkpoints of a 70B run are TB-scale in R2. Need a retention policy (keep best + last K) and explicit per-GB-month pricing visibility, or storage cost silently dwarfs compute revenue.
- **Brand-scrub on training logs.** Raw `training_log_url` artifacts can contain "RunPod", node hostnames, CUDA/driver vendor strings, IB fabric names. The log uploaded to R2 and offered for download must be scrubbed at write time (extend `customerSafeErrorMessage()` to a log-sanitizer), not just the error field.
- **Own-fleet sequencing.** Multi-node economics only work on owned B300/H200 with IB; until the Yotta DPR lands we're reselling RunPod Instant Clusters at thin/negative margin. **Open:** do we soft-launch clusters as enterprise-only/quote-based until the fleet exists, to avoid pricing a loss-leader publicly?
- **W&B displacement friction.** Customers with existing W&B pipelines won't switch trackers easily. **Open:** ship a W&B-compatible ingest shim (accept `wandb.log()` payloads at `/v1/runs/{id}/metrics`) so adoption is zero-rewrite — strong stickiness lever, small build.