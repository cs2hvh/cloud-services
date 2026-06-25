# Inference Platform Completeness — Cluster Design

## 1. Services & customer value

This cluster turns the existing pass-through `/v1` gateway into a real inference *platform*. Eleven distinct services, grouped by where they live:

**Gateway-resident control features** (no new compute, pure Worker logic on top of the existing chat-completions path):

1. **Structured outputs / JSON-schema mode** — `response_format: {type:"json_schema", json_schema:{...}}` honored *at the gateway* with validation + one constrained retry. Customer buys: "the model output always matches my Zod/Pydantic schema or the call errors cleanly," not "best-effort." Reference: OpenAI Structured Outputs, Together `response_format`, Fireworks JSON mode.
2. **Tool/function-calling guarantees** — schema-validate every `tool_calls` argument blob against the declared `function.parameters`; auto-repair-retry on malformed args. Customer buys deterministic agent loops. Reference: OpenAI strict function calling, Anthropic tool_use.
3. **Smart model routing** — a virtual model id (`ahura/auto`, `ahura/auto-cheap`, `ahura/auto-fast`) that picks a concrete model per request by cost/latency/quality policy. Reference: OpenRouter "auto" router, Martian, Not Diamond, Unify.
4. **Fallback chains + retries across models** — declarative ordered model list; on upstream 429/5xx/timeout, fall through to the next model transparently. Extends the existing `model_presets` (which already stores "saved fallback chains / provider preferences" per the schema) into runtime behavior. Reference: LiteLLM router fallbacks, Portkey configs.
5. **Prompt caching with discounted billing** — surface upstream prompt-cache hits (`cache_control` breakpoints, `prompt_tokens_details.cached_tokens`) and **bill cached input tokens at a discounted rate**, which the usage consumer already reads (`cachedTokens` field exists in `UsageEvent`). Reference: Anthropic prompt caching, OpenAI automatic caching, DeepSeek context caching.
6. **Usage-tier rate limits** — replace the single per-key token bucket with account-level tiers (Free/Build/Scale/Enterprise) that raise RPM/TPM as 30-day spend crosses thresholds. Reference: OpenAI usage tiers, Anthropic rate-limit tiers.

**Substrate-resident capacity features** (need owned/RunPod GPUs — sequenced behind the Yotta fleet decision):

7. **Provisioned throughput / reserved capacity tiers** — buy a guaranteed token-per-minute floor on a model for a monthly commit, isolated from shared-pool contention. Reference: Azure OpenAI PTUs, Bedrock Provisioned Throughput, Fireworks reserved.
8. **Dedicated endpoints with autoscaling + SLAs** — a private, named endpoint (`https://api.ahurasense.com/v1` with a dedicated routing key) backed by reserved replicas that autoscale within a min/max band, carrying a contractual latency/uptime SLA. Reference: HF Inference Endpoints, Together dedicated, Baseten.
9. **Regional routing / data residency (India)** — pin a key/org so inference, logs, and cache never leave the India region (the Yotta DC). Reference: Azure data residency, Bedrock cross-region inference profiles.
10. **Speculative / draft acceleration** — on self-hosted serving, attach a small draft model for speculative decoding to cut latency. Sold as a "turbo" flag on dedicated endpoints. Reference: vLLM speculative decoding, Fireworks "Turbo."
11. **Multi-LoRA shared serving pool (deferred Tier 2)** — per-token billing for fine-tune inference by hot-swapping LoRA adapters on a shared base-model pool, instead of the current per-pod-hour Tier 1. This is the explicitly-deferred Phase 12. Reference: vLLM multi-LoRA, LoRAX, Fireworks/Together multi-LoRA serving.

The first six are near-pure-software wins shippable on RunPod-era infrastructure. The last five are the monetization layer for the owned fleet and gate on it.

## 2. Build vs proxy

Decision rule from `docs/inference/architecture.md`: proxy when the value is bundling/UX over an upstream that already does the heavy lifting; build only when we own the request shape end-to-end or need GPU control the upstream can't give.

| Service | Decision | Rationale |
|---|---|---|
| Structured outputs | **Build (gateway)** | OpenRouter passes `response_format` through unevenly across 52 models. We own correctness: validate with Ajv in the Worker, constrained-retry once. Zero new compute. |
| Tool-calling guarantees | **Build (gateway)** | Same — validation/repair is our logic, sits between client and upstream. |
| Smart routing | **Build (gateway) + proxy execution** | The *router* (model selection from a scored table) is ours; the actual inference still proxies to the brand-hidden LLM upstream (candidate: the current aggregation upstream). We never re-implement inference; we choose which model id to forward. |
| Fallback chains | **Build (gateway)** | Pure orchestration over the existing `forwardJson` path. Each leg is still a proxied call. |
| Prompt caching | **Proxy + build billing** | Caching mechanism lives upstream (the model provider's cache). We build the *billing discount* + header surfacing. `cache_control` breakpoints forward untouched. |
| Usage-tier rate limits | **Build (gateway)** | Extends the existing Durable Object `RateLimiter`; tier resolved from 30-day spend. |
| Provisioned throughput | **Build (own fleet)** | A capacity *guarantee* is impossible to offer over a shared upstream we don't control. Requires reserved replicas on owned B300/H200 (or dedicated RunPod pods as a bridge). |
| Dedicated endpoints + SLA | **Build (own fleet, RunPod bridge)** | An SLA we can sign requires capacity we operate. Bridge v1: dedicated per-customer vLLM pods on RunPod (the Tier-1 serving substrate already exists). GA: owned fleet. |
| Regional routing (India) | **Build (own fleet)** | Hard residency means inference compute physically in-country. Only the Yotta DC satisfies it; the aggregation upstream's region is opaque and uncontrollable. Bridge: India-region RunPod DCs for the data plane; control plane/logs pinned via a regional Postgres + KV namespace. |
| Speculative decoding | **Build (own fleet/RunPod)** | A vLLM-server flag (`--speculative-model`) on serving we operate. Impossible to inject into a proxied upstream. |
| Multi-LoRA pool | **Build (own fleet)** | This is the whole point of owning GPUs — per-token FT economics only work when we run the base-model pool. Bridge on RunPod is possible but margin-negative until owned capacity lands. |

Candidate brand-hidden upstreams (never surfaced): the existing model-aggregation upstream for proxied legs; RunPod Serverless/pods for the GPU bridge; the future Yotta-hosted owned fleet. Customer sees only `ahura/*` model ids and `api.ahurasense.com`.

## 3. Architecture

Mapping onto the four existing deployables (**CF Worker gateway**, **Next.js control plane**, **k8s runners**, **CF cron**) plus exactly one new deployable.

### CF Worker gateway (the bulk of the cluster)

New middleware/lib modules slot into the existing chain (`auth → spend → rate-limit → route`), reusing `lookupModelRouting`, `forwardJson`, `streamPassthrough`, `forwardToManaged`:

- `lib/structured-output.ts` — Ajv compile + validate + constrained retry.
- `lib/tool-guarantees.ts` — per-tool arg validation against declared `parameters`.
- `lib/router.ts` — reads a cached scored model table from KV (`router:v1`), picks a concrete model id for `ahura/auto*`.
- `lib/fallback.ts` — wraps the forward call in an ordered loop driven by the resolved `model_presets` row.
- Rate-limit middleware gains a tier lookup (KV `tier:{orgId}` → `{rpm, tpm}`).

**Request flow — `POST /v1/chat/completions` with `model:"ahura/auto"`, a fallback preset, and `response_format:json_schema`:**

1. DNS → CF anycast → Worker isolate; requestId + timing (unchanged).
2. `authMiddleware` (KV key-hash lookup), `spendCheckMiddleware`, `rateLimitMiddleware` — **tier resolved here**, bucket sized by tier.
3. `router.ts`: if model is `ahura/auto*`, score candidate models from the KV table (cost/latency/quality weights from policy) → concrete `effectiveModel`.
4. `fallback.ts`: build the ordered model list (router pick first, then the preset's fallback chain). For dedicated/provisioned/regional keys, the list is constrained to the customer's reserved endpoints.
5. L1 + semantic cache check (existing).
6. `forwardJson` to the first model. On 429/5xx/timeout → next leg. On a self-hosted model id (`serving_url` set) → `forwardToManaged` (existing managed path), or for Tier-2 → the new **serving-router** (below).
7. On non-stream success: `structured-output.ts` validates the completion against the schema; on failure, one constrained retry (append a corrective system turn); on second failure, return a clean `json_schema_validation_failed` error. `tool-guarantees.ts` validates `tool_calls`.
8. Usage enqueued to `USAGE_EVENTS` CF Queue with `cachedTokens` populated for the prompt-cache discount, `routerChoice` + `fallbackLeg` + `tier` added to the event (consumer prices it).
9. `waitUntil` audit event for routing decisions on enterprise keys.

### Next.js control plane (`/api/inference/*`)

- CRUD for fallback presets (extends existing `model_presets`), router policies, usage tiers, dedicated/provisioned/regional endpoint provisioning requests, reserved-capacity contracts. Dashboard pages under `app/dashboard/inference/*`.
- Internal cron sweep endpoints (pattern: `/api/inference/internal/*` guarded by `X-Ahura-Internal-Token`) for the new meters.

### k8s runners (new runner)

The five capacity services need GPU lifecycle orchestration the Worker can't do. **New deployable: `serving-runner`** — a sibling to `ft-runner`/`deploy-runner`, same shape (BullMQ `Queue`+`Worker`, Postgres claimer poll, `/health` probe server, RunPod client). Responsibilities:

- Provision/scale dedicated endpoints (vLLM `openai-server` pods, with `--speculative-model` when turbo is set), register `serving_url` in `inference.models`.
- Boot + maintain the **multi-LoRA base pool**: long-lived vLLM pods with `--enable-lora`, dynamically loading adapters from R2 via the vLLM LoRA load API.
- Autoscaler control loop: watch per-endpoint RPM/queue-depth (from a Redis counter the gateway increments), scale replicas within the min/max band.
- Honor regional placement (RunPod India DC / Yotta) per the endpoint's `region` column.

### CF cron (existing minute trigger)

Add three sweeps to the existing `scheduled()` dispatcher in `workers/inference/src/index.ts` (which already runs the serving-pod watchdog + deployment meter):

- **dedicated-endpoint meter** (every 5 min): bill reserved replicas per GPU-hour while live (mirrors `runDeploymentMeter`).
- **provisioned-throughput meter** (hourly): bill the monthly commit prorated via the `billing.active_*` clock.
- **multi-LoRA pool meter** is *not* a cron — per-token billing flows through the existing usage-event pipeline.

### Where state lives

- **KV**: router scored table, per-org tier, dedicated-endpoint routing map (hot path, refreshed by control plane writes).
- **Durable Object**: tiered rate-limit buckets (extend existing `RateLimiter`).
- **Postgres** (`inference`/`billing`): presets, router policies, endpoint/contract records, LoRA pool registry, `billing.active_*` rows.
- **Redis**: per-endpoint live RPM/queue-depth counters for the autoscaler.
- **R2**: LoRA adapters (already there from FT).

## 4. Data model

Migration `20260616000001_inference_platform_completeness.sql`, following the repo's style (DO-block RLS, shared `gpu_set_updated_at` trigger, `service_role`/`authenticated` grants).

```sql
-- 1. Router policies (per-org weighting for ahura/auto*)
CREATE TABLE inference.router_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                       -- 'auto','auto-cheap','auto-fast'
  weight_cost    NUMERIC(4,3) NOT NULL DEFAULT 0.34,
  weight_latency NUMERIC(4,3) NOT NULL DEFAULT 0.33,
  weight_quality NUMERIC(4,3) NOT NULL DEFAULT 0.33,
  candidate_models TEXT[] NOT NULL DEFAULT '{}',   -- empty = full catalog
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- 2. Usage tiers (account-level rate limits, spend-derived)
CREATE TABLE inference.usage_tiers (
  org_id        UUID PRIMARY KEY REFERENCES inference.orgs(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free','build','scale','enterprise')),
  rpm_limit     INTEGER NOT NULL DEFAULT 60,
  tpm_limit     INTEGER NOT NULL DEFAULT 60000,
  manual_override BOOLEAN NOT NULL DEFAULT false,  -- enterprise: pinned, skip auto-promote
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Dedicated / provisioned / regional endpoints
CREATE TABLE inference.dedicated_endpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  base_model_id TEXT NOT NULL,                     -- catalog id to serve
  mode          TEXT NOT NULL DEFAULT 'dedicated'
                CHECK (mode IN ('dedicated','provisioned','multi_lora')),
  region        TEXT NOT NULL DEFAULT 'auto'
                CHECK (region IN ('auto','in')),   -- 'in' = India residency
  gpu_sku       TEXT NOT NULL,                     -- 'h200','b300', etc. (internal)
  min_replicas  INTEGER NOT NULL DEFAULT 1,
  max_replicas  INTEGER NOT NULL DEFAULT 3,
  turbo_speculative BOOLEAN NOT NULL DEFAULT false,
  committed_tpm INTEGER,                           -- provisioned only
  hourly_cents  INTEGER NOT NULL DEFAULT 0,        -- per-replica GPU-hour
  state         TEXT NOT NULL DEFAULT 'provisioning'
                CHECK (state IN ('provisioning','running','scaling','stopped','failed')),
  serving_url   TEXT,                              -- gateway routes here when running
  routing_key   TEXT NOT NULL,                     -- maps customer key→this endpoint
  last_metered_at TIMESTAMPTZ,                     -- per-endpoint billing clock
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Multi-LoRA pool registry (which adapters are hot on which base pool)
CREATE TABLE inference.lora_pool_adapters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  finetune_id   UUID NOT NULL REFERENCES inference.finetunes(id) ON DELETE CASCADE,
  base_model_id TEXT NOT NULL,
  served_name   TEXT NOT NULL,                     -- model id customers call
  adapter_r2_key TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'registered'
                CHECK (state IN ('registered','loaded','evicted','failed')),
  loaded_at     TIMESTAMPTZ,
  UNIQUE(org_id, served_name)
);

-- 5. Billing spine enrollment for reserved-capacity endpoints.
--    service_id = inference.dedicated_endpoints.id (UUID), mirrors active_inference_vector.
CREATE TABLE billing.active_inference_endpoint (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id     UUID NOT NULL,
  hourly_rate    NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);
CREATE INDEX idx_active_inf_endpoint_status
  ON billing.active_inference_endpoint(status, last_billed_at);
```

**RLS pattern** (every table, matching `active_inference_vector` + the org helpers):

```sql
ALTER TABLE inference.dedicated_endpoints ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.dedicated_endpoints TO authenticated;
GRANT ALL    ON inference.dedicated_endpoints TO service_role;
DO $$ BEGIN
  CREATE POLICY "members read own org endpoints" ON inference.dedicated_endpoints
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service role manages endpoints" ON inference.dedicated_endpoints
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

`billing.active_inference_endpoint` must also be appended to `GRACE_SERVICE_TABLES` in `lib/billing/grace/constants.ts` and to the grace-lifecycle allowlist migration (pattern: `20260615000011_extend_grace_lifecycle_allowlist.sql`), and `'inference_endpoint'` added to the transactions `service_type` allowlist (`20260615000012`). Multi-LoRA + smart-routing + structured-output usage rides the **existing `inference.usage`** partitioned table — no new metering table, just new `cacheKind`/`routerChoice`/`served_name` columns on the usage event.

## 5. API surface

### Customer `/v1/*` (gateway)

**Smart routing + fallback + structured output** — all expressed in the existing chat body:

```jsonc
// POST /v1/chat/completions
{
  "model": "ahura/auto-cheap",
  "messages": [{ "role": "user", "content": "Extract the invoice fields." }],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "invoice",
      "strict": true,
      "schema": { "type": "object",
        "properties": { "total": {"type":"number"}, "due": {"type":"string"} },
        "required": ["total","due"], "additionalProperties": false }
    }
  }
}
```

Response carries new headers: `X-Ahura-Routed-Model: ahura/llama-3.3-70b`, `X-Ahura-Fallback-Leg: 0`, `X-Ahura-Structured: validated`, `X-Ahura-Cache: prompt-cache`, plus the existing `X-Ahura-Cost-Cents`. On schema failure after retry:

```jsonc
{ "error": { "message": "Model output failed schema validation after one repair attempt.",
  "type": "invalid_request_error", "code": "json_schema_validation_failed",
  "request_id": "req_..." } }
```

A fallback chain is supplied via the existing preset header `X-Ahura-Preset: prod-chain` (preset stores ordered models) or inline:

```jsonc
{ "model": "anthropic/claude-x",
  "ahura_fallbacks": ["ahura/llama-3.3-70b", "ahura/mixtral-8x22b"] }
```

**Dedicated/provisioned/regional** are *transparent* — the customer's API key is bound to its endpoint at provision time, so they keep calling the same `/v1/chat/completions`; the gateway resolves the routing key to the reserved `serving_url`. A residency-pinned key calling a non-`in` model returns `region_not_available`.

### Dashboard `/api/inference/*` (control plane)

```jsonc
// POST /api/inference/endpoints  → provision a dedicated endpoint
{ "displayName": "checkout-llm", "baseModel": "ahura/llama-3.3-70b",
  "mode": "dedicated", "region": "in", "gpuSku": "h200",
  "minReplicas": 2, "maxReplicas": 6, "turbo": true }
// 202 → { "id": "...", "state": "provisioning", "routingKey": "rk_..." }

// PATCH /api/inference/router-policies/auto-cheap
{ "weightCost": 0.7, "weightLatency": 0.2, "weightQuality": 0.1 }

// GET /api/inference/usage-tiers/current
// → { "tier":"scale","rpmLimit":5000,"tpmLimit":2000000,"nextTierAtSpendCents":500000 }
```

## 6. Code sketches

**A. Gateway router pick (`workers/inference/src/lib/router.ts`)** — virtual model → concrete id from a KV-cached scored table, in the repo's Worker style:

```ts
import type { Env } from "../types.ts";

interface ScoredModel {
  id: string;
  cost_per_1k: number;   // normalized 0..1
  p50_latency: number;   // normalized 0..1 (lower better)
  quality: number;       // normalized 0..1 (higher better)
}
interface RouterPolicy { weight_cost: number; weight_latency: number; weight_quality: number; candidate_models: string[]; }

/** Resolve ahura/auto* → a concrete catalog model id. KV-cached table refreshed
 *  by the control plane; falls back to a safe default if the table is cold. */
export async function pickModel(
  env: Env, orgId: string, virtual: string,
): Promise<string> {
  const [table, policyRaw] = await Promise.all([
    env.ROUTER_KV.get<ScoredModel[]>("router:v1:models", "json"),
    env.ROUTER_KV.get<RouterPolicy>(`router:v1:policy:${orgId}:${virtual}`, "json"),
  ]);
  if (!table?.length) return "ahura/llama-3.3-70b"; // cold-start safe default
  const p = policyRaw ?? { weight_cost: 0.34, weight_latency: 0.33, weight_quality: 0.33, candidate_models: [] };
  const pool = p.candidate_models.length
    ? table.filter((m) => p.candidate_models.includes(m.id))
    : table;
  // Higher score wins: reward quality + cheapness + speed.
  const best = pool.reduce((acc, m) => {
    const score = p.weight_quality * m.quality
      + p.weight_cost * (1 - m.cost_per_1k)
      + p.weight_latency * (1 - m.p50_latency);
    return score > acc.score ? { id: m.id, score } : acc;
  }, { id: pool[0].id, score: -Infinity });
  return best.id;
}
```

**B. Gateway fallback loop (`workers/inference/src/lib/fallback.ts`)** — wraps the existing `forwardJson`, reusing its signature and `streamPassthrough`:

```ts
import { forwardJson } from "./openrouter.ts";
import type { Env } from "../types.ts";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Try each model in order; advance on retryable upstream failures or network
 *  errors. Returns the first usable Response + which leg won (for the usage event). */
export async function forwardWithFallback(args: {
  env: Env; models: string[]; body: Record<string, unknown>;
  upstreamKey: string; signal: AbortSignal;
}): Promise<{ res: Response; leg: number; model: string }> {
  let lastErr: unknown;
  for (let leg = 0; leg < args.models.length; leg++) {
    const model = args.models[leg];
    try {
      const res = await forwardJson({
        env: args.env, upstreamKey: args.upstreamKey, path: "/chat/completions",
        body: { ...args.body, model }, signal: args.signal,
        extraHeaders: { "X-Title": "AhuraCloud Inference" },
      });
      // Last leg: return whatever we got. Otherwise only advance on retryables.
      if (res.ok || leg === args.models.length - 1 || !RETRYABLE.has(res.status)) {
        return { res, leg, model };
      }
      lastErr = `upstream_${res.status}`;
    } catch (err) {
      lastErr = err; // network/abort — fall through to next leg
      if (args.signal.aborted) throw err; // client gave up; stop
    }
  }
  throw new Error(`All fallback legs exhausted: ${String(lastErr)}`);
}
```

**C. Dedicated-endpoint meter (`lib/inference/endpoint-billing.ts`)** — billing-spine integration mirroring `settleServingPod` / the deployment meter, charging per replica-hour against the per-endpoint `last_metered_at` clock:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { Billing } from "@/lib/supabase/queries/billing";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>;

/** Bill (now - last_metered_at) x live_replicas x hourly_rate for one running
 *  dedicated endpoint. Idempotent: only the row still in last_metered window is
 *  advanced, so a missed/duplicated cron tick never double-charges. Never throws. */
export async function meterEndpoint(
  supabase: ServiceClient, endpointId: string, liveReplicas: number,
): Promise<{ chargedUsd: number }> {
  const now = new Date();
  const { data: row } = await supabase.schema("inference")
    .from("dedicated_endpoints")
    .update({ last_metered_at: now.toISOString() })
    .eq("id", endpointId).eq("state", "running")
    .select("org_id, hourly_cents, last_metered_at")
    .maybeSingle<{ org_id: string; hourly_cents: number; last_metered_at: string | null }>();
  if (!row?.last_metered_at) return { chargedUsd: 0 }; // first tick seeds the clock

  const seconds = Math.max(0, (now.getTime() - Date.parse(row.last_metered_at)) / 1000);
  const cents = Math.ceil((row.hourly_cents * liveReplicas * seconds) / 3600);
  if (cents <= 0) return { chargedUsd: 0 };
  const usd = cents / 100;
  try {
    const { data: org } = await supabase.schema("inference").from("orgs")
      .select("billing_user_id, owner_user_id").eq("id", row.org_id).maybeSingle<any>();
    const payer = org?.billing_user_id || org?.owner_user_id;
    if (!payer) return { chargedUsd: 0 };
    const newBalance = await Billing.deduct(payer, usd);
    await Billing.save_transaction({
      userId: payer, amount: usd, status: "completed", type: "usage",
      balanceAfter: typeof newBalance === "number" ? newBalance : null,
      serviceId: endpointId, serviceType: "inference_endpoint",
      description: "Dedicated inference endpoint",
      metadata: { replicas: liveReplicas, hours: Number((seconds / 3600).toFixed(4)) },
    });
  } catch (e) {
    console.error(`[endpoint meter] charge failed ${endpointId}:`, e instanceof Error ? e.message : e);
  }
  return { chargedUsd: usd };
}
```

## 7. Billing

| Service | Pricing model | Spine enrollment | Spend-cap interaction |
|---|---|---|---|
| Structured outputs | Per-token (normal) + the constrained-retry call billed as its own usage event | `inference.usage` event | Counts toward `hard_cap_cents`; retry adds tokens |
| Tool guarantees | Per-token; repair retry billed as usage | `inference.usage` event | Same |
| Smart routing | Per-token at the **chosen** model's rate (consumer prices by `routerChoice`) | `inference.usage` event | Spend-check runs pre-route; choice can't exceed cap |
| Fallback chains | Per-token at the **winning leg's** rate; failed legs that returned 0 tokens cost nothing | `inference.usage` event with `fallbackLeg` | Each attempted leg checked against remaining budget |
| Prompt caching | Cached input tokens billed at a **discounted rate** (e.g. 0.1× input); the consumer already reads `cachedTokens` | `inference.usage` event | Lowers spend → headroom under cap |
| Usage-tier limits | Not billed; *derived from* 30-day spend | n/a (reads `inference.usage`) | Higher tier = higher RPM/TPM, not higher cost |
| Dedicated endpoint | **Per replica-GPU-hour**, metered every 5 min | `billing.active_inference_endpoint` | Pre-flight balance guard at provision (Slice-1 pattern from the inference-billing-gaps work); grace → auto-stop on insolvency |
| Provisioned throughput | **Monthly commit** stored as hourly_rate = commit/720, prorated hourly | `billing.active_inference_endpoint` | Reserved spend reduces remaining balance up front |
| Regional (India) | Endpoint GPU-hour at the India-DC rate (typically higher) | `billing.active_inference_endpoint` | Same as dedicated |
| Speculative/turbo | Surcharge on the endpoint hourly_rate (draft model needs extra VRAM) | `billing.active_inference_endpoint` | Same |
| Multi-LoRA pool | **Per-token** at base-model rate + small adapter-overhead delta | `inference.usage` event with `served_name` | Same as normal inference; this is the whole adoption unlock vs per-pod-hour |

All GPU-backed services follow the proven lifecycle: pre-flight balance + quota guard at create (from the shipped inference-billing Slice 1), hourly/5-min UUID-keyed meter via the cron, 7-day grace → auto-delete (`GRACE_SERVICE_TABLES`), notification outbox. **Markup**: this cluster is where the platform's first nonzero margin should land — reserved capacity and routing are value-add surfaces where a markup is defensible without breaking the 0%-passthrough promise on raw proxied tokens. (Decision needed — see §9.)

## 8. Delivery plan

Slices are independently shippable. Eng-weeks assume one principal + one engineer.

**Slice 1 — Structured outputs + tool guarantees (2 ew).** Pure gateway. `structured-output.ts` (Ajv + one constrained retry) + `tool-guarantees.ts`. No schema, no billing change beyond retry-as-usage. *No external deps.* Ship first — highest DX/effort ratio.

**Slice 2 — Fallback chains + smart routing (3 ew).** `fallback.ts` + `router.ts` + `router_policies`/`usage_tiers` tables + control-plane CRUD + KV table refresh job. Depends on Slice 1's usage-event extension. The router scored table needs a quality signal — bootstrap from a static curation, refine with observed latency from `inference.usage` (depends on the **Observability cluster** for richer latency percentiles; v1 ships with p50 from existing usage rows).

**Slice 3 — Prompt-caching billing + usage-tier rate limits (2 ew).** Surface `cache_control` passthrough + discounted `cachedTokens` pricing in the consumer; extend `RateLimiter` DO with tier buckets + a daily tier-recompute cron from 30-day spend. Depends on Slice 2 (`usage_tiers` table).

**Slice 4 — Dedicated endpoints + autoscaling (5 ew).** The **new `serving-runner` deployable** + `dedicated_endpoints` + `billing.active_inference_endpoint` + grace/transaction allowlist migrations + the 5-min meter cron sweep + provision/scale dashboard. Bridges on RunPod dedicated pods (reuse the Tier-1 serving substrate + `forwardToManaged`). Depends on the **billing-completeness cluster** for the markup decision and on RunPod capacity. SLA copy depends on the **compliance cluster's** status page.

**Slice 5 — Provisioned throughput + regional (India) routing (4 ew).** Adds `mode:'provisioned'` commit billing + `region:'in'` placement on the serving-runner. Hard residency depends on owned-fleet/Yotta or India-region RunPod DCs being live (**capital-proposal dependency**). Ships "soft residency" (India-region compute, control-plane pinning) first; "hard residency" (audited data-never-leaves) gates on the compliance cluster.

**Slice 6 — Speculative decoding (2 ew).** `--speculative-model` flag on serving-runner pods + `turbo_speculative` surcharge. Depends on Slice 4.

**Slice 7 — Multi-LoRA shared pool / Tier 2 (6 ew).** `lora_pool_adapters` + serving-runner pool loop (vLLM `--enable-lora` + dynamic adapter load from R2) + per-token routing through the existing usage pipeline. **Gates on owned-fleet economics** (Phase 12 per the locked decision). Heaviest slice; defer until customer demand + GPU margin justify it.

**Cut for v1:** speculative decoding (Slice 6), multi-LoRA (Slice 7), hard data-residency, provisioned-throughput commits. Ship Slices 1–4 as "inference platform completeness v1"; 5–7 follow the fleet.

## 9. Risks & open questions

- **Markup vs the 0%-passthrough promise.** The memory note says markup is a cross-cutting gap. This cluster is the natural place to introduce margin (reserved capacity, routing), but it must not retroactively mark up raw proxied tokens. *Open: where exactly does the first nonzero margin land, and is it communicated as a "platform fee" vs per-token?* Needs the billing-completeness cluster's sign-off.
- **Brand-scrub on routing transparency.** Smart routing exposes *which* model ran (`X-Ahura-Routed-Model`) — fine, those are `ahura/*` ids. But router scoring data and any "provider" hints in errors must pass through `customerSafeErrorMessage()`. Fallback errors that bubble an upstream 429 must be sanitized so the upstream provider name never leaks. *Audit every new error path.*
- **Constrained-retry cost surprise.** Structured-output/tool retries double-bill silently if the first attempt fails often. Mitigate: cap at one retry, count retry tokens in a distinct usage event, expose `X-Ahura-Structured-Retried: true` so customers can see it.
- **Multi-LoRA economics unproven.** Per-token FT pricing only beats per-pod-hour above a utilization threshold on the shared pool. *Open: what base-pool utilization makes Tier 2 margin-positive, and on which GPU SKU?* This is the locked Phase-12 gate — don't build ahead of the fleet.
- **SLA without owned capacity.** A signable uptime/latency SLA on a RunPod bridge is risky — we don't control their capacity or region SLAs (and can't name them). *Open: do we offer SLAs only on owned-fleet endpoints, or accept liability on the bridge with conservative numbers?* Couple to the compliance cluster.
- **Hard data-residency claims.** "Data never leaves India" requires the control plane (Postgres, KV, logs, semantic cache) to be regionally pinned too — not just the GPU. Today's single Linode VM + global CF KV violate this. *Open: regional Supabase + a regional KV namespace + log routing is a sizable lift; scope it with compliance.*
- **Router quality signal.** Without an evals service (separate cluster) the "quality" weight is hand-curated and stale. v1 ships static curation; the long-term answer is the evals cluster feeding `router_policies`. *Dependency, not a blocker.*
- **Autoscaler split-brain.** The serving-runner is single-replica today (like ft-runner). At scale, two replicas could both scale the same endpoint. Reuse the Postgres-claim/atomic-state-transition idempotency pattern (`settleServingPod`) for scale actions before going multi-replica.
- **Reserved-capacity grace semantics.** Auto-deleting a provisioned-throughput endpoint after a 7-day grace could violate a monthly commit contract. *Open: does reserved capacity follow the standard grace→delete, or pause-and-notify with manual recovery?* Enterprise billing is postpaid (compliance cluster) — the prepaid grace model may not apply.