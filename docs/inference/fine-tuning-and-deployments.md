# Fine-Tuning & Deployments — Architecture, Operations & Runbook

End-to-end reference for the two GPU-backed inference products:

1. **Fine-Tuning** — train LoRA / qLoRA / full adapters on open-weight bases, on a
   dedicated RunPod **pod**. Optional **managed serving** (Tier-1) spins up a
   per-adapter pod to serve the result.
2. **BYO Deployments** — bring a Docker image / HuggingFace repo and we provision a
   managed RunPod **Serverless endpoint** with autoscale, registered in the model
   catalog and routed through the gateway.

> Brand-scrub: customer-facing surfaces never name the upstreams (RunPod,
> HuggingFace, axolotl, vLLM, R2, Cloudflare, Linode/LKE). Server code, internal
> logs, and schema may. `customerSafeErrorMessage()` is the single sanitizer.

---

## 1. Moving parts

| Layer | What | Where |
|---|---|---|
| **Control plane** | Next.js app — API routes + dashboard UI | `app/`, `components/dashboard/inference/` |
| **FT worker** | `ahura-ft-runner` — claims FT jobs, provisions training pods, monitors | `workers/ft-runner/` (k8s on **LKE**) |
| **Deploy worker** | `ahura-deploy-runner` — claims deployments, provisions Serverless endpoints | `workers/deploy-runner/` (k8s on **LKE**) |
| **Edge / cron** | `ahura-inference-edge` — the `/v1` gateway **and** the cron scheduler | `workers/inference/` (Cloudflare Worker) |
| **Queue** | BullMQ over **standard Redis** (one queue per worker) | Redis |
| **Heartbeat store** | Upstash REST Redis (FT training liveness) | Upstash |
| **DB** | Supabase Postgres, `inference` schema (RLS) | `supabase/migrations/` |
| **Object store** | R2 — datasets in, adapters out | R2 |
| **GPU** | RunPod — **pods** (FT train + FT serve) and **Serverless endpoints** (deployments) | RunPod |
| **Training image** | `ghcr.io/hav0ky/ahura-ft-axolotl` (axolotl) | GHCR |

The control-plane app and both LKE workers all ship from the **`dev`** branch
(see §7). `ai` was merged into `dev` and is retired.

---

## 2. Fine-Tuning

### 2.1 Flow

```
Dashboard (FineTuning dialog)
  │  POST /api/inference/fine-tuning/jobs
  ▼
Control plane — validate + GUARD + insert status='queued'
  ├─ Zod: name, base, method, dataset_url, gpu_sku (verbatim RunPod gpuTypeId), hyperparams
  ├─ Base allow-list (ALLOWED_FT_BASE_MODELS)
  ├─ GPU validated against live gpu_catalog
  ├─ GPU-fit guard      → too-large / gpu-too-small (lib/inference/ft-base-models.ts)
  ├─ Gated-access guard → HF HEAD config.json with platform token (lib/inference/hf-access.ts)
  ├─ Per-org concurrency quota (3) + balance gate (≥ est. cost, floor $1)
  └─ Dataset pre-flight (lib/inference/finetune-validate.ts)
  │           │ enqueue (BullMQ) + 5s DB-poll fallback
  ▼           ▼
ahura-ft-runner (LKE, 2 replicas)
  ├─ claimer.ts   atomic UPDATE queued→preparing
  ├─ runpod.ts    createPod (gpuTypeId passthrough, axolotl image, R2 + webhook env)
  ├─ flips running, stores runpod_job_id + hourly_cost_cents
  └─ lifecycle.ts monitor loop: DB status + heartbeat (Upstash) + pod status
        │  training container POSTs heartbeats → /heartbeat (HMAC)
        ▼
Training container (RunPod pod, axolotl)
  ├─ pulls base from HF (HF_TOKEN), trains, uploads adapter to R2
  └─ HMAC POST → /api/inference/fine-tuning/jobs/[id]/webhook  {completed|failed}
        ▼
Webhook (control plane)
  ├─ eval gate + smoke test (charges GPU time even if gated/empty)
  ├─ success → register output model in inference.models
  ├─ charge cost_cents (atomic-win, exactly-once) to org payer
  └─ TERMINATE the training pod  ← teardown lives here (always-on plane)
```

Backstop: **finetune-watchdog** (cron, §6) reaps jobs stuck running/preparing
with a stale heartbeat, and zombie pods on already-terminal jobs.

### 2.2 GPU picker (catalog-driven)

The create dialog lists **every in-stock SECURE GPU** from
`/api/services/gpu/inventory` (the same live catalog the GPU-cloud deploy page
uses), in-stock first then cheapest, each showing memory + marked-up price
(`observed × 1.25`) + a stock badge. The trigger shows a compact truncating
label. The stored `gpu_sku` is the **verbatim RunPod `gpuTypeId`**
(= `gpu_catalog.runpod_gpu_id`); the worker passes it straight through with a
legacy 6-SKU map as fallback for old rows.

### 2.3 Pre-flight guards (reject before any pod spins up)

- **GPU-fit** — `ftBaseGpuFit()`. Bases marked `trainable: false` (Maverick,
  Qwen-235B, DeepSeek-671B) are rejected as "too large for a single GPU"; a base
  needing more VRAM than the chosen GPU → "pick a larger GPU". Mins are qLoRA-based
  and conservative.
- **Gated access** — gated Meta/Google bases get an authenticated HF HEAD against
  `config.json`. `denied`/`no-token` → clean 400; `unknown` (HF unreachable) does
  **not** block (the pod is the final gate). Token: `HUGGINGFACE_HUB_TOKEN` or `HF_TOKEN`.

### 2.4 Billing

- **Estimate / balance gate**: per-token (`FT_PRICE_PER_MTOK_CENTS`, keyed by base).
- **Actual charge**: `cost_cents = hourly_cost_cents × training_seconds / 3600`,
  charged once on every terminal path (success, failure, eval-gate, empty-sample)
  via an atomic-win transition. `inference_finetune` service type.
- ⚠️ **Known mismatch**: the estimate is per-token but the charge is GPU-hourly at
  **raw cost (no markup)**. Flagged for reconcile — see §10.

### 2.5 Managed serving (Tier-1, optional)

`POST /api/inference/fine-tuning/jobs/[id]/serving-pod` provisions a **dedicated
pod** per adapter, auto-stops after an idle window, and bills uptime × hourly via
`settleServingPod()` (`lib/inference/serving-pod-billing.ts`). The
**serving-pod-watchdog** cron auto-stops idle pods. See `managed-serving.md`.

---

## 3. BYO Deployments

### 3.1 Flow

```
Dashboard (Deployments dialog)
  │  POST /api/inference/deployments
  ▼
Control plane — validate + insert status='building'
  ├─ Zod: name, source (docker|huggingface; truss rejected), source_ref, gpu_sku, autoscale
  ├─ GPU validated against live gpu_catalog (verbatim gpuTypeId)
  ├─ HF token (optional) encrypted at rest with BYOK_DEK
  └─ Pre-flight (manifest / registry probe) — lib/inference/deploy-validate.ts
  │           │ enqueue (BullMQ) + 5s DB-poll fallback
  ▼           ▼
ahura-deploy-runner (LKE, 2 replicas)
  ├─ claimer  claims status='building'
  ├─ runpod.ts createEndpoint: POST /templates then POST /endpoints
  │            (gpuTypeIds passthrough, workersMin/Max, idleTimeout, flashboot)
  ├─ polls endpoint until READY (READY_TIMEOUT_MS budget)
  ├─ registers model in inference.models (serving_type='runpod_byo')
  └─ flips status='active', stores runpod_endpoint_id
        ▼
Gateway routes /v1 calls to the endpoint like any catalog model.

Scale  → POST /api/inference/deployments/[id]/scale (PATCH endpoint autoscale)
Delete → DELETE /api/inference/deployments/[id]  (status→paused, deploy-runner tears down endpoint→deleted)
```

### 3.2 GPU picker

Identical catalog-driven picker as FT. `gpu_sku` stores the verbatim gpuTypeId;
the deploy-runner passes it through to `gpuTypeIds: [...]` on the Serverless
`/endpoints` call (RunPod serverless uses the same gpuTypeId strings as pods).

### 3.3 Billing — per GPU worker-second

RunPod Serverless bills us per worker-second (always-on `min_workers` **and**
execution). Metering:

- **deployment-meter** cron (every 5 min, §6) samples each active endpoint's
  **live worker count** via the RunPod v2 health endpoint
  (`getServerlessWorkerCount()` → idle+ready+running+throttled), and charges
  `workers × resale-rate × interval-since-last-sample` to the org payer
  (`meterDeployment()`, `lib/inference/deployment-billing.ts`). `inference_deployment`
  service type. Resale rate = inventory `onDemandPerHr × 1.25`.
- Safety: first sample only seeds the clock; scaled-to-zero charges nothing; an
  unknown worker count bills nothing; interval capped (`DEPLOY_METER_MAX_INTERVAL_SEC`,
  default 3600s); `last_metered_at` advances on every path → no double-bill.
- Needs migration **20260615000005** (`deployments.last_metered_at`).

---

## 4. Design / UI

Editorial dark language (`components/dashboard/inference/chrome.tsx`): aurora +
dotted grid canvas, MONO uppercase eyebrows, Nunito titles with the last word in
accent blue `#0095FF` (no trailing dot), `Field` (MONO label) + dark
`bg-white/[0.02] border-white/[0.08]` inputs. Status pills with glow. The FT and
Deployments create/scale dialogs share the same `Field` + input chrome; the GPU
select shows a spinner while inventory loads and a compact truncating trigger
once selected.

---

## 5. Requirements & environment

### Control-plane app (Next.js)
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RUNPOD_API_KEY`,
`FT_WEBHOOK_SECRET`, `BATCH_PROCESSOR_TOKEN` (internal cron auth), `BYOK_DEK`
(HF-token encryption), `HUGGINGFACE_HUB_TOKEN`/`HF_TOKEN` (gated pre-check), `R2_*`.

### `ahura-ft-runner` (LKE)
Required: `REDIS_URL` (standard Redis, **not** Upstash REST),
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RUNPOD_API_KEY`, `CONTROL_PLANE_URL`,
`FT_WEBHOOK_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`.
Optional: `AXOLOTL_IMAGE_URI`, `RUNPOD_TEMPLATE_ID`, `HF_TOKEN`, tunables
(`MAX_CONCURRENT_JOBS`, `BOOT_GRACE_MS`, `HEARTBEAT_STALL_MS`, …). See
`workers/ft-runner/.env.example`. Loaded by `src/env.ts` — fails fast if missing.

### `ahura-deploy-runner` (LKE)
Required: `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RUNPOD_API_KEY`. Optional: `LORA_SERVING_ENDPOINT_ID`, `BYOK_DEK`,
`HF_WORKER_IMAGE` (default `runpod/worker-v1-vllm:stable`), tunables
(`READY_TIMEOUT_MS` = 30-min build budget, …). Polls DB + RunPod; **no webhook**.

### `ahura-inference-edge` (Cloudflare Worker)
Secrets (`wrangler secret put`): `CONTROL_PLANE_URL`, `BATCH_PROCESSOR_TOKEN`
(must equal the app's value), plus the gateway's own keys. Cron: `* * * * *`.

### Shared infra
A standard Redis reachable by both workers; an Upstash REST Redis (FT heartbeats);
the axolotl training image published to GHCR; the `inference` schema migrated.

---

## 6. Crons & watchdogs (all on the CF worker)

`workers/inference/src/index.ts` `scheduled()` fires every minute (wrangler cron
`* * * * *`) and dispatches by minute, hitting internal control-plane endpoints
with `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` (shared helper
`runControlPlaneSweep`):

| Sweep | Cadence | Endpoint | Does |
|---|---|---|---|
| serving-pod watchdog | every min | `/api/inference/internal/serving-pod-watchdog` | auto-stops idle FT serving pods + settles bill |
| finetune watchdog | every 5 min | `/api/inference/internal/finetune-watchdog` | reaps stale FT jobs + zombie training pods |
| **deployment meter** | every 5 min | `/api/inference/internal/deployment-meter` | bills deployments per worker-second |
| semantic-cache GC | hourly (min 0) | (internal RPC) | trims the gateway cache |

All sweeps are idempotent and internal-token-gated. They only run if
`BATCH_PROCESSOR_TOKEN` is set on **both** the worker and the app.

---

## 7. Build & deploy (GHCR → LKE)

### Image build (automatic)
GitHub Actions build + push to GHCR on every push to `ai`/`master`/**`dev`**:
`.github/workflows/ft-runner-image.yml`, `deploy-runner-image.yml`. Tags:
`:dev`, `:sha-<short>`, and **`:latest` (published from `dev`)**. Dockerfiles use
the committed `package-lock.json` + `npm ci` (deterministic — a bare
`npm install` duplicates `ioredis` and breaks `tsc`).

### LKE deploy (manual rollout — no auto-rollout operator in repo)
Both Deployments run `…:latest` with `imagePullPolicy: Always`, namespace `ahura`,
2 replicas, RollingUpdate. A fresh `:latest` does **not** restart pods on its own.

```bash
# one-time: create the secret from the template
envsubst < workers/ft-runner/k8s/secret.yaml.template     | kubectl apply -f -
envsubst < workers/deploy-runner/k8s/secret.yaml.template | kubectl apply -f -

# apply manifests
kubectl apply -f workers/ft-runner/k8s/deployment.yaml
kubectl apply -f workers/deploy-runner/k8s/deployment.yaml

# after every new :latest build → roll the pods (this is what pulls the new image)
kubectl -n ahura rollout restart deployment/ahura-ft-runner
kubectl -n ahura rollout restart deployment/ahura-deploy-runner
kubectl -n ahura rollout status  deployment/ahura-ft-runner
```

> If `kubectl get pods -A | grep -iE 'keel|argocd|flux'` returns nothing, there's
> no auto-rollout — the `rollout restart` above is required each deploy. Installing
> keel (watch `:latest`) would make it hands-off.

### Edge / cron worker
```bash
cd workers/inference
wrangler secret put CONTROL_PLANE_URL        # https://<app-host>
wrangler secret put BATCH_PROCESSOR_TOKEN    # same value as the app
wrangler deploy
```

### Control-plane app
Deploys from `dev` via your normal app pipeline (root `Dockerfile`). The
app/worker are version-coupled: the app stores the verbatim gpuTypeId in
`gpu_sku`, which only the **new** worker passes through — deploy the worker
before/with the app (the new worker stays backward-compatible with old short SKUs).

### Migrations to apply
- `20260615000005_deployment_metering.sql` — `deployments.last_metered_at` (deployment billing).
- FT cost columns already shipped earlier (`20260612000001`).

---

## 8. Runbook

```bash
# FT worker live logs (follow both replicas — a job can land on either)
kubectl logs -n ahura -l app=ahura-ft-runner -f --tail=50 --max-log-requests=10

# deploy worker
kubectl logs -n ahura -l app=ahura-deploy-runner -f --tail=50 --max-log-requests=10

# crashed pod
kubectl logs -n ahura <pod> --previous
kubectl describe pod -n ahura <pod>

# fire a cron sweep by hand (from anywhere with the token)
curl -fsS -X POST -H "X-Ahura-Internal-Token: $TOKEN" \
  https://<app-host>/api/inference/internal/deployment-meter
```

Logs are single-line pino JSON; raise detail with
`kubectl set env deployment/ahura-ft-runner -n ahura LOG_LEVEL=debug`.

**Two log streams:** the workers log *orchestration* (claim/provision/monitor);
the actual training/serving output lives on the RunPod pod and is surfaced via
the job's `training_log_url` + the dashboard row — not in `kubectl logs`.

### Common failures
| Symptom | Cause | Fix |
|---|---|---|
| Jobs stuck `queued` | ft-runner not running / no Redis | check pods + `REDIS_URL` |
| New code never deploys | `:latest` stale or pods not rolled | confirm green build, `rollout restart` |
| Image build red | duplicate `ioredis` | Dockerfile must `npm ci` from lockfile (fixed) |
| Gated job 403s | base needs HF approval; pre-check `unknown` | approve repo for the platform HF account |
| Pod runs after completion | teardown orphaned | webhook now terminates; watchdog backstops |
| Deployment free | meter not running | `wrangler deploy` edge worker + token on both sides |

---

## 9. Security
- Webhook + internal sweeps use HMAC (`FT_WEBHOOK_SECRET`) / shared
  `BATCH_PROCESSOR_TOKEN`. User-facing routes are session-authed and org-scoped.
- HF / BYO tokens encrypted at rest with `BYOK_DEK`; never returned to the client.
- Error text is sanitized (`customerSafeErrorMessage`) before reaching the customer.

## 10. Known gaps (tracked)
- **FT billing basis**: estimate per-token vs charge GPU-hourly at raw cost (no markup) — reconcile + margin decision.
- **Per-job FT webhook token**: single shared `FT_WEBHOOK_SECRET` (server-only) — could be per-job.
- **Deployment orphan reaper**: if deploy-runner teardown fails, a deleted endpoint keeps costing us (meter excludes terminal statuses) — needs a reaper sweep.
- **Deployment meter validation**: the v2-health worker-count parse is defensive but should be sanity-checked against a live endpoint before fully trusting the dollar amounts.
- `workers/*` keep copies of the GPU-SKU map (separate npm packages — a shared package would dedupe).

---

## 11. Key files
| Area | Files |
|---|---|
| FT API | `app/api/inference/fine-tuning/jobs/route.ts`, `…/[id]/route.ts`, `…/[id]/webhook/route.ts`, `…/[id]/heartbeat`, `…/serving-pod` |
| FT UI | `components/dashboard/inference/fine-tuning*.tsx` |
| FT worker | `workers/ft-runner/src/{claimer,lifecycle,runpod,heartbeat,env}.ts` |
| FT libs | `lib/inference/{ft-base-models,hf-access,finetune-validate,finetune-billing,error-messages}.ts` |
| Deploy API | `app/api/inference/deployments/route.ts`, `…/[id]/route.ts`, `…/[id]/scale` |
| Deploy UI | `components/dashboard/inference/deployments.tsx` |
| Deploy worker | `workers/deploy-runner/src/{claimer,lifecycle,runpod,env}.ts` |
| Deploy libs | `lib/inference/{deploy-runpod,deploy-validate,deployment-billing}.ts` |
| Crons | `workers/inference/src/index.ts`, `app/api/inference/internal/{finetune-watchdog,serving-pod-watchdog,deployment-meter}/route.ts` |
| Chrome | `components/dashboard/inference/chrome.tsx`, `fine-tuning-cells.tsx` |
