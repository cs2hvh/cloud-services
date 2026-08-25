# Serverless GPU Compute & Sandboxes — Cluster Design

> AhuraCloud · principal-engineer design doc · June 2026
> Maps onto the existing 4 deployables (CF Worker gateway / Next.js control plane / k8s runners / CF cron) + one new deployable. Substrate: RunPod Serverless today, own B300/H200 (Yotta) later.

## 1. Services & customer value

This cluster ships **three distinct, separately-billable services** under one IA surface (`/services/compute` + `/v1/*` API). They share a substrate abstraction (a "GPU executor" — RunPod Serverless now, own-fleet k8s later) but are sold as three products with three pricing meters.

**1.1 Serverless GPU Functions** (`gpufn`) — Modal-style. The customer pushes a Python function (decorated, or a plain handler + `requirements.txt` / Dockerfile) and gets back an autoscaling HTTPS endpoint with **scale-to-zero**, GPU-class selection (T4/L4/A100/H100/B300), per-second billing, and cold-start mitigation (warm-pool / snapshot restore). What they buy: "run my GPU code on demand without ever touching a pod, a cluster, or a Dockerfile-to-registry pipeline." Reference points: **Modal**, **Beam**, **RunPod Serverless** (which we resell, hidden), **Replicate** custom deploys, **Baseten Chains**. This generalizes the existing `deploy-runner` BYO-model path: today BYO deploy only registers an *inference model*; gpufn exposes the same RunPod-Serverless substrate as a *generic invokable function*.

**1.2 Code-Execution Sandboxes** (`sandbox`) — E2B-style. An ephemeral, network-and-filesystem-isolated microVM/container the customer (or, critically, their **AI Agent**) spins up per session to run untrusted/model-generated code. APIs for: create session → exec command / run code → read/write files → expose a port → kill. TTL-bounded, per-second billed, optional GPU attach. What they buy: "a safe place for my agent to run the Python it just wrote." Reference points: **E2B**, **Modal Sandboxes**, **Daytona**, **Cloudflare Sandboxes**, **CodeSandbox SDK**. Strategic: this is the missing primitive behind gap-analysis item #13 (agent tools / code interpreter) — our **AI Agents product** currently has no code-execution tool. Sandboxes is the substrate that unlocks a first-party "Code Interpreter" agent tool.

**1.3 Managed GPU Notebooks** (`notebook`) — hosted Jupyter on a GPU, persisted to an R2-backed workspace volume, with idle auto-suspend (reuses the serving-pod watchdog pattern). What they buy: "a GPU JupyterLab in one click, billed by the second, that doesn't vanish my files." Reference points: **Modal notebooks**, **Google Colab/Vertex Workbench**, **Lightning AI Studios**, **Paperspace Gradient**, **SageMaker Studio**. This is the lowest-eng, highest-demo-value entry; it's effectively a long-lived sandbox with a Jupyter front door and a persistent volume.

Shared cross-cutting value: **per-second billing** (finer than the per-hour serving/GPU-IaaS meters), one unified `/v1` auth/key/spend-cap surface (reuse the gateway middleware chain), and zero infrastructure visible to the customer — they never see RunPod, k8s, or a node.

## 2. Build vs proxy

The hard constraint: **upstream names never reach the customer**. The substrate decision is therefore purely economic/operational, never branding.

| Service | v1 substrate | Decision | Justification |
|---|---|---|---|
| **GPU Functions** | **Proxy → RunPod Serverless** (brand-hidden), exactly like the existing `deploy-runner` BYO path | Proxy now, build later | RunPod Serverless already gives scale-to-zero, autoscaling workers, per-second GPU. We already operate `deploy-runner` against it (`inference.deployments` + `runpod_endpoint_id`). Building our own scale-to-zero scheduler is months of work for parity. Re-skin the existing path into a generic function invoker. Migrate to own B300/H200 fleet in Phase 14 when the Yotta DPR lands. |
| **Sandboxes** | **Build on own substrate** (no clean brand-hideable upstream) | Build | E2B is the obvious proxy candidate but (a) it's a *named third party* whose product *is* the surface — hard to scrub, and (b) sandbox isolation is security-critical and we want to own the boundary. Build on **Firecracker microVMs on the Linode k8s nodes** (gVisor as fallback for non-Firecracker hosts). RunPod *can* host a long-lived container per session but cold-start and per-session pod churn make it expensive vs. a pre-warmed Firecracker pool. So: **own pool of warm microVMs on k8s**, GPU-attach sandboxes overflow to RunPod Serverless. |
| **Notebooks** | **Build (thin) on RunPod Serverless / k8s** | Build-thin | A notebook is a long-lived sandbox + Jupyter + persistent R2 volume. CPU notebooks run in the same Firecracker pool as sandboxes; GPU notebooks are a RunPod pod (reuse GPU-IaaS `gpu_templates` images with a Jupyter entrypoint) with the serving-pod idle-watchdog. No external upstream. |

Upstream candidates considered and **rejected as primary**: **Modal** (their value *is* the dev surface; reselling it = reselling our own product), **Daytona / Coder** (heavier, self-host-oriented), **fly.io machines** (good microVM API but another named brand + egress cost). RunPod stays the GPU heavy-lift; **own k8s Firecracker pool** is the new piece we build because isolation is a security boundary we must control and the per-session economics demand pre-warming.

## 3. Architecture

Each service maps onto the existing deployables; sandboxes require **one new deployable** (`sandbox-runner` on k8s + a microVM agent), justified by the security boundary.

### 3.1 Deployable mapping

- **CF Worker gateway** (`workers/inference`): the single customer entry point for all `/v1/*` traffic — function invoke, sandbox lifecycle, notebook control. Reuses the existing middleware chain verbatim: `authMiddleware` (KV key→AuthContext) → `spendCheckMiddleware` (hard-cap) → `rateLimitMiddleware` (DO token bucket). New routes mounted on the same `v1` Hono group. The Worker stays **stateless**; it forwards to the control plane or the new sandbox data-plane. **Sandbox interactive I/O** (exec stream, terminal, file PUT/GET) is proxied straight through the Worker's `ReadableStream` SSE/WebSocket support (same mechanism as streaming chat) to the microVM's internal address — the Worker never holds session state.
- **Next.js control plane** (single Linode VM, `server.ts`): owns all CRUD + dashboard `/api/*`, enqueues build/provision work by writing Postgres rows (the claimer pattern), holds JWT-scoped management endpoints, and hosts the **cron-only internal sweep endpoints** (`/api/inference/internal/*`) the Worker cron calls. Builds (function image, notebook image) are enqueued exactly like `deployments`: write a row with `status='building'`, let a runner claim it.
- **k8s runners**: extend the runner fleet. `deploy-runner` is generalized to also handle `gpufn` build/scale/delete (it already does RunPod Serverless endpoint lifecycle). **NEW `sandbox-runner`** owns the Firecracker warm pool and notebook provisioning.
- **CF cron** (`scheduled` in the Worker): add three sweeps to the existing dispatch ladder — per-minute **sandbox/notebook idle reaper** (reuse `runServingPodWatchdog` shape → new `/api/inference/internal/sandbox-watchdog`), and the **per-second-rollup meter** runs every minute via `/api/inference/internal/compute-fn-meter` (samples live worker-seconds, charges `now - last_metered_at`, identical to `runDeploymentMeter`).
- **NEW deployable: `sandbox-runner` (k8s)** + **microVM node agent**. The runner is a BullMQ-over-Postgres claimer (mirrors `ft-runner`/`deploy-runner`): maintains a warm Firecracker pool (target N idle VMs per GPU class), allocates a VM to a session, tears it down on TTL/kill. The microVM agent is a tiny HTTP server inside each VM exposing `/exec`, `/files`, `/expose-port`, `/ping` on an internal-only address the Worker reaches via the k8s ingress. Why new and not folded into `deploy-runner`: different lifecycle (sub-second alloc vs minutes-long build), different security posture (untrusted code execution), and it must scale on its own axis (session concurrency, not build queue depth).

### 3.2 Request flow — GPU Function invoke (hot path)

1. `POST api.ahurasense.com/v1/functions/{fnId}/invoke` hits the Worker.
2. `authMiddleware` resolves key→`AuthContext` (KV, Postgres fallback); `spendCheckMiddleware` blocks if org hard-cap hit; `rateLimitMiddleware` (DO) admits.
3. Route handler reads `fn` routing (KV-cached `runpod_endpoint_id` + GPU class + cold-start policy) — fallback to `inference.compute_functions` on miss.
4. Worker forwards the invocation to the RunPod Serverless endpoint (server-side, brand-hidden), streaming the response back via `ReadableStream`. On a cold endpoint, RunPod spins a worker; the Worker surfaces a `X-Ahura-Cold-Start: true` header but **never** the upstream's name.
5. On completion, Worker enqueues a **usage event** to the existing `ahura-inference-usage` CF Queue with `{ service:'gpufn', fnId, gpuSeconds, gpuClass, orgId }`.
6. The usage consumer rolls billable GPU-seconds into a metering table; the per-minute meter cron settles charges against the balance.

State: routing in **KV** (hot) + **Postgres** `inference.compute_functions` (source of truth). Per-invocation usage in the **usage partitions** + a new `inference.compute_usage_events`. No session state in the Worker.

### 3.3 Request flow — Sandbox session

1. `POST /v1/sandboxes` (auth chain as above). Worker calls control-plane `/api/inference/internal/sandbox-alloc` (internal token) **or**, for lowest latency, the `sandbox-runner` allocator directly via internal ingress. Runner pops a warm Firecracker VM from the pool, marks `inference.sandboxes` row `status='running'`, sets `expires_at = now()+ttl`, returns `{ sandboxId, baseUrl(internal), token }`.
2. Worker returns `sandboxId` + an opaque session handle to the customer.
3. `POST /v1/sandboxes/{id}/exec` (and `/files`, `/expose-port`): Worker streams straight to the VM agent's internal address; output streams back via SSE. The Worker validates the session belongs to the caller's org (KV-cached) on every call.
4. Billing meter accrues per-second wall-clock from `started_at` while `status='running'`.
5. Teardown: explicit `DELETE`, or the per-minute **sandbox-watchdog** reaps any row past `expires_at` (atomic state flip → settle, identical idempotency gate to `settleServingPod`).

State: session metadata in Postgres `inference.sandboxes`; VM-local FS is **ephemeral** (lost on teardown) unless it's a notebook with an attached R2-synced workspace.

## 4. Data model

New tables in the `inference` schema (matching the existing convention — orgs/models/deployments/finetunes live there) plus two `billing.active_*` enrollments. RLS + grant pattern copied exactly from `20260615000002_compute_billing.sql`.

```sql
-- 20260620000001_serverless_compute.sql
-- Serverless GPU functions, sandboxes, GPU notebooks.

-- ── GPU Functions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inference.compute_functions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL,                 -- customer-facing name
  status             TEXT NOT NULL DEFAULT 'building'
                     CHECK (status IN ('building','active','paused','failed','deleting')),
  gpu_class          TEXT NOT NULL DEFAULT 'A100',  -- T4|L4|A100|H100|B300
  source_kind        TEXT NOT NULL CHECK (source_kind IN ('image','python_zip','hf')),
  source_ref         TEXT NOT NULL,                 -- OCI ref / R2 key / hf repo
  runpod_endpoint_id TEXT,                          -- upstream id, NEVER returned to customer
  min_workers        INT  NOT NULL DEFAULT 0,       -- 0 = scale-to-zero
  max_workers        INT  NOT NULL DEFAULT 5,
  idle_timeout_s     INT  NOT NULL DEFAULT 60,
  per_second_cents   NUMERIC(12,6) NOT NULL DEFAULT 0,  -- resolved from gpu_class price
  last_metered_at    TIMESTAMPTZ,                   -- meter clock (see deployments.last_metered_at)
  build_error        TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE(org_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_compute_functions_status ON inference.compute_functions(status);

-- ── Sandboxes (sessions) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inference.sandboxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'allocating'
                  CHECK (status IN ('allocating','running','stopped','failed')),
  template        TEXT NOT NULL DEFAULT 'python-3.12',
  gpu_class       TEXT,                             -- NULL = CPU-only Firecracker
  vm_node         TEXT,                             -- internal pool node (never exposed)
  internal_url    TEXT,                             -- agent address (internal ingress)
  per_second_cents NUMERIC(12,6) NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                      -- TTL; watchdog reaps past this
  stopped_at      TIMESTAMPTZ,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandboxes_reap ON inference.sandboxes(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sandboxes_org  ON inference.sandboxes(org_id);

-- ── GPU Notebooks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inference.notebooks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'stopped'
                   CHECK (status IN ('starting','running','suspended','stopped','failed')),
  gpu_class        TEXT NOT NULL DEFAULT 'A100',
  runpod_pod_id    TEXT,                            -- upstream; never exposed
  workspace_r2_key TEXT NOT NULL,                   -- persisted volume prefix
  per_second_cents NUMERIC(12,6) NOT NULL DEFAULT 0,
  idle_timeout_s   INT NOT NULL DEFAULT 1800,
  started_at       TIMESTAMPTZ,
  last_active_at   TIMESTAMPTZ,                     -- watchdog suspends on idle
  suspended_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- ── Per-invocation usage events (gpufn + sandbox), rolled by meter ─
CREATE TABLE IF NOT EXISTS inference.compute_usage_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID NOT NULL,
  service       TEXT NOT NULL CHECK (service IN ('gpufn','sandbox','notebook')),
  service_id    UUID NOT NULL,        -- fn / sandbox / notebook id
  gpu_class     TEXT,
  gpu_seconds   NUMERIC(14,3) NOT NULL DEFAULT 0,
  cents         NUMERIC(12,6) NOT NULL DEFAULT 0,
  billed        BOOLEAN NOT NULL DEFAULT false,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compute_usage_unbilled
  ON inference.compute_usage_events(billed, occurred_at) WHERE billed = false;
```

**Billing-spine enrollment** — long-lived resources (notebooks, always-on `min_workers>0` functions) enroll in a new **`billing.active_compute_fn`** table keyed on a stable UUID, added to `GRACE_SERVICE_TABLES` (the `constants.ts` array — appended like `active_gpu_pods` was) so they get the 7-day grace → auto-delete lifecycle. Pure scale-to-zero functions and ephemeral sandboxes are **usage-event metered** (no `active_*` row) — they can't "owe rent" because they vanish; they're settled per-session like `settleServingPod`. Mirror the compute-billing migration's RLS exactly: `ENABLE ROW LEVEL SECURITY`, `GRANT SELECT TO authenticated` / `ALL TO service_role`, policy `auth.uid() = user_id` for select + `auth.role()='service_role'` for all. The `inference.*` tables follow the org-scoped RLS the existing inference tables use (org membership check), service-role for runner writes.

## 5. API surface

### Customer `/v1/*` (CF Worker gateway, API-key auth)

```
POST   /v1/functions                  create+build a gpu function
GET    /v1/functions/{id}             status (no upstream ids leaked)
POST   /v1/functions/{id}/invoke      synchronous/streaming invoke
PATCH  /v1/functions/{id}             update autoscale (min/max/idle/gpu)
DELETE /v1/functions/{id}

POST   /v1/sandboxes                  allocate a session
POST   /v1/sandboxes/{id}/exec        run a command (streams stdout/stderr)
POST   /v1/sandboxes/{id}/run         run code in template runtime
PUT    /v1/sandboxes/{id}/files/*     write file
GET    /v1/sandboxes/{id}/files/*     read file
POST   /v1/sandboxes/{id}/expose      open a port -> ephemeral https url
DELETE /v1/sandboxes/{id}             kill

POST   /v1/notebooks                  create
POST   /v1/notebooks/{id}/start       resume from suspended/stopped
POST   /v1/notebooks/{id}/suspend
DELETE /v1/notebooks/{id}
```

**Invoke request/response:**
```jsonc
// POST /v1/functions/fn_8a3.../invoke
{ "input": { "prompt": "render a 1024x1024 cat" }, "timeout_s": 120 }
// 200, headers: X-Ahura-Cold-Start: false, X-Ahura-Cost-Cents: 4.10
{ "id": "run_91c...", "status": "completed",
  "output": { "image_url": "https://files.ahurasense.com/..." },
  "gpu_seconds": 5.4, "gpu_class": "A100" }
```

**Sandbox create + exec:**
```jsonc
// POST /v1/sandboxes  -> 201
{ "id": "sbx_4f2...", "status": "running",
  "template": "python-3.12", "expires_at": "2026-06-20T10:30:00Z" }

// POST /v1/sandboxes/sbx_4f2.../exec  (SSE stream)
{ "cmd": "python -c 'print(2+2)'" }
// event: stdout  data: {"chunk":"4\n"}
// event: exit    data: {"code":0,"duration_ms":210}
```

### Dashboard `/api/*` (Next.js control plane, JWT-auth)

```
GET    /api/compute/functions               list with live status + spend
POST   /api/compute/functions               create (writes row status='building')
GET    /api/compute/functions/{id}/logs     build + invoke logs
GET    /api/compute/sandboxes               active sessions + cost so far
GET    /api/compute/notebooks
POST   /api/compute/notebooks/{id}/launch   returns signed Jupyter url

-- cron-only internal (X-Ahura-Internal-Token, mirrors existing sweeps)
POST   /api/inference/internal/sandbox-watchdog     reap expired sandboxes/notebooks
POST   /api/inference/internal/compute-fn-meter      settle gpufn worker-seconds
POST   /api/inference/internal/sandbox-alloc         pool allocation (or runner-direct)
```

All customer-facing responses pass through `customerSafeErrorMessage()` (`lib/inference/error-messages.ts`) so no upstream/host/node identifier leaks — same discipline as the rest of the gateway.

## 6. Code sketches

**6.1 Gateway Hono route — function invoke** (`workers/inference/src/routes/functions.ts`), following the existing route+usage-enqueue style:

```ts
import type { Context } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { resolveFunctionRoute } from "../lib/fn-routing.ts"; // KV->PG fallback

export async function invokeFunction(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>
) {
  const auth = c.var.auth;                 // populated by authMiddleware
  const fnId = c.req.param("id");
  const route = await resolveFunctionRoute(c.env, auth.orgId, fnId);
  if (!route) return c.json({ error: { message: "Function not found", type: "not_found" } }, 404);

  const body = await c.req.json().catch(() => ({}));
  const startedAt = Date.now();

  // Forward to the brand-hidden GPU executor. Stream the response through.
  const upstream = await fetch(route.invokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.env.EXECUTOR_TOKEN}` },
    body: JSON.stringify({ input: body.input, timeout_s: body.timeout_s ?? 120 }),
  });
  c.header("X-Ahura-Cold-Start", upstream.headers.get("x-cold") === "1" ? "true" : "false");

  const result = (await upstream.json()) as { gpu_seconds: number; output: unknown; status: string };
  const cents = Math.ceil(result.gpu_seconds * route.perSecondCents * 100) / 100;
  c.header("X-Ahura-Cost-Cents", cents.toFixed(2));

  // Usage event on the existing queue — consumer rolls into compute_usage_events.
  c.executionCtx.waitUntil(
    c.env.USAGE_QUEUE.send({
      service: "gpufn", orgId: auth.orgId, serviceId: fnId,
      gpuClass: route.gpuClass, gpuSeconds: result.gpu_seconds, cents,
      requestId: c.get("requestId"), occurredAt: new Date().toISOString(),
    })
  );
  return c.json({ id: c.get("requestId"), status: result.status, output: result.output,
                  gpu_seconds: result.gpu_seconds, gpu_class: route.gpuClass },
                upstream.ok ? 200 : 502);
}
```

**6.2 `sandbox-runner` job handler — warm-pool alloc** (`workers/sandbox-runner/src/lifecycle.ts`), mirroring the `deploy-runner` claimer/lifecycle pattern:

```ts
import type { RunnerCtx } from "./types.js";

export interface SandboxJob { sandboxId: string; action: "alloc" | "teardown"; }

export async function runSandboxJob(ctx: RunnerCtx, job: { data: SandboxJob }) {
  const { supabase, pool, logger } = ctx;
  const { sandboxId, action } = job.data;

  if (action === "alloc") {
    const vm = await pool.acquireWarm();          // pops a pre-booted Firecracker VM
    // Atomic transition: only an 'allocating' row matches -> idempotency gate.
    const { data, error } = await supabase
      .schema("inference").from("sandboxes")
      .update({ status: "running", vm_node: vm.node, internal_url: vm.url,
                started_at: new Date().toISOString() })
      .eq("id", sandboxId).eq("status", "allocating")
      .select("id").maybeSingle();
    if (error || !data) { await pool.release(vm); return; }  // lost race -> return VM
    await pool.refillAsync();                       // keep N warm in background
    logger.info({ sandboxId, node: vm.node }, "sandbox allocated");
  } else {
    const { data } = await supabase.schema("inference").from("sandboxes")
      .update({ status: "stopped", stopped_at: new Date().toISOString() })
      .eq("id", sandboxId).in("status", ["running", "allocating"])
      .select("vm_node, internal_url").maybeSingle();
    if (data?.vm_node) await pool.destroy(data.vm_node);   // wipe FS, reclaim
  }
}
```

**6.3 Per-second settle — sandbox** (`lib/inference/sandbox-billing.ts`), copying the `settleServingPod` idempotency-on-state-transition + `Billing.deduct`/`save_transaction` shape:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { Billing } from "@/lib/supabase/queries/billing";

export async function settleSandbox(supabase: SupabaseClient, sandboxId: string) {
  const stoppedAt = new Date().toISOString();
  const { data: row } = await supabase
    .schema("inference").from("sandboxes")
    .update({ status: "stopped", stopped_at: stoppedAt })
    .eq("id", sandboxId).in("status", ["running", "allocating"])   // win == owns the bill
    .select("org_id, started_at, per_second_cents").maybeSingle<{
      org_id: string; started_at: string | null; per_second_cents: number; }>();
  if (!row?.started_at) return { settled: false, chargedUsd: 0 };

  const secs = Math.max(0, (Date.parse(stoppedAt) - Date.parse(row.started_at)) / 1000);
  const cents = Math.ceil(secs * Number(row.per_second_cents));
  if (cents <= 0) return { settled: true, chargedUsd: 0 };

  const { data: org } = await supabase.schema("inference").from("orgs")
    .select("billing_user_id, owner_user_id").eq("id", row.org_id).maybeSingle<any>();
  const payer = org?.billing_user_id || org?.owner_user_id;
  if (!payer) return { settled: true, chargedUsd: 0 };

  const usd = cents / 100;
  const balanceAfter = await Billing.deduct(payer, usd);
  await Billing.save_transaction({
    userId: payer, amount: usd, status: "completed", type: "usage",
    balanceAfter: typeof balanceAfter === "number" ? balanceAfter : null,
    serviceId: sandboxId, serviceType: "compute_sandbox",
    periodStart: row.started_at, periodEnd: stoppedAt,
    description: "Sandbox session", metadata: { seconds: Number(secs.toFixed(2)) },
  });
  return { settled: true, chargedUsd: usd };
}
```

(`compute_sandbox`, `compute_fn`, `compute_notebook` must be added to the `transactions.service_type` allowlist — same migration style as `20260615000012_extend_transactions_service_type_allowlist.sql`.)

## 7. Billing

| Service | Meter | Unit | Enrollment |
|---|---|---|---|
| **GPU Functions** | per **GPU-second** of worker execution, by GPU class (T4 cheapest → B300 priciest) | resolved `per_second_cents` from a `gpu_class` price table; nonzero **markup over RunPod cost** (per the billing-completeness gap #7 — unlike inference's current 0%) | scale-to-zero fns = **usage-event** (`compute_usage_events`, settled by `compute-fn-meter`). `min_workers>0` (always-on) fns = **`billing.active_compute_fn`** row → hourly meter on the idle min-worker floor **+** usage events on top. |
| **Sandboxes** | per **wall-clock second** while `status='running'`; GPU-attached sandboxes at the GPU-class second-rate, CPU-only at a CPU second-rate | settled by `settleSandbox` on teardown (explicit or watchdog) | **usage-event / per-session settle** — ephemeral, never enrolls in grace. Pre-flight balance + per-org concurrent-sandbox quota guard at alloc time (reuse the inference pre-flight balance guard, slice-1 pattern). |
| **Notebooks** | per **GPU-second running**, **$0 while suspended** (volume storage billed separately per GB-mo, like custom-image storage) | **`billing.active_compute_fn`** (or its own `active_notebook`) row → hourly meter + grace lifecycle; suspend zeroes the running meter but keeps the storage line. Added to `GRACE_SERVICE_TABLES`. |

**Spend-cap interaction:** the gateway's existing `spendCheckMiddleware` (org monthly hard-cap from KV) blocks function invoke and sandbox alloc *before* work starts — same gate as chat. The per-key `monthly budget + hard cap` and `allowed models` scoping extend to a new per-key **`allowed_compute`** flag so a scoped key can be barred from spinning GPU. Because functions/sandboxes can burn money fast (a runaway GPU loop), we add a **per-org concurrent GPU-second rate guard** in the DO rate-limiter (new bucket) on top of the monthly cap — the monthly cap is too coarse to stop a single bad agent loop. The meter is **conservative**: like `last_metered_at` on deployments, it only ever bills `now - last_metered_at`, so a missed cron tick under-bills rather than double-bills, and pre-flight balance is re-checked before each meter advance (the H1 fix in `20260615000010`).

**Brand-scrub:** all transaction descriptions are customer-safe ("Sandbox session", "GPU function execution") — no RunPod/node identifiers in `metadata`. Internal logs keep upstream ids.

## 8. Delivery plan

Slices are independently shippable. Estimates assume one senior eng + reuse of existing runner/gateway/billing scaffolding.

- **Slice 0 — substrate abstraction + price table (1.5 wk).** Extract a `GpuExecutor` interface over the existing `deploy-runner` RunPod-Serverless calls; add `gpu_class → per_second_cents` price table + markup. No customer surface. *Dependency: none.* Unblocks all three.
- **Slice 1 — GPU Functions v1 (3 wk).** Migration (`compute_functions` + `compute_usage_events`); generalize `deploy-runner` to build/scale function endpoints; gateway `/v1/functions` CRUD + invoke route (sketch 6.1); `compute-fn-meter` cron sweep; usage-consumer rollup; dashboard list/create/logs. **v1 cut:** image/HF source only (no Python-zip auto-build — that needs an OCI builder we don't have, same constraint that rejected Truss); no warm-pool snapshot (accept RunPod cold-start, just surface the header). *Dependency: Slice 0.*
- **Slice 2 — Sandboxes core (4 wk).** **NEW `sandbox-runner` deployable** + Firecracker microVM agent + warm pool (sketch 6.2); `sandboxes` migration; gateway exec/files/expose routes (stream-through); `settleSandbox` (sketch 6.3) + `sandbox-watchdog` cron; per-org concurrency quota. **v1 cut:** CPU-only sandboxes first (GPU-attach in Slice 4); gVisor-only if Firecracker-on-k8s proves slow; no port-expose in v1 (exec+files only). *Dependency: Slice 0; the new deployable is the long pole.*
- **Slice 3 — GPU Notebooks (2 wk).** `notebooks` migration; reuse GPU-IaaS `gpu_templates` image + Jupyter entrypoint; reuse serving-pod idle-watchdog for suspend; R2 workspace sync; signed-Jupyter-url launch. *Dependency: Slice 0; reuses Slice 2's watchdog wiring.*
- **Slice 4 — GPU sandboxes + Agents code-interpreter tool (2 wk).** GPU-attach for sandboxes (overflow to RunPod Serverless); wire a first-party **Code Interpreter** tool into the AI Agents product calling `/v1/sandboxes` internally. **High strategic value** — closes gap #13. *Dependency: Slices 2 + the Agents/tools cluster.*
- **Slice 5 — Own-fleet migration (defer to post-Yotta, ~3 wk).** Point `GpuExecutor` at the B300/H200 k8s fleet for functions/notebooks; keep RunPod as overflow. *Dependency: Yotta DPR approved + fleet cluster.*

**Cross-cluster dependencies:** billing-completeness cluster (#7) for the markup price table + service_type allowlist; Agents/tools cluster (#13) for Slice 4; the future own-fleet cluster (#14) for Slice 5. **Total to a sellable v1 (Slices 0–3): ~10.5 eng-weeks.**

## 9. Risks & open questions

1. **Sandbox isolation is a security boundary we now own.** Untrusted, model-generated code executes inside our k8s nodes. Firecracker + seccomp + no-egress-by-default network policy is the plan, but a microVM escape is a platform-wide breach. **Open:** Firecracker on Linode k8s (nested virt support?) vs gVisor fallback vs a dedicated bare-metal pool. Must get a security review before Slice 2 ships. This is the single biggest risk in the cluster.
2. **Cold-start while proxying RunPod.** We can surface `X-Ahura-Cold-Start` but we don't control RunPod's warm-pool depth, so p99 invoke latency is partly out of our hands until own-fleet. Risk to the Modal-parity story. **Mitigation:** support `min_workers>0` (paid warm floor) as the escape hatch; snapshot-restore is a Slice-5 own-fleet feature.
3. **Runaway GPU spend.** A single agent loop can burn hundreds of GPU-seconds before the monthly cap notices. The new DO concurrent-GPU-second guard + pre-flight balance recheck mitigate, but per-org default quotas need tuning and a hard per-session GPU-second ceiling. **Open:** default ceilings per plan tier.
4. **Worker as session I/O proxy.** Streaming exec/terminal through the CF Worker to internal microVMs adds a hop and couples session liveness to Worker connection limits. **Open:** is a direct (signed-url) customer→ingress path acceptable, or does everything stay behind the Worker for the brand-scrub guarantee? (Leaning: stay behind the Worker — direct ingress risks leaking node identity.)
5. **New deployable operational cost.** `sandbox-runner` + microVM agent is real new surface to run, monitor, and secure on a 2-node k8s cluster already running ft-runner/deploy-runner. Pool sizing (warm VM count vs idle cost) is an economics tuning problem with no clean default.
6. **Per-second metering precision vs cron granularity.** The meter runs per-minute but bills per-second from timestamps (`now - last_metered_at`), which is correct, but very short sandboxes (<1s) round up to a 1-second minimum — confirm that's the intended floor and document it. Reuse the `last_billed_at` precision fix (`20260615000007`).
7. **Brand-scrub on a richer surface.** Functions/sandboxes expose logs, error traces, and stack traces from customer code that may *contain* upstream hostnames/IPs injected by the runtime. `customerSafeErrorMessage()` covers our errors but **not** arbitrary stdout from customer code — need a log-scrubbing pass on streamed sandbox output, or an explicit "we don't scrub your program's own output" boundary. **Open question, must resolve before GA.**
8. **Python-zip auto-build gap.** Without an OCI builder, v1 functions require a pre-built image or HF repo — weaker than Modal's "just push a .py." Acquiring a build path (kaniko/buildkit on k8s) is a prerequisite for true Modal parity and is shared with the BYO-deploy Truss limitation; worth a joint decision with the deploy cluster.