# Enterprise AI & Marketplace Cluster — Design Document

**Cluster owner:** Platform / Inference vertical · **Status:** Proposed · **Date:** June 2026
**Substrate today:** RunPod GPU + OpenRouter proxy · **Substrate ~Q4:** self-owned B300/H200 fleet (Yotta, pending DPR)

This cluster turns the existing self-serve inference stack into an *enterprise* and *ecosystem* product. It layers single-tenant isolation, committed-capacity contracts, a fine-tune/agent marketplace, cross-service workspaces, hardened compliance posture, and provisioned-throughput SKUs on top of the four existing deployables. Everything below maps onto the live patterns in `workers/inference`, `lib/inference`, `workers/ft-runner`, and the `billing.active_*` spine — not greenfield.

---

## 1. Services & customer value

Seven distinct services, each independently sellable but sharing the org/workspace and billing spine.

**1.1 Private Dedicated Hosting (single-tenant inference).** A customer's fine-tune or chosen open model runs on isolated GPU capacity with a private routing slug (`org-acme-llama70b`) reachable only by that org's keys. No request ever shares a pod with another tenant; logs/cache/usage are partitioned by `org_id` with a ZDR-org-wide override. *Customer buys:* isolation + predictable latency + a contractual data boundary. *Reference points:* dedicated deployments / private endpoints on aggregator clouds — the "no noisy neighbour, your data never trains anything" tier. Extends the existing Managed Serving Tier 1 (one vLLM pod per fine-tune) into a *named, contracted, VPC-style* product.

**1.2 Reserved GPU Cluster (committed-use).** A customer reserves N GPUs of a SKU (B300/H200) for a 1/3/6/12-month term at a discounted committed rate vs. on-demand, with the reservation pinned to the Yotta fleet once it lands (RunPod-backed reserved pools as the bridge). *Customer buys:* guaranteed capacity + lower unit price + data residency. *Reference:* committed-use / reserved-instance contracts on every IaaS cloud; capacity blocks on the GPU clouds.

**1.3 Provisioned-Throughput SKUs (PTUs).** Instead of pay-per-token with best-effort rate limits, a customer buys *guaranteed* throughput units (e.g. 50 PTU ≈ a committed tokens/min floor for a model family). Backed by reserved capacity but sold as an abstract throughput unit so the customer never sees a GPU. *Reference:* PTUs on the big managed-LLM clouds — the enterprise alternative to token metering.

**1.4 Model & Agent Marketplace.** A publisher (an org) lists a fine-tune or an Agent (from the existing Agents product) for others to consume, sets a per-token or per-call price, and earns a revenue share. Consumers subscribe and call it through their normal `/v1` key. *Customer buys (publisher):* monetization + distribution; *(consumer):* curated, ready-to-use models/agents. *Reference:* model hubs with paid inference, GPT-store-style agent directories, prompt/agent marketplaces.

**1.5 Team Workspaces & Projects.** A layer *above* the existing `inference.orgs` that groups API keys, fine-tunes, deployments, vector collections, agents, and budgets into named projects with per-project RBAC, per-project budgets, and per-project usage rollups across every AI service. *Customer buys:* org-chart-shaped governance + cost attribution. *Reference:* projects/workspaces on the managed-LLM consoles.

**1.6 Compliance & Enterprise Readiness posture.** Org-wide ZDR, data-residency pinning (route only to in-region capacity), signed audit-log export, SSO/SAML hooks, and a per-org Data Processing record. *Customer buys:* the checkbox that unblocks procurement. *Reference:* the SOC2/ISO/DPDP + SSO + residency bundle every enterprise AI vendor ships. (Cluster #5 in the gap analysis owns the *certification* program; this cluster owns the *product surfaces* that the certification audits.)

**1.7 Partner / Solution Catalog.** A curated directory of first- and third-party solutions (vertical fine-tunes, agent templates, integration partners) with a "deploy into my workspace" button. *Customer buys:* faster time-to-value; *partner buys:* a channel. *Reference:* solution marketplaces / partner catalogs on the hyperscalers.

---

## 2. Build vs proxy

The hard constraint: a customer never learns the upstream. Decisions per service.

| Service | Decision | Substrate / upstream | Justification |
|---|---|---|---|
| **Private Dedicated Hosting** | **Build** | RunPod dedicated pods now → own B300/H200 later | This is a *self-host* product by definition — isolation is the value, and the existing `serving-pod.ts` already provisions one vLLM pod per fine-tune. We extend, not proxy. Brand-hidden behind `serving_url` rewritten to `org-{slug}-{model}` routing slugs. |
| **Reserved GPU Cluster** | **Build** | RunPod reserved pools (bridge) → Yotta fleet (target) | A committed-capacity contract has no proxy equivalent — you can't resell a frontier API as "reserved GPUs." The DPR's whole economic case is owning this margin. Until the fleet lands, back reservations with RunPod *Savings Plans*-style committed pods; cut over without changing the customer contract. |
| **Provisioned Throughput** | **Build (capacity) + proxy (overflow)** | Reserved own/RunPod capacity for the committed floor; OpenRouter for burst above PTU | The committed floor must run on capacity we control (that's what "guaranteed" means). Burst *above* the purchased PTU can spill to the existing OpenRouter proxy path at on-demand rates — the customer sees one endpoint. |
| **Marketplace** | **Build (control plane only)** | n/a — pure metadata + billing | No new compute. A listing routes to either an existing dedicated pod (publisher's model) or the proxy path (publisher's base model + LoRA). The marketplace is a *catalog + revenue-share ledger*, not an inference engine. |
| **Workspaces / Projects** | **Build** | Control plane (Postgres) | Pure governance metadata over existing tables. Zero compute. |
| **Compliance posture** | **Build** | Control plane + gateway middleware | ZDR/residency/audit-export are policy enforced in `auth.ts`/`spend.ts`-style middleware + control-plane export jobs. SSO/SAML proxies to an identity broker (brand-hidden) but the *enforcement* is ours. |
| **Partner Catalog** | **Build** | Control plane | Metadata + a "clone into workspace" action that calls existing deploy/agent create paths. |

Candidate brand-hidden upstreams (server-side names only, never surfaced): RunPod for GPU now; OpenRouter for PTU-overflow + base models; an identity broker (e.g. WorkOS-class) for SSO/SAML; Yotta DC for residency-pinned/own-fleet capacity. All masked exactly as today — `serving_url`, errors via `customerSafeErrorMessage()`, and region labels like `in-mumbai-1` rather than provider/DC names.

---

## 3. Architecture

The four existing deployables: **(A)** CF Worker gateway (`api.ahurasense.com/v1`), **(B)** Next.js control plane (single Linode VM, `server.ts`), **(C)** k8s runners (`ft-runner`/`deploy-runner` BullMQ), **(D)** cron (per-minute CF `scheduled` → control-plane internal sweeps). This cluster needs **one new runner** and **no new public deployable**.

**Mapping per service:**

- **Private Dedicated Hosting** — Provisioning runs on a **new `cluster-runner`** (C), modeled exactly on `ft-runner`: a `Claimer` polls `inference.dedicated_endpoints WHERE state='provisioning'`, adds a BullMQ job with deterministic `jobId = endpoint.id`, and a `Worker` calls RunPod to spin the isolated pod, writes back `serving_url`. The **gateway** (A) gains a resolver step: when an authed request names a private slug, it checks the caller's `org_id` matches the endpoint's `org_id` before forwarding to the pod URL (not OpenRouter). Idle reaping reuses the existing per-minute serving-pod watchdog (D).

- **Reserved GPU Cluster / PTUs** — Contracts live in the **control plane** (B); a **cron** sweep (D) is the *capacity reconciler*: every 5 min it ensures each active reservation has its pods up (provision via cluster-runner) and each PTU has its floor capacity warm. The gateway (A) enforces PTU throughput via a **Durable Object** token bucket sized to the purchased PTU (reusing the `RateLimiter` DO pattern, but the bucket rate is the *committed floor*, and overflow flips to the proxy path).

- **Marketplace** — Entirely **control plane** (B) for listing CRUD, subscription, and revenue-share ledger writes. The **gateway** (A) gains marketplace-key resolution: a consumer's call to a marketplace model resolves publisher routing + records a *dual usage event* (consumer charge + publisher payout) on the existing CF Queue → usage consumer.

- **Workspaces / Projects** — **Control plane** only (B). The gateway already carries `org_id` on `AuthContext`; we add `project_id` to the key→context lookup so usage/audit events inherit it.

- **Compliance posture** — Enforcement in **gateway** middleware (A) for ZDR/residency/scoping; **audit export** is a **control-plane** job (B) optionally offloaded to the **cluster-runner** (C) for large signed exports; **SSO/SAML** is a control-plane auth route (B).

- **Partner Catalog** — **Control plane** (B); "deploy" actions reuse existing deploy/agent-create runner paths (C).

**New deployable: `cluster-runner` (k8s, BullMQ)** — sibling to `ft-runner`/`deploy-runner`. Owns: dedicated-endpoint provisioning/teardown, reservation pod fleet provisioning, and heavy signed audit exports. Same boot shape (`IORedis` + `Queue`/`Worker` + `Claimer` + health server). Single replica for v1.

**Request flow — consumer calls a private dedicated endpoint:**

1. DNS → CF anycast → Worker isolate; CORS + `requestId` init (existing pre-route).
2. `authMiddleware`: `sha256(key)` → KV → `AuthContext` now carries `org_id`, `project_id`, `zdr_enabled`, `data_region`.
3. `spendCheckMiddleware`: per-key + **per-project** hard-cap check (KV counter).
4. `rateLimitMiddleware`: per-key DO bucket; if the key targets a PTU SKU, a *second* DO check against the project's PTU bucket.
5. **New resolver**: model id is a private slug → look up `inference.dedicated_endpoints` in KV (5-min TTL, Postgres fallback). Assert `endpoint.org_id === auth.org_id` (else 404, never 403 — don't reveal existence). Read `serving_url`.
6. **Residency guard**: if `auth.data_region` is set, assert the endpoint's region matches; else fail closed with a customer-safe "no in-region capacity" message.
7. Forward to the dedicated pod (not OpenRouter), streaming `TransformStream` passthrough; `AbortController` propagates client cancel.
8. `waitUntil` → usage event to CF Queue (carries `org_id`, `project_id`, `endpoint_id`, marketplace `publisher_org_id` if applicable). Consumer writes `inference.usage`.
9. ZDR: if `zdr_enabled`, the usage event omits prompt/completion bodies; only token counts + cost persist.

**Where state lives:** routing/contract/listing metadata + ledgers in **Supabase Postgres** (`inference` + new `marketplace` rows + `billing.active_*`); hot key→context + slug→`serving_url` in **CF KV** (5-min TTL); PTU + rate buckets in **Durable Objects**; usage/audit firehose via **CF Queues** → partitioned `inference.usage`/`audit_log`; reservation/job state in **Postgres** claimed by BullMQ on **Redis**; signed export artifacts in **R2**.

---

## 4. Data model

Migration style matches the repo: `DO $$` policy blocks, `IF NOT EXISTS`, shared `gpu_set_updated_at` trigger, `billing.active_*` with UUID `service_id`, grace-allowlist CHECK extension.

```sql
-- 20260620000001_enterprise_marketplace_cluster.sql
-- Enterprise AI & marketplace: dedicated endpoints, reservations, PTUs,
-- workspaces/projects, marketplace listings + revenue-share ledger.

-- ── Workspaces / projects (governance layer over inference.orgs) ──────
CREATE TABLE IF NOT EXISTS inference.projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  monthly_budget_cents BIGINT,            -- project-level cap, nullable = inherit org
  hard_cap_cents   BIGINT,
  data_region      TEXT,                  -- e.g. 'in-mumbai-1'; NULL = no pin
  default_zdr      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE(org_id, slug)
);
ALTER TABLE inference.api_keys ADD COLUMN IF NOT EXISTS project_id UUID
  REFERENCES inference.projects(id) ON DELETE SET NULL;

-- ── Private dedicated endpoints (single-tenant inference) ─────────────
CREATE TABLE IF NOT EXISTS inference.dedicated_endpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES inference.projects(id) ON DELETE SET NULL,
  routing_slug     TEXT NOT NULL UNIQUE,          -- 'org-acme-llama70b' (brand-free)
  source_model_id  UUID REFERENCES inference.models(id),  -- FT output or base
  gpu_sku          TEXT NOT NULL,                 -- 'h200' | 'b300'
  data_region      TEXT,                          -- residency pin
  hourly_cents     INTEGER NOT NULL DEFAULT 0,
  state            TEXT NOT NULL DEFAULT 'provisioning'
                   CHECK (state IN ('provisioning','running','idle','stopped','error')),
  serving_url      TEXT,                          -- masked; never returned to customer
  serving_pod_id   TEXT,                          -- upstream pod id (server-only)
  reservation_id   UUID,                          -- FK set below
  started_at       TIMESTAMPTZ,
  auto_stop_at     TIMESTAMPTZ,                   -- idle watchdog target
  billing_service_id UUID NOT NULL DEFAULT gen_random_uuid(),  -- UUID meter key
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(billing_service_id)
);

-- ── Reserved GPU cluster + provisioned throughput contracts ───────────
CREATE TABLE IF NOT EXISTS inference.reservations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES inference.projects(id),
  kind             TEXT NOT NULL CHECK (kind IN ('gpu_cluster','provisioned_throughput')),
  gpu_sku          TEXT,                          -- for gpu_cluster
  gpu_count        INTEGER,                       -- reserved GPUs
  ptu_units        INTEGER,                       -- for provisioned_throughput
  model_family     TEXT,                          -- PTU is per family
  data_region      TEXT,
  term_months      INTEGER NOT NULL CHECK (term_months IN (1,3,6,12)),
  committed_hourly_cents BIGINT NOT NULL,         -- discounted committed rate
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','expiring','expired','cancelled')),
  starts_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at          TIMESTAMPTZ NOT NULL,
  billing_service_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(billing_service_id)
);
ALTER TABLE inference.dedicated_endpoints
  ADD CONSTRAINT fk_endpoint_reservation FOREIGN KEY (reservation_id)
  REFERENCES inference.reservations(id) ON DELETE SET NULL;

-- ── Marketplace listings + subscriptions + revenue-share ledger ───────
CREATE TABLE IF NOT EXISTS marketplace.listings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_org_id UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('model','agent')),
  ref_id           UUID NOT NULL,                 -- finetunes.id or agents.id
  public_slug      TEXT NOT NULL UNIQUE,          -- 'acme/legal-summarizer'
  price_per_1k_input_cents  INTEGER NOT NULL DEFAULT 0,
  price_per_1k_output_cents INTEGER NOT NULL DEFAULT 0,
  price_per_call_cents      INTEGER NOT NULL DEFAULT 0,  -- for agents
  rev_share_bps    INTEGER NOT NULL DEFAULT 8000, -- publisher take (80%)
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','published','suspended','delisted')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketplace.subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID NOT NULL REFERENCES marketplace.listings(id) ON DELETE CASCADE,
  consumer_org_id  UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, consumer_org_id)
);
CREATE TABLE IF NOT EXISTS marketplace.payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_org_id UUID NOT NULL,
  listing_id       UUID NOT NULL,
  period_start     TIMESTAMPTZ NOT NULL,
  period_end       TIMESTAMPTZ NOT NULL,
  gross_cents      BIGINT NOT NULL,
  publisher_cents  BIGINT NOT NULL,               -- gross * rev_share_bps/10000
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Billing-spine enrollment: two new active_* tables ─────────────────
CREATE TABLE IF NOT EXISTS billing.active_dedicated_endpoint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL,                        -- = dedicated_endpoints.billing_service_id
  hourly_rate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status TEXT NOT NULL DEFAULT 'active'
         CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);
CREATE TABLE IF NOT EXISTS billing.active_reservation (   -- same shape, service_id = reservations.billing_service_id
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL, hourly_rate NUMERIC(12,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
         CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);

-- RLS: owner SELECT + service_role ALL (repeated per table)
DO $$ BEGIN
  ALTER TABLE inference.projects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE inference.dedicated_endpoints ENABLE ROW LEVEL SECURITY;
  ALTER TABLE inference.reservations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE marketplace.listings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE billing.active_dedicated_endpoint ENABLE ROW LEVEL SECURITY;
  ALTER TABLE billing.active_reservation ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "org members read endpoints" ON inference.dedicated_endpoints
    FOR SELECT USING (inference.is_org_member(org_id));
  CREATE POLICY "service role manages endpoints" ON inference.dedicated_endpoints
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (marketplace.listings: published rows readable by anyone, draft only by publisher)
DO $$ BEGIN
  CREATE POLICY "published listings public" ON marketplace.listings
    FOR SELECT USING (status='published' OR inference.is_org_member(publisher_org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

The grace-lifecycle + notification-outbox CHECK allowlists (migration `…000011` pattern) must be re-extended to add `'active_dedicated_endpoint'` and `'active_reservation'`, and `GRACE_SERVICE_TABLES` in `lib/billing/grace/constants.ts` updated in lockstep — otherwise unpaid dedicated endpoints run free forever (the exact bug `…000011` fixed). New `audit_action` enum values: `endpoint.created/stopped`, `reservation.created/cancelled`, `listing.published/delisted`, `subscription.created`, `project.created/budget_changed`.

---

## 5. API surface

**Customer `/v1/*` (gateway) — OpenAI-compatible where possible.**

`POST /v1/chat/completions` already exists; private and marketplace models are addressed by `model` id:

```jsonc
// Request — private dedicated endpoint
POST /v1/chat/completions
Authorization: Bearer sk-ahura-...
{ "model": "org-acme-llama70b", "messages": [{"role":"user","content":"..."}] }
// Response headers: X-Ahura-Model: org-acme-llama70b · X-Ahura-Cost-Cents: 12
//                   X-Ahura-Region: in-mumbai-1   (no upstream name)
```

```jsonc
// Request — marketplace model (consumer pays listed price, publisher earns share)
POST /v1/chat/completions
{ "model": "market:acme/legal-summarizer", "messages": [...] }
```

`GET /v1/models` — extended to include the caller's private endpoints + subscribed marketplace models, each tagged `"ownership": "dedicated" | "marketplace" | "shared"`. `GET /v1/key` returns `project_id`, `data_region`, `ptu_units` if the key is PTU-bound.

**Dashboard `/api/*` (control plane).**

```
POST   /api/inference/projects                  { slug, name, monthly_budget_cents, data_region }
POST   /api/inference/endpoints                 { source_model_id, gpu_sku, data_region }  → provisions
DELETE /api/inference/endpoints/{id}            → settle + teardown (atomic state flip)
POST   /api/inference/reservations              { kind, gpu_sku, gpu_count|ptu_units, term_months, data_region }
GET    /api/inference/reservations/{id}/usage   → committed vs consumed
POST   /api/marketplace/listings                { kind, ref_id, price_per_1k_input_cents, rev_share_bps }
POST   /api/marketplace/listings/{id}/publish
POST   /api/marketplace/subscriptions           { listing_id }
GET    /api/marketplace/payouts                 → publisher earnings ledger
POST   /api/compliance/audit-export             { from, to, format } → signed R2 url (async via runner)
POST   /api/inference/internal/endpoint-meter   (cron-only, X-Ahura-Internal-Token)
POST   /api/inference/internal/reservation-reconcile (cron-only)
```

```jsonc
// POST /api/inference/endpoints — response
{ "id": "e3a1...", "routing_slug": "org-acme-llama70b",
  "state": "provisioning", "gpu_sku": "h200", "data_region": "in-mumbai-1",
  "hourly_cents": 320, "estimated_ready_seconds": 90 }
// No serving_url, no pod id, no provider name ever returned.
```

---

## 6. Code sketches

**6.1 Gateway resolver — private/marketplace model routing (Hono, repo style).**

```ts
// workers/inference/src/routes/resolve-model.ts
import type { Context } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { customerSafeError } from "../lib/branding.ts";

interface Resolved { upstream: "proxy" | "dedicated"; url?: string; publisherOrgId?: string; }

export async function resolveModel(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  model: string
): Promise<Resolved> {
  const auth = c.get("auth");

  // Private dedicated endpoint: slug owned by the caller's org.
  if (model.startsWith("org-")) {
    const ep = await lookupEndpointCached(c.env, model); // KV 5-min TTL, PG fallback
    if (!ep || ep.org_id !== auth.orgId || ep.state !== "running") {
      // 404 not 403 — never reveal another org's endpoint exists.
      throw customerSafeError(404, "model_not_found", `Unknown model: ${model}`);
    }
    if (auth.dataRegion && ep.data_region !== auth.dataRegion) {
      throw customerSafeError(409, "no_regional_capacity",
        "No capacity available in your pinned region.");
    }
    return { upstream: "dedicated", url: ep.serving_url };
  }

  // Marketplace model: requires an active subscription; bills dual usage.
  if (model.startsWith("market:")) {
    const sub = await lookupSubscriptionCached(c.env, auth.orgId, model.slice(7));
    if (!sub) throw customerSafeError(403, "not_subscribed",
      "Subscribe to this model before using it.");
    return { upstream: "proxy", publisherOrgId: sub.publisher_org_id };
  }

  return { upstream: "proxy" };
}
```

**6.2 cluster-runner job handler — provision a dedicated endpoint (ft-runner lifecycle style).**

```ts
// workers/cluster-runner/src/lifecycle.ts
import type { RunnerCtx } from "./types.js";
import type { Job } from "bullmq";

export interface EndpointJob { endpointId: string; }

export async function runEndpointJob(ctx: RunnerCtx, job: Job<EndpointJob>): Promise<void> {
  const { supabase, gpu, logger } = ctx;
  const { endpointId } = job.data;

  const { data: ep } = await supabase.schema("inference")
    .from("dedicated_endpoints")
    .select("id, org_id, source_model_id, gpu_sku, data_region, billing_service_id")
    .eq("id", endpointId).eq("state", "provisioning").maybeSingle();
  if (!ep) { logger.info({ endpointId }, "already claimed/cancelled"); return; }

  // gpu = brand-hidden GPU client (RunPod now, Yotta fleet later — same interface).
  const pod = await gpu.startDedicatedPod({
    image: await resolveServingImage(ep.source_model_id),
    sku: ep.gpu_sku, region: ep.data_region, isolated: true,
  });

  await supabase.schema("inference").from("dedicated_endpoints")
    .update({ state: "running", serving_url: pod.privateUrl, serving_pod_id: pod.id,
              started_at: new Date().toISOString(),
              auto_stop_at: new Date(Date.now() + 30 * 60_000).toISOString() })
    .eq("id", endpointId);

  // Enroll in the billing spine (hourly meter). Idempotent on service_id.
  await supabase.schema("billing").from("active_dedicated_endpoint").upsert({
    user_id: await payerForOrg(supabase, ep.org_id),
    service_id: ep.billing_service_id,
    hourly_rate: hourlyRateFor(ep.gpu_sku) / 100,
    status: "active",
  }, { onConflict: "service_id" });

  logger.info({ endpointId, podId: pod.id }, "dedicated endpoint live");
}
```

**6.3 Marketplace dual-usage billing — consumer charge + publisher payout accrual.**

```ts
// lib/inference/marketplace-billing.ts  (called from the usage-queue consumer)
import { Billing } from "@/lib/supabase/queries/billing";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function settleMarketplaceUsage(
  supabase: SupabaseClient<any, any, any>,
  ev: { consumerOrgId: string; listingId: string; publisherOrgId: string;
        inputTokens: number; outputTokens: number; periodStart: string; periodEnd: string; }
): Promise<void> {
  const { data: listing } = await supabase.schema("marketplace").from("listings")
    .select("price_per_1k_input_cents, price_per_1k_output_cents, rev_share_bps, status")
    .eq("id", ev.listingId).maybeSingle();
  if (!listing || listing.status !== "published") return;

  const grossCents = Math.ceil(
    (ev.inputTokens  / 1000) * listing.price_per_1k_input_cents +
    (ev.outputTokens / 1000) * listing.price_per_1k_output_cents);
  if (grossCents <= 0) return;

  // Charge the consumer (same prepaid-balance deduct path as every other service).
  const payer = await payerForOrg(supabase, ev.consumerOrgId);
  const usd = grossCents / 100;
  const newBalance = await Billing.deduct(payer, usd);
  await Billing.save_transaction({
    userId: payer, amount: usd, status: "completed", type: "usage",
    balanceAfter: typeof newBalance === "number" ? newBalance : null,
    serviceId: ev.listingId, serviceType: "marketplace_inference",
    periodStart: ev.periodStart, periodEnd: ev.periodEnd,
    description: "Marketplace model usage",
    metadata: { in: ev.inputTokens, out: ev.outputTokens },
  });

  // Accrue the publisher's share into the payout ledger (settled monthly).
  const publisherCents = Math.floor((grossCents * listing.rev_share_bps) / 10000);
  await supabase.schema("marketplace").from("payouts").insert({
    publisher_org_id: ev.publisherOrgId, listing_id: ev.listingId,
    period_start: ev.periodStart, period_end: ev.periodEnd,
    gross_cents: grossCents, publisher_cents: publisherCents, status: "pending",
  });
}
```

---

## 7. Billing

Every service plugs into the existing prepaid-balance + `bill_service_cycle_atomic` + 7-day-grace spine. Two enrollment mechanisms already exist in the repo: **(i)** `billing.active_*` hourly meter rows (for long-lived resources), and **(ii)** per-event `Billing.deduct` + `save_transaction` (for usage). This cluster uses both.

| Service | Pricing unit | Enrollment | Spend-cap interaction |
|---|---|---|---|
| **Private Dedicated Hosting** | per-GPU-hour while `running` | `billing.active_dedicated_endpoint` row, hourly cron meter; settle-on-stop via the serving-pod `settleServingPod` idempotency pattern (atomic state flip = single charge) | Counts against project `hard_cap_cents`; on grace, the per-minute watchdog stops the pod after the 7-day window. |
| **Reserved GPU Cluster** | committed per-GPU-hour (discounted), billed for the **whole term** regardless of utilization | `billing.active_reservation` row; meter charges the committed rate continuously while `status='active'` | Reservation purchase does an upfront balance check; ongoing meter respects grace → auto-cancel after 7 days unpaid. |
| **Provisioned Throughput** | per-PTU-hour (committed floor) + on-demand per-token for overflow | `active_reservation` (kind=ptu) for the floor; overflow tokens metered per-event on the proxy path | PTU floor is pre-paid capacity; overflow respects the key/project hard cap exactly like normal token usage. |
| **Marketplace (consumer)** | publisher-set per-1k-token or per-call | per-event `Billing.deduct` in the usage consumer (sketch 6.3) | Full hard-cap + budget enforcement, same as base inference. |
| **Marketplace (publisher payout)** | rev-share (default 80% publisher / 20% platform) | `marketplace.payouts` accrual ledger → monthly `Billing.credit` to publisher balance | n/a (credit, not charge). Platform keeps the spread + any model markup. |
| **Workspaces / Projects** | free | n/a | *Adds* a project-level budget tier between key and org caps. |
| **Compliance posture** | enterprise add-on (flat monthly) or bundled into contract | `active_platform_apps`-style flat meter, or contract-level invoice | n/a |

Pricing carries a **nonzero markup** (the gap-analysis revenue-floor item): dedicated/reserved GPU-hours are sold above our committed/RunPod cost; marketplace takes a 20% platform cut; PTU is priced for margin over the reserved floor. This is the first cluster designed *with* markup from day 0 rather than the current 0% inference markup. Postpaid invoicing for enterprise contracts is layered on top of the prepaid balance (an org flagged `postpaid` gets a negative-balance allowance reconciled monthly) — flagged as an open item in §9 because it touches the billing-vuln remediation already in flight.

---

## 8. Delivery plan

Slices are shippable increments; estimates in eng-weeks (ew). Sequenced so the highest-leverage enterprise surface (dedicated hosting) lands first and the fleet-dependent pieces sequence behind the DPR.

**Slice 0 — Schema + workspaces (2 ew).** Migration `…000001` (projects, endpoints, reservations, marketplace tables, two `active_*` tables, grace-allowlist + `GRACE_SERVICE_TABLES` extension, audit enum). Add `project_id` to `api_keys` + `AuthContext`. Project CRUD + project-level budget in control plane. *Ships:* workspaces/projects (1.5) standalone. *Cuts for v1:* per-project RBAC beyond inherited org roles.

**Slice 1 — Private Dedicated Hosting (4 ew).** New `cluster-runner` (clone `ft-runner` boot + claimer + health). Provision/teardown + `serving_url` masking + gateway resolver (sketch 6.1) + residency guard. `active_dedicated_endpoint` hourly meter cron sweep + settle-on-stop + idle watchdog reuse. *Depends on:* Slice 0. *Ships:* the flagship enterprise product. *Cuts for v1:* multi-pod autoscaling per endpoint (single pod), custom images beyond the existing serving image.

**Slice 2 — Compliance surfaces (3 ew).** Org-wide ZDR enforcement in gateway, data-residency pinning (region label plumbing, fail-closed guard), signed audit-export job (control plane → runner → R2 signed url), SSO/SAML hook via identity broker. *Depends on:* Slice 0. *Cross-cluster dep:* the certification program (gap #5 / cluster #5) consumes these surfaces — coordinate so SOC2 evidence collection points at the same audit-export. *Cuts for v1:* SCIM provisioning, customer-managed encryption keys.

**Slice 3 — Marketplace (4 ew).** Listing CRUD + publish flow, subscription, dual-usage billing (sketch 6.3), payout ledger + monthly credit job, public catalog page (reuse marketing `ServiceHome*` DNA). *Depends on:* Slice 0; benefits from the existing Agents product for agent listings. *Ships:* monetization for publishers. *Cuts for v1:* third-party (non-org) publishers / KYC, ratings/reviews, agent-listing tool-calling (depends on cluster #13 agent tools).

**Slice 4 — Reserved GPU + PTUs (5 ew).** Reservation purchase + upfront balance gate, `active_reservation` committed meter, capacity reconciler cron, PTU Durable-Object throughput bucket + overflow-to-proxy. *Depends on:* Slice 1 (provisioning path) **and** the Yotta DPR decision for the *own-fleet* economics — ship the RunPod-reserved bridge first, cut over later without contract change. *Cuts for v1:* sub-hour PTU resizing, cross-region reservation pooling.

**Slice 5 — Partner Catalog + postpaid invoicing (3 ew).** Curated catalog + "deploy into workspace" wiring to existing deploy/agent paths; postpaid org flag + monthly reconciliation. *Depends on:* Slices 3–4; postpaid depends on the billing-vuln remediation landing first (§9). *Cuts for v1:* self-serve partner onboarding.

**Total ~21 ew** to full cluster; **Slices 0–2 (~9 ew)** is a coherent "enterprise-ready" v1 that unblocks procurement without waiting on the fleet or marketplace.

---

## 9. Risks & open questions

**Brand-scrub on a single-tenant surface.** Dedicated endpoints expose more operational reality (region, latency, capacity errors) than the shared proxy. Every new error path (no-capacity, provisioning-failed, residency-mismatch) must route through `customerSafeErrorMessage()` and `branding.ts`; the residency label (`in-mumbai-1`) must never resolve to the DC name. *Mitigation:* a brand-scrub audit gate in Slice 1's review, mirroring the existing three-layer discipline.

**Existence-leak via private slugs.** Returning 403 vs 404 for another org's endpoint leaks that the endpoint exists. The resolver (6.1) deliberately returns 404 — but cache timing could still side-channel existence. *Open:* constant-time KV lookup for slug resolution.

**Billing-vuln coupling.** Postpaid invoicing (Slice 5) and reservation upfront charges sit on the same RPCs flagged in the 2026-06 billing audit (public credit-mint, grace gaps, free-fleet TOCTOU). *Hard dependency:* the Tier-1 billing remediations and the topup kill-switch posture must be resolved before postpaid (negative-balance allowance) ships, or we widen the exact exploit surface. Reservation balance gates must use the hardened atomic path, not the legacy RPC.

**Reservation economics before the fleet exists.** Selling a 12-month committed contract while capacity is RunPod-reserved (a bridge) means we carry the term risk on someone else's pricing. *Open:* do we cap reservation terms at 3 months until the Yotta fleet is live, or hedge with RunPod committed Savings Plans? Needs finance + DPR sign-off.

**Marketplace trust & abuse.** Third-party publishers can list models that exfiltrate prompts, return harmful content, or free-ride. *Open for v1:* restrict publishing to verified orgs only; defer external KYC + content moderation of listings to a later slice (depends on cluster #4 moderation/guardrails).

**PTU overflow UX.** When a customer exceeds purchased PTUs and spills to on-demand proxy, the price/latency profile changes mid-stream. *Open:* hard-cap overflow at the PTU boundary (429) vs. silent spill with a cost-header warning? Enterprise buyers usually want predictable spend → default to a per-project overflow toggle.

**cluster-runner as a third k8s runner.** Three BullMQ runners (`ft`/`deploy`/`cluster`) on a 2-node cluster raises Redis-single-instance and node-capacity pressure. *Open:* fold cluster-runner provisioning into `deploy-runner` (shared provisioning concerns) rather than a new deployable, trading separation-of-concerns for fewer moving parts. Recommend a separate runner only if provisioning volume justifies it post-launch.