# AhuraCloud Cluster Design — Evals, Observability, Prompt Ops & Guardrails

This cluster turns the existing `api.ahurasense.com/v1` gateway from a "good proxy" into an **LLM operations control plane**: every request is traced, replayable, governed by versioned prompts and gateway-enforced guardrails, and provable against regression datasets. It rides almost entirely on surfaces that already exist — the CF Worker gateway, the `USAGE_EVENTS`/`AUDIT_EVENTS` CF Queue pipeline, the `inference.usage`/`inference.audit_log` partitioned tables, the ft-runner/deploy-runner k8s claimer pattern, and the `billing.active_*` + 5-minute metering cron. Almost nothing here needs new GPU capacity, which is why it is the right cluster to build *now*, ahead of the Yotta fleet.

## 1. Services & customer value

Eight distinct, separately-sellable services. Each maps to a dashboard product page under `/dashboard/observe/*`, `/dashboard/prompts/*`, `/dashboard/evals/*`, `/dashboard/guardrails/*`.

| # | Service | What the customer buys | Competitor reference |
|---|---|---|---|
| **1** | **Native tracing** | OTel-GenAI-compatible spans emitted *from the gateway itself* — no SDK to install. Every `/v1/*` call becomes a `gen_ai.*` span (model, prompt/completion tokens, TTFT, cache kind, guardrail action, cost) linkable into multi-step traces via `X-Ahura-Trace-Id`. | Langfuse, Helicone, Datadog LLM Observability, Arize Phoenix |
| **2** | **Request/response logging w/ sampling** | Full prompt+completion capture at a configurable sample rate (0–100%), per-key, ZDR-aware. Searchable, replayable into the playground. | Helicone, Langfuse, PromptLayer |
| **3** | **Prompt management** | Versioned prompts (Jinja-style variables), labels (`production`/`staging`), and *deploy-to-key* — a key resolves `X-Ahura-Prompt: support-bot@production` server-side, so prod prompts ship without a redeploy. | PromptLayer, Langfuse Prompts, Vellum |
| **4** | **Eval service** | Datasets + runs: LLM-as-judge, deterministic assertions (regex/JSON-schema/exact), and human-review queues. CLI/CI hook (`ahura evals run`) for regression gates on PRs. | OpenAI Evals, Braintrust, Langfuse Datasets, Promptfoo |
| **5** | **A/B experiments at the gateway** | Split a key's traffic across model/prompt/param variants by weight, with auto-collected per-arm cost/latency/quality. Promote a winner with one click. | LaunchDarkly AI Configs, Braintrust, Statsig |
| **6** | **Guardrails service** | Pre- and post-call enforcement at the gateway: content moderation, PII detection+redaction, jailbreak detection, and **custom policies** (regex/keyword/JSON-schema/classifier). Productizes the existing `guardrail.ts` from a single hardcoded pattern set into a per-org configurable policy engine. | Lakera Guard, Azure AI Content Safety, AWS Bedrock Guardrails, Protect AI |
| **7** | **Spend & quality analytics** | Dashboards over `inference.usage` + trace data: cost by model/key/prompt-version/experiment-arm, latency percentiles, cache savings, guardrail-block rates, eval-score trends. | Helicone dashboards, Datadog, Langfuse |
| **8** | **Alerts & webhooks** *(thin connective layer)* | Threshold alerts (error-rate, p95 latency, guardrail spike, eval-score regression) delivered to customer webhooks, reusing the existing CF-Queue webhook fan-out and spend-alert plumbing. | Helicone alerts, Datadog monitors |

The strategic value: this is the **stickiness layer**. Once a customer's prod prompts, eval suites, and dashboards live here, the gateway is no longer swappable. It also directly de-risks the *self-protection* gap on the public Agents `/api/v1/agents/{endpointId}/chat` endpoint — guardrails become a mandatory pre-filter there.

## 2. Build vs proxy

The governing principle: **own the substrate for anything touching customer prompt text** (privacy, ZDR, latency, brand-hiding) and **proxy only for heavy classifier inference we can't run cheaply at the edge**.

| Service | Decision | Justification |
|---|---|---|
| **Tracing** | **Build** (gateway-native) | Spans are derived from data the gateway already holds (`AuthContext`, usage event, timing, guardrail decision). A new `inference.trace_spans` partitioned table parallels `usage`. OTel *export* is a fan-out from the consumer, not an inbound dependency. Zero upstream. |
| **Logging + sampling** | **Build** | Sampled payloads stored in **R2** (already used for FT datasets/adapters) under `traces/{org}/{yyyy-mm}/{request_id}.json`, pointer in Postgres. Must be ours — these are raw customer prompts; routing them through a third party violates ZDR + brand-hiding. |
| **Prompt management** | **Build** | Pure control-plane CRUD + a KV-cached resolver in the Worker. No inference. Trivially ours. |
| **Eval — judge model** | **Proxy** (to the existing gateway → OpenRouter) | LLM-as-judge is just another chat completion. The eval runner calls *our own* `/v1/chat/completions`, so it inherits brand-hiding, billing, and guardrails for free. No new upstream. |
| **Eval — orchestration / human review** | **Build** | New k8s runner (`eval-runner`, mirror of ft-runner) + control-plane review UI. |
| **Guardrails — regex/keyword/schema/PII-regex** | **Build** (edge) | Runs inline in the Worker isolate (sub-ms), like today's `guardrail.ts`. PII via a curated regex pack (email, phone, SSN, card via Luhn, IBAN, API-key shapes) — deterministic, no model. |
| **Guardrails — ML moderation + jailbreak + NER-PII** | **Build on own substrate**, with a **proxy fallback for v1** | These need a small classifier (DeBERTa-class moderation, a PII NER model). Target end-state: a **dedicated serverless classifier endpoint on the existing deploy-runner → RunPod-Serverless substrate now, migrating to the B300/H200 fleet later** — exactly the "tiny model, perfect fit for existing serverless deploy substrate" the gap analysis calls out. **v1 proxy fallback:** for moderation only, an OpenAI-compatible moderation/classification call via OpenRouter, fronted by `lib/inference/branding.ts` so the upstream never surfaces. The dedicated endpoint is brand-hidden by construction (it's *our* pod), so it's the strategically correct home and where we land by Phase 3. |
| **A/B experiments** | **Build** (edge) | Deterministic hash-bucket on `X-Ahura-Trace-Id`/user in the Worker, variant config in KV. No upstream. |
| **Analytics** | **Build** | Aggregations over `inference.usage` + `trace_spans`. Postgres now; the architecture doc already flags ClickHouse/Tinybird as the year-2 analytics offload — keep schema shaped for that. |
| **Alerts/webhooks** | **Build** | Reuse the `fireSpendAlerts` → control-plane `/api/inference/internal/*` pattern verbatim. |

**Candidate brand-hidden upstreams** (never customer-visible): OpenRouter (judge + v1 moderation fallback), our own RunPod-Serverless / future Yotta fleet (dedicated classifier pods). All masked through `lib/inference/branding.ts` + `customerSafeErrorMessage()`.

## 3. Architecture

### Mapping onto the 4 existing deployables + 1 new

**(A) CF Worker gateway** — the hot path. New middleware/lib modules, mirroring the existing `middleware/` + `lib/` layout:
- `lib/prompt-resolver.ts` — resolves `X-Ahura-Prompt: name@label` → versioned template from KV (`PROMPTS` namespace, 5-min TTL like `API_KEYS`), renders variables, injects messages.
- `lib/experiment.ts` — reads experiment config from KV, hash-buckets the request, rewrites `model`/params/prompt, tags response `X-Ahura-Experiment` + `X-Ahura-Arm`.
- `lib/guardrail.ts` — **extended** from the existing file: load per-org `GuardrailPolicy` from KV (`GUARDRAILS` namespace) instead of the hardcoded `PATTERNS`; add PII redaction (rewrites outgoing body) and an optional classifier call.
- `lib/trace.ts` — builds a `TraceSpan` from `AuthContext` + usage + guardrail decision; enqueues to a new `TRACE_EVENTS` queue alongside the existing `sendUsage`.
- New consumer `consumers/trace.ts` — drains `TRACE_EVENTS`, writes `inference.trace_spans`, samples payloads to R2, and OTLP-exports spans (reusing `OTEL_EXPORTER_OTLP_HEADERS` already in `Env`).

**(B) Next.js control plane** (single Linode VM, `server.ts`) — all CRUD + dashboards:
- `/api/observe/*`, `/api/prompts/*`, `/api/evals/*`, `/api/guardrails/*`, `/api/experiments/*` route handlers (mutations call `recordAudit()` — new audit actions added to the enum).
- New internal endpoint `/api/inference/internal/eval-webhook` (cron-token auth, mirrors `spend-alert`) for eval-runner → dashboard notifications.
- On every prompt/guardrail/experiment publish, the route **writes-through to KV** so the gateway sees it within one TTL (same pattern as API-key KV cache).

**(C) k8s runners** — one **NEW deployable: `eval-runner`**, a near-exact copy of ft-runner/deploy-runner (`workers/eval-runner/`): BullMQ `Worker` on `ahura-inference-eval-runner` + a `Claimer` polling `inference.eval_runs WHERE status='queued'`. It executes dataset rows by calling our *own* gateway (judge + target model), writes per-row results, computes aggregate scores. Long-running, durable, retryable — exactly what k8s is for per `architecture.md`. The classifier deploy reuses the existing **deploy-runner** (register a `guardrail-classifier` model in `inference.models`, served via the existing managed-serving path).

**(D) cron** — two additions to the existing per-minute CF cron `scheduled()` handler:
- Eval-run reaper (re-queue stalled runs via heartbeat, same as ft-runner's `heartbeatStallMs`).
- Analytics rollup trigger (hourly) → control-plane endpoint that materializes daily aggregates.
- Guardrail-classifier pods enroll in the **existing 5-min metering cron** via a `billing.active_*` table (§7) — no new cron.

### Request flow (a governed `POST /v1/chat/completions`)

1. Existing middleware: `auth` → `spend` → `rate-limit` (unchanged).
2. **Trace init**: read/generate `X-Ahura-Trace-Id`; record `startedAt` for span timing (already present).
3. **Prompt resolve** (if `X-Ahura-Prompt`): KV lookup → render → prepend/merge messages; tag `X-Ahura-Prompt-Version`.
4. **Experiment bucketing** (if key in an experiment): hash `traceId` → pick arm → rewrite `model`/params/prompt; tag `X-Ahura-Arm`.
5. **Guardrail PRE**: load per-org policy from KV; run regex/PII/jailbreak inline; optional classifier call (own pod). `block` → reject (existing `guardrail_blocked` path); `redact` → rewrite message text in `outgoingBody`.
6. Cache → forward to OpenRouter / managed pod (existing).
7. **Guardrail POST**: on non-stream, scan completion for PII/moderation before returning; on stream, scan is best-effort post-hoc (logged, not blocking) for v1.
8. `waitUntil(sendUsage(...))` **and** `waitUntil(sendTrace(...))` — the new trace event carries prompt/completion *pointers*, guardrail action, arm, prompt version. Sampled raw payload written to R2 by the trace consumer.

**Where state lives:** Postgres (`inference` schema) = source of truth for prompts/datasets/runs/policies/experiments/spans-metadata. KV = hot read cache for prompt+guardrail+experiment configs and the spend counter. R2 = sampled raw payloads + eval dataset rows. Redis/BullMQ = eval job queue. Durable Object = unchanged (rate limit only).

## 4. Data model

Migration `supabase/migrations/20260616000001_observe_prompts_evals_guardrails.sql`, following the repo's exact style (idempotent `IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object` RLS blocks, `auth.uid()` SELECT + `service_role` ALL, shared `gpu_set_updated_at` trigger).

```sql
-- ─── Tracing (high cardinality → monthly partitioned, mirrors inference.usage) ───
CREATE TABLE IF NOT EXISTS inference.trace_spans (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  trace_id        UUID NOT NULL,            -- groups multi-step spans
  parent_span_id  UUID,
  api_key_id      UUID,
  request_id      TEXT NOT NULL,            -- joins to inference.usage.request_id
  name            TEXT NOT NULL,            -- 'gen_ai.chat', 'guardrail.pre', ...
  model_id        TEXT,
  prompt_id       UUID,                     -- → inference.prompts
  prompt_version  INT,
  experiment_id   UUID,                     -- → inference.experiments
  arm             TEXT,
  input_tokens    INT, output_tokens INT,
  latency_ms      INT, ttft_ms INT,
  cost_cents      NUMERIC(14,6),
  guardrail_action TEXT,                    -- clean|flagged|blocked|redacted
  status          TEXT NOT NULL,
  payload_ref     TEXT,                     -- R2 key when sampled, else NULL (ZDR)
  attributes      JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
-- (pre-create 8 monthly partitions in-migration, same as usage/audit_log)
CREATE INDEX IF NOT EXISTS idx_trace_spans_org_time ON inference.trace_spans (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_spans_trace ON inference.trace_spans (trace_id);

-- ─── Prompt management ───
CREATE TABLE IF NOT EXISTS inference.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL, name TEXT NOT NULL,
  created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
CREATE TABLE IF NOT EXISTS inference.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES inference.prompts(id) ON DELETE CASCADE,
  version INT NOT NULL,
  template JSONB NOT NULL,                  -- messages[] with {{var}} placeholders
  model_defaults JSONB DEFAULT '{}'::jsonb, -- model, temperature, max_tokens
  label TEXT,                               -- 'production' | 'staging' | NULL
  created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_label
  ON inference.prompt_versions (prompt_id, label) WHERE label IS NOT NULL;

-- ─── Guardrail policies (per org; resolved into KV) ───
CREATE TABLE IF NOT EXISTS inference.guardrail_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL, name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'warn' CHECK (mode IN ('off','warn','block','redact')),
  rules JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{type:'pii'|'jailbreak'|'regex'|'moderation'|'schema', ...}]
  classifier_model_id TEXT,                 -- → inference.models (own pod), nullable
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- ─── Evals ───
CREATE TABLE IF NOT EXISTS inference.eval_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL, name TEXT NOT NULL, row_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(org_id, name)
);
CREATE TABLE IF NOT EXISTS inference.eval_dataset_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES inference.eval_datasets(id) ON DELETE CASCADE,
  input JSONB NOT NULL, expected JSONB, metadata JSONB DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS inference.eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL, dataset_id UUID NOT NULL,
  target_model TEXT, judge_model TEXT, prompt_version_id UUID,
  graders JSONB NOT NULL,                   -- [{type:'llm_judge'|'assertion'|'human'}]
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  heartbeat_at TIMESTAMPTZ,                 -- claimer stall detection (ft-runner pattern)
  aggregate_score NUMERIC(6,4), rows_total INT, rows_done INT DEFAULT 0,
  billing_run_id UUID,                      -- usage-event metering key
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inference.eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES inference.eval_runs(id) ON DELETE CASCADE,
  row_id UUID NOT NULL, output JSONB, scores JSONB, passed BOOLEAN,
  human_status TEXT CHECK (human_status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Experiments ───
CREATE TABLE IF NOT EXISTS inference.experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','stopped')),
  arms JSONB NOT NULL,                      -- [{key, weight, model, prompt_version_id, params}]
  bind_api_key_id UUID,                     -- which key's traffic to split
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(org_id, name)
);
```

**RLS** (every table, per the repo idiom):
```sql
ALTER TABLE inference.prompts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.prompts TO authenticated;
GRANT ALL ON inference.prompts TO service_role;
DO $$ BEGIN
  CREATE POLICY "members read prompts" ON inference.prompts
    FOR SELECT USING (inference.is_org_member(org_id));   -- existing helper RPC
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_role manages prompts" ON inference.prompts
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

**Billing keys:** eval runs use **usage-event metering** (`billing_run_id` as `service_id`, no `active_*` row — they're finite jobs). Guardrail classifier pods, when always-on, get a new `billing.active_guardrail_pods` (added to `GRACE_SERVICE_TABLES` + cron allowlist + `extend_grace_lifecycle_allowlist`).

## 5. API surface

### Customer gateway (`/v1/*`, header-driven — matches existing `X-Ahura-*` convention)

Existing routes gain headers; no new hot-path verbs except introspection:
```
POST /v1/chat/completions
  X-Ahura-Trace-Id: 7f3a...        # optional; groups spans
  X-Ahura-Prompt: support-bot@production
  X-Ahura-Prompt-Vars: {"ticket":"..."}  # JSON, url-safe or body field
  X-Ahura-Guardrail: my-strict-policy     # named policy (was: off|warn|block)
  X-Ahura-Experiment: model-bakeoff        # opt a request into an experiment
→ response adds:
  X-Ahura-Trace-Id, X-Ahura-Prompt-Version: 4, X-Ahura-Arm: gpt5-variant,
  X-Ahura-Guardrail: redacted
```

### Dashboard control plane (`/api/*`, JSON CRUD)

```
# Prompts
POST /api/prompts                       {name}
POST /api/prompts/{id}/versions         {template, model_defaults, label}
PUT  /api/prompts/{id}/versions/{v}/label  {label:"production"}   # deploy-to-prod

# Evals
POST /api/evals/datasets                {name}; POST .../rows (bulk)
POST /api/evals/runs                    {dataset_id, target_model, judge_model, graders}
GET  /api/evals/runs/{id}               # status + aggregate_score
POST /api/evals/runs/{id}/review        {result_id, human_status}

# Guardrails
POST /api/guardrails/policies           {name, mode, rules:[...]}
POST /api/guardrails/test               {text, policy_id}   # dry-run a policy

# Experiments
POST /api/experiments                   {name, arms, bind_api_key_id}
POST /api/experiments/{id}/start | /stop | /promote {arm}

# Observe
GET  /api/observe/traces?from&to&model&prompt_version
GET  /api/observe/traces/{trace_id}     # spans + R2 payload if sampled
GET  /api/observe/analytics?group_by=prompt_version&metric=cost
```

**Example — create eval run:**
```jsonc
// POST /api/evals/runs
{ "dataset_id":"d_91...", "target_model":"openai/gpt-5",
  "judge_model":"anthropic/claude-4.5", "prompt_version_id":"pv_22...",
  "graders":[{"type":"llm_judge","rubric":"helpfulness 1-5"},
             {"type":"assertion","kind":"json_schema","schema":{...}}] }
// → 202
{ "run_id":"er_77...", "status":"queued", "rows_total":250 }
```
**Example — guardrail dry-run:**
```jsonc
// POST /api/guardrails/test
{ "text":"my card is 4111 1111 1111 1111", "policy_id":"gp_05" }
// →
{ "action":"redacted", "redacted_text":"my card is [CARD_REDACTED]",
  "hits":[{"rule":"pii","type":"credit_card","severity":"critical"}] }
```

## 6. Code sketches

**(a) Gateway — prompt resolver lib (`workers/inference/src/lib/prompt-resolver.ts`)**, mirroring the KV-cache + `resolvePreset` style:
```ts
import type { Env } from "../types.ts";

interface ResolvedPrompt { messages: Array<{ role: string; content: string }>; version: number; modelDefaults: Record<string, unknown>; }

// "support-bot@production" → KV "prompt:{org}:support-bot:production" (5-min TTL,
// write-through on every label publish from the control plane, like API_KEYS).
export async function resolvePrompt(env: Env, orgId: string, ref: string, vars: Record<string, unknown>): Promise<ResolvedPrompt | null> {
  const [name, label = "production"] = ref.split("@");
  const cached = await env.PROMPTS.get(`prompt:${orgId}:${name}:${label}`, "json");
  if (!cached) return null;
  const c = cached as { version: number; template: Array<{ role: string; content: string }>; model_defaults: Record<string, unknown> };
  return {
    version: c.version,
    modelDefaults: c.model_defaults ?? {},
    messages: c.template.map((m) => ({ role: m.role, content: render(m.content, vars) })),
  };
}

// Conservative {{var}} interpolation — no eval, missing vars left literal so a
// templating bug never silently drops instructions (same caution as guardrail.ts).
function render(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{{${k}}}`);
}
```

**(b) Gateway — trace emit, called via `waitUntil` next to `sendUsage`** (new `lib/trace.ts`):
```ts
import type { AuthContext, Env } from "../types.ts";

export interface TraceSpan {
  orgId: string; traceId: string; requestId: string; name: string;
  apiKeyId: string | null; modelId: string; promptId: string | null;
  promptVersion: number | null; experimentId: string | null; arm: string | null;
  inputTokens: number | null; outputTokens: number | null;
  latencyMs: number; ttftMs: number | null;
  guardrailAction: string; status: string;
  payload: { input: unknown; output: unknown } | null; // null when ZDR or unsampled
}

// Mirrors sendUsage(): never throws, never blocks the customer response.
export async function sendTrace(env: Env, span: TraceSpan): Promise<void> {
  try { await env.TRACE_EVENTS.send(span); }
  catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "trace",
      message: "Failed to enqueue trace span", err: String(err) }));
  }
}

// Sampling gate evaluated in the route: ZDR keys NEVER carry payload; otherwise
// keep payload with probability = key.logSampleRate (0..1).
export function shouldSamplePayload(auth: AuthContext, rate: number): boolean {
  return !auth.zdrEnabled && Math.random() < rate;
}
```

**(c) eval-runner job handler (`workers/eval-runner/src/lifecycle.ts`)** — the ft-runner claim/queue idiom, but the "compute" is calls back into our *own* gateway:
```ts
import type { JobCtx } from "./types.js";

export async function runEval(ctx: JobCtx, runId: string): Promise<void> {
  const { supabase, gateway, logger } = ctx;
  await supabase.schema("inference").from("eval_runs")
    .update({ status: "running", heartbeat_at: new Date().toISOString() }).eq("id", runId);

  const { data: run } = await supabase.schema("inference").from("eval_runs")
    .select("*, eval_dataset_rows:dataset_id(*)").eq("id", runId).single();

  let pass = 0;
  for (const row of run.rows) {
    // Target completion — through OUR gateway, so it inherits billing+brand-hiding.
    const out = await gateway.chat(run.target_model, row.input, { promptVersionId: run.prompt_version_id });
    // LLM-as-judge — also our gateway. metering keyed on run.billing_run_id (§7).
    const verdict = await gateway.judge(run.judge_model, run.graders, row.expected, out);
    const passed = verdict.score >= verdict.threshold;
    if (passed) pass++;
    await supabase.schema("inference").from("eval_results")
      .insert({ run_id: runId, row_id: row.id, output: out, scores: verdict.scores, passed });
    await ctx.heartbeats.touch(runId);            // same stall-detection as ft-runner
  }

  await supabase.schema("inference").from("eval_runs").update({
    status: "completed", rows_done: run.rows.length,
    aggregate_score: pass / run.rows.length,
  }).eq("id", runId);
  logger.info({ runId, score: pass / run.rows.length }, "eval completed");
}
```

## 7. Billing

Two metering shapes, both already supported by the spine.

| Service | Pricing model | Spine enrollment | Spend-cap interaction |
|---|---|---|---|
| **Tracing** | **Free** up to a span quota (e.g. 1M spans/mo), then **$X / 100k spans** | **Usage-event** — trace consumer batches a `transactions` row (`service_type:'inference_observe'`) per N spans, like the usage consumer | Counts toward org monthly spend → flows through existing `SPEND` KV counter + hard-cap middleware automatically |
| **Logging/payload storage** | **$Y / GB-mo** of sampled payloads in R2 | **`billing.active_*` style** flat monthly (hourly_rate = monthly/720), metered by the existing 5-min cron over an `active_observe_storage` row keyed on org — identical to `active_inference_vector` | Grace → auto-delete lifecycle for free (drops oldest payloads first) |
| **Prompt management** | **Free** (control-plane CRUD; resolved prompts add no inference cost beyond the underlying completion) | None | n/a |
| **Eval runs** | **Pass-through inference cost** (target+judge calls billed as normal `/v1` usage) **+ $Z/1000 rows orchestration fee** | **Usage-event** — orchestration fee as one `transactions` row keyed on `eval_runs.billing_run_id`; the model calls self-meter through the gateway's own usage path | Pre-flight balance guard (the "slice 1" pattern already shipped) blocks a run if the org can't cover the estimated cost |
| **Guardrails — edge rules** | **Free / bundled** (regex+PII run in-isolate, ~0 marginal cost) | None | n/a |
| **Guardrails — classifier inference** | **$/1000 checks** (own pod) | If always-on pod: **`billing.active_guardrail_pods`** (GPU-hour, hourly cron). If on-demand: **usage-event** per check | GPU-hour enrolls in grace lifecycle; per-check counts toward spend cap |
| **Experiments** | **Free** orchestration; arms bill as normal inference | None (underlying calls self-meter) | Each arm's usage hits the cap like any request |
| **Analytics / alerts** | **Free / plan-tier** (retention window as the lever: 7d free, 90d on a paid tier) | None | n/a |

**Markup hook:** the usage consumer already separates `cost_cents` from `upstream_cost_cents` (today equal at 0% markup). This cluster is where a **nonzero margin** naturally lands first — the orchestration/observability fees *are* pure margin (no upstream cost), addressing gap #7 without touching the sensitive per-token markup decision.

## 8. Delivery plan

Slices are independently shippable. Estimates assume one senior eng; the eval-runner slice needs the deploy-runner pattern as a copy source (zero new infra learning).

| Slice | Scope | Eng-weeks | Depends on | Cut for v1 |
|---|---|---|---|---|
| **S1 — Tracing + analytics** | `TRACE_EVENTS` queue + `trace.ts` + `consumers/trace.ts`, `trace_spans` migration, sampled R2 write, dashboard trace explorer, OTLP export | **3** | Existing usage pipeline | OTLP export (keep internal spans only); ClickHouse |
| **S2 — Guardrails productization** | Extend `guardrail.ts` to per-org KV policies, PII regex pack + redaction, `guardrail_policies` table + CRUD + dry-run API, wire as mandatory pre-filter on Agents endpoint | **3** | S1 (for guardrail telemetry) | ML classifier (regex/PII only); POST-call scan on streams |
| **S3 — Prompt management** | `prompts`/`prompt_versions` tables, `prompt-resolver.ts` + KV write-through, deploy-to-label UI, `X-Ahura-Prompt` wiring | **2.5** | None | Jinja conditionals/loops (vars only); diff UI |
| **S4 — Eval service** | **NEW `eval-runner`** (copy ft-runner), datasets/runs/results tables, LLM-judge + assertion graders, run dashboard | **4** | S3 (prompt-version target), gateway self-call | Human-review queue; CI hook → S6 |
| **S5 — Guardrail ML classifier** | Deploy moderation+jailbreak+PII-NER model via existing deploy-runner, `active_guardrail_pods` billing, route integration | **2.5** | S2, deploy-runner; **soft-dep on owned-GPU economics** (RunPod now, Yotta later) | Custom-trained models (use off-the-shelf) |
| **S6 — Experiments + CI + human review** | `experiments` table + `experiment.ts` edge bucketing, promote flow; `ahura evals run` CLI + GitHub Action; human-review queue UI | **3** | S4, S3 | Multi-armed bandit (fixed weights only) |
| **S7 — Alerts/webhooks + markup** | Threshold monitors over trace/usage data, webhook fan-out (reuse spend-alert plumbing), turn on observability-fee margin | **1.5** | S1 | — |

**Total ≈ 19.5 eng-weeks.** Critical path to a sellable v1: **S1 → S2 → S3 → S4** (≈12.5 wks) gives tracing, guardrails, prompts, and evals — the four headline products. S5/S6/S7 are fast-follows.

**Cross-cluster dependencies:** the **billing-completeness cluster (gap #7)** should land its markup-separation work first so S7's margin toggle is clean; the **compliance cluster (gap #5)** consumes this cluster's audit/trace data for its evidence story. The **RAG/reranking cluster** is a *consumer* of evals (regression-gating retrieval quality) but not a blocker.

## 9. Risks & open questions

- **ZDR vs. logging/tracing tension.** ZDR keys must *never* persist payloads — `shouldSamplePayload` hard-gates on `auth.zdrEnabled`, but we must audit every new write path (the repo's "three-layer brand-scrub discipline" applies equally to payload capture). Open: do we offer *metadata-only* tracing for ZDR keys (spans without prompt text), or nothing? Recommend metadata-only.
- **Streaming POST-call guardrails.** We can't redact a token already streamed to the client. For `mode:'redact'` on streaming requests, v1 can only buffer-then-release (kills TTFT) or scan post-hoc (leaks). **Open decision:** default streaming to pre-call-only enforcement and require non-streaming for full redaction. Document loudly.
- **Trace volume cost.** At 100k req/hr, `trace_spans` outpaces even `usage` (multiple spans/request). Partitioning + a short default retention (7d hot) is essential; confirm Postgres headroom before turning sampling to 100%. This is the strongest pull toward the ClickHouse/Tinybird offload the architecture doc anticipates.
- **Guardrail classifier latency budget.** A synchronous classifier call adds latency to every guarded request. Mitigations: run only on `block`/`redact` modes, cache verdicts by input hash (reuse the L1 cache machinery), and keep a warm min-replica pod (cost vs. latency trade-off — same cold-start problem the managed-serving watchdog already handles).
- **Eval cost runaway.** A 10k-row dataset × judge calls can silently burn a large balance. The pre-flight balance guard (already shipped for FT/serving) must estimate and gate; **open:** surface a cost estimate in the dashboard *before* run submission.
- **Brand-hiding in the judge path.** LLM-as-judge errors/timeouts must route through `customerSafeErrorMessage()` so an OpenRouter 5xx never appears in an eval-result row the customer reads. Audit `eval_results.scores`/error fields specifically.
- **Prompt-version KV staleness.** A `production` label flip must propagate within the 5-min KV TTL; for instant promotion we'd need active KV invalidation (extra control-plane→KV call). **Open:** is 5-min eventual consistency acceptable for prod prompt deploys, or do we add explicit invalidation? Recommend explicit `KV.put` write-through on every label change (already the plan) + accept ≤TTL fallback staleness.
- **OTel GenAI semconv churn.** The `gen_ai.*` semantic conventions are still moving in 2026. Pin to a snapshot in `attributes` JSONB and map at export time rather than baking the convention into column names.