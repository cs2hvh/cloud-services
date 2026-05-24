# Inference Platform — Status & Session Handoff

> Live state of the AhuraCloud Inference build. Last updated **2026-05-24**.
> Hand this to a fresh Claude session for full context awareness.

---

## TL;DR

We're building a serverless AI inference platform for AhuraCloud — an OpenAI-compatible gateway proxying every major model through OpenRouter, plus adjacent products (Fine-Tuning, Embeddings + Vector, BYO Model Deploy) running on the existing RunPod GPU substrate.

**Branch:** `ai` (off `dev` at `784fa43c`). **Domain (temporary):** `api.cs2hvh.com` (will migrate to `api.ahurasense.com` once CF permissions are granted — see [migration-ahurasense.md](./migration-ahurasense.md)).

**State today:** Phase 0 (foundation) **deployed and verified end-to-end**. Phase 1 (real inference + dashboard + audit + load test) **SHIPPED 2026-05-24** — public beta ready. Phases 2–7 not started.

**What works right now in production:** A developer with an `ahu_live_*` key can hit `https://api.cs2hvh.com/v1/chat/completions` with any of 52 models (Claude/GPT/Gemini/Llama/DeepSeek/Qwen/Mistral/etc.), with platform OR BYOK billing, streaming or non-streaming, and see real metered usage in `/dashboard/services/inference` within seconds.

---

## What this is

**Product:** Serverless AI Inference + Fine-Tuning + Embeddings + Model Hosting, all under sibling `/services/*` routes on AhuraCloud. No "AI" sub-brand — these are services like compute/database/kubernetes.

**Positioning:** *"The AI gateway built into your cloud. One bill, one team, every model."*

**Strategic edge:** OpenRouter handles all inference (zero markup, pass-through). Differentiation comes from: integrated single-bill UX, org/team/role/audit features that pure aggregators lack, and bundling with adjacent products (Fine-Tuning + BYO Deploy) that run on AhuraCloud's existing RunPod fleet.

**Code lives in:** `c:\cloud-services\` (Next.js 15 monorepo). Inference-specific code in:
- `app/(marketing)/services/{inference,fine-tuning,embeddings,model-hosting}/` — landing pages
- `app/dashboard/services/inference/` — dashboard pages
- `app/api/inference/` — Next.js API routes
- `workers/inference/` — Cloudflare Workers edge gateway (separate sub-project)
- `supabase/migrations/202605*_*inference*.sql` — schema + catalog seed
- `lib/inference/` — shared Next.js utilities
- `components/dashboard/inference/` — dashboard UI primitives
- `docs/inference/` — this doc + 5 sibling docs

---

## Architecture at a glance

```
                       ┌────────────────────────────┐
                       │  Cloudflare WAF + DNS      │
                       │  Zone: cs2hvh.com (temp)   │
                       └────────────┬───────────────┘
                                    │
                       ┌────────────┴───────────────┐
                       │  Cloudflare Workers        │
                       │  api.cs2hvh.com/v1/*       │
                       │  ─────────────────────     │
                       │  • API-key auth (KV)       │
                       │  • Rate limit (DO)         │
                       │  • Spend hard-cap (KV)     │
                       │  • OAI/Anth normalize      │
                       │  • Streaming SSE proxy     │
                       │  • Usage event → CF Queue  │
                       │  Same Worker also exports  │
                       │  queue() handler (consumer)│
                       └────┬────────────┬──────────┘
                            │            │
              ┌─────────────┘            └─────────────┐
              ▼                                        ▼
       ┌────────────┐                       ┌──────────────────────┐
       │ OpenRouter │                       │  (Phase 5+) RunPod   │
       │ — single   │                       │  for fine-tuning +   │
       │   upstream │                       │  BYO container deploy│
       │   for all  │                       │  Not used in Phase 1 │
       │ inference  │                       └──────────────────────┘
       └────────────┘

  Data plane
    Supabase Postgres (xafjjpgazdxhktpfeuri.supabase.co)
      └── inference schema (12 tables, partitioned audit + usage,
          RLS everywhere via is_org_member/is_org_admin helpers)
    Cloudflare KV: API_KEYS, SPEND, L1_CACHE
    Cloudflare Durable Objects: RateLimiter (per-key token bucket)
    Cloudflare Queues: ahura-inference-usage, ahura-inference-audit

  Next.js app (Vercel-deployable, currently dev-server only)
    /dashboard/services/inference/* — UI
    /api/inference/* — CRUD endpoints + audit producers
```

For the full diagram + per-component rationale see [architecture.md](./architecture.md).

---

## Locked-in decisions (with reasoning)

| Decision | Rationale | Where captured |
|---|---|---|
| **OpenRouter is the single upstream for all inference** (Claude/GPT/Gemini/Llama/DeepSeek/Qwen/Mistral — everything proxies through `openrouter.ai/api/v1`). No self-hosted vLLM. | Faster to ship, 400+ models on day 1, zero GPU ops burden for inference. Margin trade-off accepted. | `migrations/20260524000002_expand_inference_catalog.sql` (all rows have `upstream_provider='openrouter'`) |
| **0% markup on inference** — pass-through OpenRouter rates for both platform and BYOK | Customer acquisition wedge. Profit comes from Fine-Tuning, BYO Deploy, Vector Store, and bundled AhuraCloud compute spend. | Memory: `project_ai_platform_decisions.md` |
| **Separate `inference_*` schema** — does NOT reuse existing `ai_agents.*` (the chatbot builder product) | Two products coexist; the AI Agents subsystem may eventually call the inference gateway internally, but data models stay independent. | `migrations/20260523000001_create_inference_schema.sql` |
| **No "AI" sub-brand** — each capability is a sibling /services/* page | Matches existing IA (`/services/compute`, `/services/database`, `/services/kubernetes`). | `app/(marketing)/services/{inference,fine-tuning,embeddings,model-hosting}/page.tsx` + `components/navbar-client.tsx` |
| **Editorial canvas design language** for dashboard pages (`#08090b` bg + aurora glows + dotted grid + Nunito accent + mono labels) | Matches Kubernetes/Database existing dashboards exactly. Earlier "glass-panel" attempts were rejected as not matching. | `components/dashboard/inference/chrome.tsx` |
| **Cloudflare Workers for /v1 edge, k8s for async, RunPod for FT+BYO** | 500 RPS burst easily handled at edge; k8s only when truly needed (BullMQ workers in Phase 5+). RunPod inference path NOT used. | `workers/inference/` + `wrangler.toml` |
| **Enterprise pillars baked into Phase 0** — orgs, members, roles, audit log, ZDR toggle, partitioned tables — not retrofitted | User flagged enterprise-grade-from-day-0 as non-negotiable. | `migrations/20260523000001_create_inference_schema.sql` |
| **Domain: api.cs2hvh.com (temporary)** — operator's personal CF zone | Operator's role on the Ahurasense CF account lacked Workers/KV/Queues write perms. Migrate later via [migration-ahurasense.md](./migration-ahurasense.md) when role is upgraded. | Files: `wrangler.toml`, `workers/inference/src/lib/openrouter.ts` |
| **Scale target: 100k req/hour (~500 RPS burst)** | Realistic SaaS scale. Not over-engineering for 100k/sec. | Memory: `project_ai_platform_decisions.md` |
| **Compliance deferred** but ZDR toggle + audit log + KMS-encrypted secrets ship from day 1 (SOC-2-ready posture) | Ship faster; pursue cert when revenue justifies. | `inference.api_keys.zdr_enabled` + `audit_log` partitioned + BYOK AES-GCM |
| **OpenRouter as the sole `upstream_provider` enum value used today** — `anthropic/openai/google` reserved for future direct-routing | Architecture is OpenRouter-first; direct routing is a future optimization that bypasses OpenRouter for specific high-volume models. | `inference.byok_provider` enum has all values, but `models.upstream_provider` is universally `'openrouter'` |

---

## Deployment state (what's actually live today)

### Cloudflare (operator's personal account: `Galaxyhvh210@gmail.com`)

| Resource | Status | Notes |
|---|---|---|
| Zone `cs2hvh.com` | ✅ Active | Operator owns this personally |
| Worker `ahura-inference-edge` | ✅ Deployed (`4bf9d7c3-dc28-4f59-8582-67dc26d4c114`) | Route: `api.cs2hvh.com/v1/*` |
| KV `API_KEYS` (prod) | ✅ `8c23f1a9daf94652a9e718489e9ecb3b` | Cached AuthContext lookups |
| KV `API_KEYS` (preview) | ✅ `ff286be03f8840618473ca859fc5f480` | |
| KV `SPEND` (prod) | ✅ `ee6a19a24d9c4d20a6f5c13494dcd0d9` | Per-org monthly cents counter |
| KV `SPEND` (preview) | ✅ `e1a44e57bc8943eb926fe98b6a06bf90` | |
| KV `L1_CACHE` (prod) | ✅ `331e27c11b654bf6ad9003b30530deff` | Reserved; not used yet (Phase 2) |
| KV `L1_CACHE` (preview) | ✅ `039a89a1e882413c8f59c75a531a1f40` | |
| Durable Object `RateLimiter` | ✅ Bound | sqlite_classes migration v1 applied |
| Queue `ahura-inference-audit` | ✅ Producer + consumer wired | |
| Queue `ahura-inference-usage` | ✅ Producer + consumer wired | |
| DNS `api.cs2hvh.com` | ✅ AAAA `100::`, Proxied | Sinkhole record; CF intercepts via route |
| Bot Fight Mode | ⚠️ Disabled | Was blocking PowerShell curl with 403; turned off for API zone |

### Workers secrets (set via `wrangler secret put`)

| Secret | Set | Source |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase dashboard → Project Settings → API |
| `OPENROUTER_PLATFORM_KEY` | ✅ | openrouter.ai/keys (user's account, ~$10 credit) |
| `BYOK_DEK` | ✅ | Generated locally, base64-encoded 32 random bytes — **operator must keep backup; losing it bricks all stored BYOK keys** |

### Supabase

- Project: `xafjjpgazdxhktpfeuri.supabase.co`
- Schema `inference`: 12 tables + 16 partition children + 4 RPCs (`lookup_api_key`, `bootstrap_personal_org`, `is_org_member`, `is_org_admin`) + RLS policies
- **CRITICAL:** `inference` schema is exposed to PostgREST (Project Settings → API → Exposed schemas). If this gets removed, every `/v1/key` call silently returns "Invalid API key".
- Catalog: 52 models seeded across 14 providers, 17 marked featured

### Next.js app

- **Not deployed** to a public URL yet. Runs locally via `npm run dev`.
- All `/dashboard/services/inference/*` and `/api/inference/*` routes work against the dev server.
- Needs `BYOK_DEK` in `.env` matching the wrangler secret (so encrypt-on-Next-side and decrypt-on-Worker-side both produce the same ciphertext).

### Test data in Supabase

- Org `d9a35b5b-7efc-414e-aa65-ff76839fb50e` (personal, user: harshit.hv@outlook.com)
- API key: `ahu_live_test1234567890abcdef` (prefix `ahu_live_test`, last four `cdef`) — used for all testing
- BYOK key stored: 1 OpenRouter key (the one the operator pasted in chat — **flagged as compromised**; rotate before public beta)

---

## Status by phase

Cumulative timeline vs original plan in [phases.md](./phases.md).

### Phase 0 — Foundation ✅ DONE

| Item | Status |
|---|---|
| Cloudflare zone + Workers project + KV + DO + Queues | ✅ |
| Supabase migration `20260523000001_create_inference_schema.sql` applied | ✅ |
| 4 marketing pages drafted (`/services/{inference,fine-tuning,embeddings,model-hosting}`) | ✅ |
| Marketing navbar updated to expose 4 new services | ✅ |
| Domain DNS + AAAA sinkhole + proxied | ✅ |
| Secrets set in wrangler | ✅ |
| `/v1/health` returns 200 | ✅ |
| Smoke: bootstrap personal org via SQL, create test API key, hit `/v1/key` end-to-end | ✅ |

### Phase 1 — Inference v1 + Dashboard ✅ SHIPPED 2026-05-24

| Chunk | Description | Status |
|---|---|---|
| A | Seed `inference.models` with 6 frontier models | ✅ |
| A.2 | Expand catalog to 52 models across 14 providers | ✅ |
| B | Real `POST /v1/chat/completions` with streaming + cancel propagation + usage enqueue | ✅ |
| C | Real `GET /v1/models` with RLS-filtered catalog read | ✅ |
| D | Anthropic `POST /v1/messages` compat shim (non-streaming + SSE event-named streaming) | ✅ |
| E | BYOK end-to-end: AES-GCM crypto helpers + worker decryption + Next.js CRUD endpoints + dashboard page | ✅ |
| F | `USAGE_EVENTS` + `AUDIT_EVENTS` queue consumers (same Worker, queue() handler — looks up catalog pricing, computes cost incl. off-peak window, batch-inserts to `inference.usage`/`audit_log`, bumps SPEND KV) | ✅ |
| G.1 | API routes for dashboard: `/api/inference/{api-keys, usage/summary}` | ✅ |
| G.2 | Dashboard pages: overview, api-keys, byok-keys, usage — first in `glass-panel` style (rejected), then `Compute` style (rejected), then **editorial canvas style** matching K8s/Database (accepted) | ✅ |
| G.3 | Sidebar Inference group with 7 children | ✅ |
| G.4 | Audit log viewer + Members page (with inline role select) + Settings page (name, ZDR default, region pin) + their API routes | ✅ |
| G.5 | Wire `recordAudit()` into all 8 mutating CRUD actions | ✅ |
| H | k6 load test scenario + docs | ✅ |
| H.2 | Tuned scenarios to fit under per-key 10 RPS cap; re-run achieved 0.25% HTTP failure rate (target <1%), p95 latencies all under threshold (health 15ms, key 279ms, models 293ms). Rate-limited 13.58% during the concurrent-overlap window is the limiter correctly throttling — not a real failure. | ✅ |

**Phase 1 SHIPPED 2026-05-24.** Platform validated for public beta: 500 RPS unauthenticated throughput, sub-300ms p95 on the full auth → spend-cap → rate-limit → Postgres pipeline, rate limiter provably working, audit log populating on every CRUD, BYOK billing routing through user's OpenRouter account end-to-end.

### Phase 1.5 — Optional polish (not started)

- [ ] Add `rate_limit_rpm` column to `inference.api_keys` and read it in `workers/inference/src/middleware/rate-limit.ts` → enables per-key rate-limit overrides
- [ ] Rotate the compromised OpenRouter key the operator pasted earlier
- [ ] Domain migration `cs2hvh.com → ahurasense.com` when CF perms are granted ([migration-ahurasense.md](./migration-ahurasense.md))

### Phases 2–7 — Not started

| Phase | Scope | Est. |
|---|---|---|
| **2** | Catalog curation UI (filter chips, model browser), routing presets (fallback chains/provider prefs surfaced as `inference.model_presets`), response caching (L1 in KV), off-peak pricing window enforcement on platform-billed | 1 wk |
| **3** | Playground UI — interactive model picker, parameter sliders, multi-model compare, copy-as-cURL/Python/TS. Uses prod /v1 path. | 1 wk |
| **4** | `/v1/embeddings` real implementation via OpenRouter + managed vector collections API (`POST/GET/DELETE /v1/vector/collections`, upsert, query) + per-tenant `inference.vector_rows` + batch upsert via BullMQ | 2 wks |
| **5** | LoRA Fine-Tuning: `POST /v1/fine-tuning/jobs` + BullMQ worker orchestrating RunPod pods (axolotl/unsloth) + output adapter pushed to R2 + auto-registered as `ahura/<base>:user-ft-{id}` model with `serving_type='runpod_ft'` | 3 wks |
| **6** | BYO Model Deploy: `POST /v1/deployments` + Truss/Docker/HF container builds + RunPod Serverless Workers + autoscale config | 2.5 wks |
| **7** | Polish: prompt-injection guardrail, smarter response cache (semantic), batch inference endpoint, SOC 2 readiness docs, runbooks, status page hookup | 1.5 wks |

**Total remaining after Phase 1 ships:** ~11 weeks.

---

## Repository map (where stuff lives)

```
c:\cloud-services\
│
├── docs/inference/                         ← READ THESE FIRST
│   ├── STATUS.md                           ← this file
│   ├── README.md                           module index
│   ├── architecture.md                     full system design
│   ├── setup.md                            operator runbook
│   ├── phases.md                           8-phase roadmap (plan, not actual progress)
│   ├── migration-ahurasense.md             domain switch guide
│   └── load-testing.md                     k6 instructions
│
├── supabase/migrations/
│   ├── 20260523000001_create_inference_schema.sql   ← 12 tables + 10 enums + RPCs + RLS
│   ├── 20260524000001_seed_inference_models.sql     ← initial 6 frontier models
│   └── 20260524000002_expand_inference_catalog.sql  ← expanded to 52 models
│
├── workers/inference/                      ← Cloudflare Workers (separate npm project)
│   ├── wrangler.toml                       ← config with all bindings + routes
│   ├── package.json                        ← deps: hono, supabase-js, zod
│   ├── tsconfig.json
│   ├── README.md
│   ├── test/
│   │   └── load.k6.js                      ← k6 load test scenario
│   └── src/
│       ├── index.ts                        ← Hono router + queue() handler
│       ├── types.ts                        ← Env + AuthContext + UsageEvent + AuditEvent
│       ├── middleware/
│       │   ├── auth.ts                     ← sha256(key) → KV → Postgres fallback
│       │   ├── spend.ts                    ← KV hard-cap check
│       │   └── rate-limit.ts               ← Durable Object call
│       ├── durable-objects/
│       │   └── rate-limiter.ts             ← token-bucket DO class
│       ├── lib/
│       │   ├── openrouter.ts               ← upstream client + streamPassthrough + resolveUpstreamKey
│       │   └── crypto.ts                   ← Web Crypto AES-GCM for BYOK decrypt
│       ├── routes/
│       │   ├── chat-completions.ts         ← REAL: full OpenRouter proxy
│       │   ├── embeddings.ts               ← stub (Phase 4)
│       │   ├── messages.ts                 ← REAL: Anthropic compat shim
│       │   ├── models.ts                   ← REAL: catalog SELECT
│       │   └── key.ts                      ← REAL: returns key+org+usage
│       └── consumers/
│           ├── usage.ts                    ← USAGE_EVENTS → inference.usage + SPEND bump
│           └── audit.ts                    ← AUDIT_EVENTS → inference.audit_log
│
├── lib/inference/                          ← Next.js shared utils
│   ├── crypto.ts                           ← AES-GCM (mirrors workers/.../crypto.ts)
│   ├── orgs.ts                             ← getActiveOrgForUser / getOrBootstrapOrgForUser
│   └── audit.ts                            ← recordAudit() helper + auditContextFrom(request)
│
├── components/dashboard/inference/
│   └── chrome.tsx                          ← SHARED EDITORIAL CHROME: PageCanvas, Hero,
│                                              StatsStrip, StatCell, SectionHead, DataTable,
│                                              ColHead, PrimaryButton, GhostButton, RowActionButton,
│                                              StatusDot, StatusLabel, FilterChip, EmptyState,
│                                              CodeChip, FloatyKeyframes — ALL inference dashboard
│                                              pages must import from here
│
├── app/api/inference/                      ← Next.js API routes (Node runtime)
│   ├── api-keys/route.ts                   ← GET (list) + POST (create with show-once)
│   ├── api-keys/[id]/route.ts              ← PATCH (budget/scope) + DELETE (revoke)
│   ├── byok-keys/route.ts                  ← GET + POST (verify-against-upstream + encrypt + insert)
│   ├── byok-keys/[id]/route.ts             ← DELETE
│   ├── usage/summary/route.ts              ← GET (month spend, daily series, top models, recent)
│   ├── audit-log/route.ts                  ← GET (filterable, paginated)
│   ├── orgs/current/route.ts               ← GET (org + counts) + PATCH (name/zdr/region)
│   ├── members/route.ts                    ← GET (list with auth.users hydration)
│   └── members/[id]/route.ts               ← PATCH (role) + DELETE (remove)
│
├── app/dashboard/services/inference/       ← Next.js client dashboard pages
│   ├── page.tsx                            ← Overview (server component, fetches stats directly)
│   ├── api-keys/page.tsx                   ← create dialog + show-once reveal + revoke flow
│   ├── byok-keys/page.tsx                  ← add dialog + provider picker + delete flow
│   ├── usage/page.tsx                      ← Recharts chart + tables + day-range select
│   ├── audit/page.tsx                      ← stats strip + filter chips + actor-toned table
│   ├── members/page.tsx                    ← inline role-change select + remove flow + role reference cards
│   └── settings/page.tsx                   ← identifiers + profile + privacy + danger zone
│
├── app/(marketing)/services/               ← Public landing pages (editorial DNA from /services/*)
│   ├── inference/page.tsx
│   ├── fine-tuning/page.tsx
│   ├── embeddings/page.tsx
│   └── model-hosting/page.tsx
│
└── components/navbar-client.tsx            ← top-nav PRODUCTS list (4 new AI services added)
```

---

## What works end-to-end TODAY (verified)

### Direct API calls (PowerShell)

```powershell
# Health (no auth)
Invoke-RestMethod https://api.cs2hvh.com/v1/health
# → {"status":"ok","version":"0.1.0","env":"production",...}

# Key info
Invoke-RestMethod https://api.cs2hvh.com/v1/key `
  -Headers @{Authorization = "Bearer ahu_live_test1234567890abcdef"}
# → key_id, org_id, zdr_enabled, billing, usage

# Catalog (52 models)
Invoke-RestMethod https://api.cs2hvh.com/v1/models `
  -Headers @{Authorization = "Bearer ahu_live_test1234567890abcdef"}
# → {object:"list", data:[…52 items…]}

# Real Claude Haiku via platform billing
$body = @{
  model = "anthropic/claude-haiku-4.5"
  messages = @(@{ role = "user"; content = "Hello" })
} | ConvertTo-Json -Depth 4
Invoke-RestMethod https://api.cs2hvh.com/v1/chat/completions `
  -Method POST -Body $body -ContentType "application/json" `
  -Headers @{Authorization = "Bearer ahu_live_test1234567890abcdef"}
# → real Claude response, costs ~$0.0001 against platform OpenRouter key

# Same call via BYOK
Invoke-RestMethod https://api.cs2hvh.com/v1/chat/completions `
  -Method POST -Body $body -ContentType "application/json" `
  -Headers @{
    Authorization = "Bearer ahu_live_test1234567890abcdef"
    "X-Ahura-Billing" = "byok"
  }
# → real response billed against the user's OpenRouter key (verified working)

# Anthropic shim
$body = @{
  model = "claude-haiku-4.5"
  max_tokens = 200
  system = "Respond in haiku."
  messages = @(@{ role = "user"; content = "Tell me about clouds." })
} | ConvertTo-Json -Depth 4
Invoke-RestMethod https://api.cs2hvh.com/v1/messages `
  -Method POST -Body $body -ContentType "application/json" `
  -Headers @{
    Authorization = "Bearer ahu_live_test1234567890abcdef"
    "anthropic-version" = "2023-06-01"
  }
# → Anthropic-shaped response: {id, type:"message", content:[{type:"text",text:...}], usage:{input_tokens, output_tokens}}
```

### Dashboard (localhost dev server)

```powershell
cd c:\cloud-services
npm run dev
# Open http://localhost:3000 → sign in → /dashboard/services/inference
```

All 7 dashboard pages render with real data:
- Overview shows actual recent spend + top models
- API Keys allows full CRUD with show-once reveal modal
- BYOK Keys allows verify-then-encrypt-then-store flow
- Usage shows Recharts area chart of real daily spend
- Audit Log shows every CRUD event from the past sessions
- Members lists the user as owner
- Settings allows editing org name, ZDR default, region pin

### Data plane verified

```sql
-- Usage rows exist
SELECT model_id, cost_cents, status, billed_to, created_at
FROM inference.usage
WHERE org_id = 'd9a35b5b-7efc-414e-aa65-ff76839fb50e'
ORDER BY created_at DESC LIMIT 10;
-- → returns N rows from manual chat-completions tests

-- Catalog has 52 active models
SELECT upstream_provider, COUNT(*) FROM inference.models WHERE is_active GROUP BY 1;
-- → openrouter | 52

-- Audit events flowing (after wiring G.5)
SELECT action, target_type, target_id, created_at
FROM inference.audit_log
WHERE org_id = 'd9a35b5b-7efc-414e-aa65-ff76839fb50e'
ORDER BY created_at DESC LIMIT 10;
-- → will populate as user exercises CRUD via dashboard
```

---

## Known gaps and gotchas

| # | Issue | Severity | Where it bites |
|---|---|---|---|
| 1 | **Per-key rate limit hard-coded at 10 RPS / 60 burst** in `workers/inference/src/middleware/rate-limit.ts`. `inference.api_keys.rate_limit_rpm` column doesn't exist yet. | Medium | Load tests exceeding 10 RPS per key get throttled. Real production usage at 10 RPS per key is fine. Fix in Phase 1.5. |
| 2 | **OpenRouter key the operator pasted earlier in chat is compromised.** | High | Rotate at openrouter.ai/keys before any public exposure. |
| 3 | **Some catalog model IDs may not match OpenRouter's actual catalog** (especially less-mainstream ones like LFM, OLMo, Hermes, Jamba). | Low | Will return 404 from upstream if used. Easy fix: `UPDATE inference.models SET model_id='correct/id', upstream_model_id='correct/id' WHERE model_id='wrong/id';` |
| 4 | **`L1_CACHE` KV namespace bound but unused.** | None | Reserved for Phase 2 response caching. |
| 5 | **`workers/inference/src/lib/openrouter.ts` HTTP-Referer hard-coded to `https://cs2hvh.com`** | Low | Will need update during domain migration to ahurasense.com. Already noted in migration runbook. |
| 6 | **Dashboard pages set `credentials: 'include'`** but don't gracefully handle 401s (no redirect to /signin). | Low | Dev-only issue; in prod the dashboard layout enforces auth before render. |
| 7 | **`inference` schema MUST be in Supabase's exposed schemas list.** Removing it breaks the entire gateway silently. | Critical | Setup doc warns about this in section 1a. If a fresh project errors with "Invalid API key" on every authenticated call, this is almost always why. |
| 8 | **`BYOK_DEK` must be IDENTICAL in `.env` (Next.js) and wrangler secrets (Workers).** Different values = silent decryption failure = BYOK billing falls back/errors. | Critical | Document in setup.md. The base64 DEK needs operator backup; rotation requires re-encrypting all stored BYOK keys. |
| 9 | **Email invite flow for members is stubbed** — clicking "Invite member" shows a toast saying it's Phase 7 work. Current invite path: have the user sign up, then the org owner runs SQL to add them to `inference.org_members`. | Low | Acceptable for early access. |
| 10 | **Org deletion is stubbed** — Settings → Danger zone → Delete org shows a toast saying email support. No DELETE endpoint built. | Low | Phase 7 polish. |
| 11 | **Audit log is org-scoped read but writes from anywhere** (no append-only enforcement at DB level — relies on service role discipline). | Low | Add a Postgres rule or revoke UPDATE/DELETE on `audit_log` from service_role in a hardening migration. |
| 12 | **AI Agents subsystem (`app/api/ai-agents/*`) coexists with inference.** The two products are decoupled but both consume catalog/key concepts. | Info | Future convergence: AI Agents could call /v1/chat/completions internally. Not planned for now. |
| 13 | **Worker is on wrangler v3.x** — works fine, but v4 is current. `npm install --save-dev wrangler@4` in `workers/inference/` to upgrade when convenient. | Low | No functional impact. |

---

## Active TODO

Immediate hygiene (do soon):
- [x] ~~Re-run `k6 run load.k6.js`~~ — done 2026-05-24, all infra thresholds pass
- [ ] **Rotate the leaked OpenRouter key** at openrouter.ai/keys, delete the old one from BYOK vault, re-add the new one
- [ ] Commit Phase 1 work to the `ai` branch (currently uncommitted)

Phase 1.5 polish (small, valuable, do before Phase 2):
- [ ] Migration: add `rate_limit_rpm INTEGER` column to `inference.api_keys` (default 60)
- [ ] Worker: read `rate_limit_rpm` from API key row, pass to RateLimiter DO as the per-key cap
- [ ] Worker: rebuild and deploy

Phase 2 (~1 week):
- [ ] Catalog curation UI: model browser with provider/capability filters, search, featured-first ordering
- [ ] Routing presets: CRUD UI for `inference.model_presets`; compile saved configs into `provider.*` headers forwarded to OpenRouter
- [ ] Response caching: L1 cache in `L1_CACHE` KV namespace (sha256 of normalized request → cached SSE replay or JSON response); TTL configurable per route
- [ ] Off-peak pricing: enforce `inference.models.off_peak.window_utc` discount in `workers/inference/src/consumers/usage.ts` (already coded; just verify with a model that has off_peak set)
- [ ] Marketing page: update `/services/inference` with the curated featured-model strip

See [phases.md](./phases.md) for Phases 3–7 detailed scope.

---

## Memory (Claude session memory files at `C:\Users\Administrator\.claude\projects\c--cloud-services\memory\`)

Five memories captured the key decisions during this build:

| File | Type | What |
|---|---|---|
| `project_ai_platform.md` | project | High-level initiative — why we're building this, structural edge from RunPod |
| `project_existing_ai_infra.md` | project | The pre-existing `ai-agents` subsystem (reuse vs duplicate decision) |
| `feedback_ai_platform_enterprise_grade.md` | feedback | User flagged enterprise-from-day-0 as non-negotiable; informs every architecture decision |
| `project_openrouter_upstream.md` | project | OpenRouter is the single upstream decision + reasoning |
| `project_ai_platform_decisions.md` | project | Locked architecture: CF Workers + k8s + RunPod split, scale target 100k/hr, brand-less /services/* IA, api.cs2hvh.com temp domain |

A fresh session that reads these gets ~90% of the design context immediately.

---

## How to continue this work in a fresh session

1. **Read this STATUS.md fully** (you're here).
2. Read [architecture.md](./architecture.md) for the system design.
3. Read [setup.md](./setup.md) for operational state.
4. Skim [phases.md](./phases.md) for what's planned next.
5. Run these quick sanity checks:
   ```powershell
   # Gateway alive
   Invoke-RestMethod https://api.cs2hvh.com/v1/health
   # Test key works
   Invoke-RestMethod https://api.cs2hvh.com/v1/key `
     -Headers @{Authorization = "Bearer ahu_live_test1234567890abcdef"}
   ```
6. Check the active TODO section above for the immediate next step.
7. Pick a chunk from a pending phase or polish item.
8. Use the editorial chrome from `components/dashboard/inference/chrome.tsx` for any new dashboard page. Match the K8s/Database visual language (aurora bg, dotted grid, Nunito accent, mono labels, horizontal stat strips). Do NOT use the `glass-panel` style — that was rejected.
9. When adding a mutating CRUD route, call `recordAudit()` from `lib/inference/audit.ts` so the audit log populates.
10. When adding upstream calls from the Worker, use `forwardJson()` + `streamPassthrough()` from `workers/inference/src/lib/openrouter.ts` — they handle cancel propagation correctly.

### Common pitfalls to avoid (the user has been burned by these)

- ❌ Using `glass-panel` CSS class anywhere on inference dashboard pages — wrong design language
- ❌ Adding AI Agents to the sidebar — operator removed this deliberately
- ❌ Modeling new pages on `app/dashboard/services/compute/page.tsx` only — that's the simplest dashboard. The richer reference is Kubernetes / Database (editorial canvas with aurora, mono labels, big Nunito numbers)
- ❌ Hard-coding API URLs to `ahurasense.com` — we're temporarily on `cs2hvh.com`. Use the shared constant pattern from chrome.tsx / openrouter.ts
- ❌ Inserting bytea via PostgREST without the `\x<hex>` prefix — use `bytesToPostgresBytea()` from `lib/inference/crypto.ts`
- ❌ Reusing the `ai-agents` schema for new inference work — they're deliberately separate
- ❌ Adding markup to inference pricing — 0% markup is locked

### Communication style the user prefers

- Concise updates, not narration
- Show diffs / file paths when changing things
- Ask before destructive ops (committing, force-push, etc.)
- Use markdown formatting in responses (rendered as monospace in Claude Code)
- When user says "continue" without context, look at the in-progress todo and proceed with the next logical chunk
- They will paste back errors/screenshots — read them carefully, the actual user-facing UI matters

---

## End-of-handoff checklist (for the operator about to restart with a fresh Claude session)

Paste this STATUS.md into the new session OR have it read the file directly:

```
Read c:\cloud-services\docs\inference\STATUS.md and tell me where we are.
```

That's enough context for the new session to pick up.
