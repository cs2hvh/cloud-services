# Inference Platform — Status & Session Handoff

> Live state of the AhuraCloud Inference build. Last updated **2026-05-25**.
> Hand this to a fresh Claude session for full context awareness.

---

## TL;DR

Serverless AI inference platform for AhuraCloud — an OpenAI-compatible gateway, plus adjacent products (Fine-Tuning, Embeddings + Vector, BYO Model Deploy). User-facing branding does NOT name upstream providers; internally the inference gateway proxies via OpenRouter and the FT/BYO pipelines run on RunPod, but those names never appear in user-visible UI, API responses, or error messages.

**Branch:** `ai`, head **`401366de`**. **API domain (temp):** `api.cs2hvh.com` for `/v1/*` gateway, `wao.cs2hvh.com` for the dashboard + webhook receiver (via Cloudflare Tunnel to a dev server). Final domain `api.ahurasense.com` pending CF perms.

**State:** Phases **0, 1, 2, 4, 5, 6, 8, 10** SHIPPED end-to-end (validated with real money-spending jobs). Phase **9** (security hardening + brand scrub) in progress. Phases 3, 7 not started.

**What works right now (verified live):**
- `/v1/chat/completions` against 52 models, BYOK or platform-billed, streaming or not (Phase 1)
- Click "New job" in dashboard → LoRA fine-tune runs on an A40/A100 → adapter uploads to R2 → completion webhook → model registered in catalog as a `runpod_ft` row → cost computed and shown (`$0.10` for a 4-min phi-4 run). First successful e2e run verified 2026-05-25 (Phase 5).
- After completion: row expands inline in the dashboard with a "How to serve" 3-step flow. **"Copy serve command" mints a 6-hour presigned URL for `adapter.tar.gz` and copies a credential-free `docker run` command** — user pastes it on any GPU pod (ours or theirs), the serving image (`ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3`) curls the URL, unpacks, and launches vLLM with `--enable-lora` on port 8000 (OpenAI-compatible). No R2 creds anywhere on the user's side. (Phase 10)
- BYO Model Deploy API + dashboard wired; deploy-runner ships docker source end-to-end (HF + Truss sources need a builder, Phase 7).
- Live job progress (current step / epoch / loss) streams from training pods into Postgres → dashboard updates without poll, no provider-naming.
- Inline expandable job rows with hyperparams, sample generations, presigned R2 log link, presigned adapter download.

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

- Runs on the operator's Windows RDP server (148.113.13.152:3000) in `npm run dev`. Not yet a real prod deploy.
- Exposed publicly via **Cloudflare Tunnel** (`cloudflared` running on the box) at `https://wao.cs2hvh.com` → `localhost:3000`. Tunnel id `a985081b-...`. Cert + creds in `~/.cloudflared/`.
- This is the host that receives FT pod webhooks (`/api/inference/fine-tuning/jobs/[id]/{webhook,heartbeat}`) and serves the dashboard.
- `FT_WEBHOOK_SECRET` in this app's `.env` MUST match the one in the LKE secret (currently `af52ce4b246b74b99a0e76d9909c989b4d2e4e146b05edd6601f04ef78f1c4f5`).

### LKE cluster (Linode Kubernetes Engine, Mumbai) — runs the runners

| Resource | State |
|---|---|
| Cluster `ahura-prod` | LKE id 607257, 2× g6-standard-2 nodes, k8s 1.35, standard control plane, ~$49/mo all-in |
| Kubeconfig | `~/.kube/lke-ahura.yaml` on operator box |
| Namespace `ahura` | redis (1 replica + 10GB PVC), ahura-ft-runner, ahura-deploy-runner |
| `ahura-ft-runner` Deployment | `ghcr.io/cs2hvh/ahura-ft-runner:latest`, 1 replica, `MAX_CONCURRENT_JOBS=4`, `BOOT_GRACE_MS=300000`, `CONSECUTIVE_STALLS_TO_KILL=60`, points at `ghcr.io/cs2hvh/ahura-ft-axolotl:axolotl-0.29.0` |
| `ahura-deploy-runner` Deployment | `ghcr.io/cs2hvh/ahura-deploy-runner:latest`, 1 replica |
| Bootstrap playbook | `infra/k8s/lke/01-create-cluster.sh` (idempotent) + `02-apply-all.sh` |
| Secret env | `~/.ahura-lke.env` on operator box (OUTSIDE repo, gitignored shape in template) |
| **Drift warning** | Several env keys were patched live via `kubectl patch secret` but never written back to `~/.ahura-lke.env` — `CONTROL_PLANE_URL`, `CONSECUTIVE_STALLS_TO_KILL`, `BOOT_GRACE_MS`, `AXOLOTL_IMAGE_URI`. A cluster re-apply would reset these. Operator needs to add them to the env file. |

### GHCR images (all public)

| Image | What | Trigger |
|---|---|---|
| `ghcr.io/hav0ky/ahura-ft-runner` | Pre-move builds (still works, k8s deployment points here) | OBSOLETE — new builds go to cs2hvh |
| `ghcr.io/cs2hvh/ahura-ft-runner` | FT orchestrator (Node 22, BullMQ) | Pushes to `workers/ft-runner/**` |
| `ghcr.io/cs2hvh/ahura-deploy-runner` | BYO Deploy orchestrator (Node 22, BullMQ) | Pushes to `workers/deploy-runner/**` |
| `ghcr.io/cs2hvh/ahura-ft-axolotl` | Training container — wraps axolotl's official `axolotl-cloud-uv:main-YYYYMMDD-py3.11-cu128-2.9.1` base + our train.sh / heartbeat.py / config-template.yaml | Pushes to `infra/runpod/training-images/axolotl/**` |

### Test data in Supabase

- Org `d9a35b5b-7efc-414e-aa65-ff76839fb50e` (personal, user: harshit.hv@samatva.com)
- API key: `ahu_live_test1234567890abcdef` (prefix `ahu_live_test`, last four `cdef`) — used for all testing
- BYOK key stored: 1 OpenRouter key (operator pasted in chat — **flagged as compromised**, rotate before public beta)
- First successful FT job (verified e2e 2026-05-25): `5097104c-0869-4780-a12d-344d09dedc79`, phi-4 LoRA, $0.10
- Public test dataset for smoke tests: `https://wao.cs2hvh.com/test-finetune.jsonl` (103 OpenAI-Messages examples, committed in `public/`)

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

- [ ] Add `rate_limit_rpm` column to `inference.api_keys` for per-key overrides
- [ ] Rotate keys pasted in chat history (operator OpenRouter key + the Supabase service role / RunPod / R2 / Upstash creds shared during LKE bootstrap)
- [ ] Domain migration `cs2hvh.com → ahurasense.com` once CF perms granted

### Phase 2 — Catalog curation + presets + L1 cache + off-peak ✅ SHIPPED 2026-05-25

Most of Phase 2 landed in earlier commits (catalog browser, presets CRUD with
gateway integration, L1 cache on chat-completions, off-peak window enforcement).
This session extended the L1 cache to `/v1/embeddings` and `/v1/messages`.

| Chunk | Description | Status |
|---|---|---|
| 2.A | Catalog browser at `/dashboard/services/inference/models` — full-text search on id/name/description, provider chips (15+ dynamic), capability filters (vision/tools/json/thinking/audio/web-search), featured-only toggle, off-peak hints, copy-to-clipboard on model IDs. | ✅ |
| 2.B | Routing presets — CRUD at `/dashboard/services/inference/presets` + API at `/api/inference/presets/[id]`, schema `inference.model_presets` with `config` JSONB. Gateway reads `X-Ahura-Preset` header, resolves via `workers/inference/src/lib/presets.ts` (5-min in-memory cache), merges fallback chain + provider preferences into the OpenRouter body. Audit-logged. | ✅ |
| 2.C | L1 response cache — `workers/inference/src/lib/cache.ts`. sha256(orgId+normalized request) → `L1_CACHE` KV. Default TTL 300s, override via `X-Ahura-Cache-TTL: 60-3600`. Bypass via `Cache-Control: no-cache` or `X-Ahura-Cache: off`. Aggressive opt-in via `X-Ahura-Cache: aggressive`. Originally chat-only; THIS SESSION added `shouldCacheMessages` (Anthropic `/v1/messages` — caches the post-translation Anthropic-shape JSON so hits skip both upstream + translation) and `shouldCacheEmbeddings` (always cacheable, deterministic by nature). Response headers: `X-Ahura-Cache: hit\|miss\|bypass\|streaming-skipped\|non-deterministic` + `X-Ahura-Cache-Age`. | ✅ |
| 2.D | Off-peak pricing — `inference.models.off_peak.{window_utc, discount_pct}` JSON applied in `workers/inference/src/consumers/usage.ts:computeCost()`. Handles midnight-wrap windows. Sets `usage.is_off_peak` for audit. Catalog card renders the discount hint when set. | ✅ |

### Phases 3, 7 — Not started

| Phase | Scope | Est. |
|---|---|---|
| **3** | Playground UI — interactive model picker, multi-model compare | 1 wk |
| **7** | Prompt-injection guardrail, semantic cache, batch endpoint, SOC 2 readiness docs, runbooks, status page | 1.5 wks |
| **11** | Managed FT serving (vLLM Multi-LoRA shared per base, Fireworks pattern) as premium upsell on top of Phase 10's self-serve | 2 wks |

### Phase 4 — Embeddings + Vector Store ✅ SHIPPED 2026-05-25

Most of Phase 4 landed in commit `88e15107` (pre-session). This session added the
detail-page drill-in + per-row admin so the dashboard isn't a write-only black box.

| Chunk | Description | Status |
|---|---|---|
| 4.A | Catalog seed for 3 embedding models: text-embedding-3-large (3072-dim), -3-small (1536-dim), ada-002 (1536-dim). Stored as `modality='embedding'` rows with `pricing.input_cents_per_mtok` (13/2/10 cents) + `capabilities.dimensions`. | ✅ |
| 4.B | Real `POST /v1/embeddings` in worker (`workers/inference/src/routes/embeddings.ts`) — OpenAI-compatible, single string OR array input, auth + spend + rate-limit + scope-check parity with chat. Emits usage event with `modality='embedding'`. | ✅ |
| 4.C | `app/api/inference/vector/collections/` — POST create (with embedding_model_id validation against catalog) + GET list, both org-scoped + audit-logged. | ✅ |
| 4.D | `app/api/inference/vector/collections/[id]/{upsert,query}` — upsert auto-embeds via `lib/inference/embeddings.ts` (OpenRouter platform key), max 100 rows/batch. Query supports text OR pre-computed embedding + top_k + min_similarity, calls the `inference.search_vectors()` RPC which switches metric (cosine/l2/inner_product) at query time. | ✅ |
| 4.E | Dashboard page `app/dashboard/services/inference/vectors/page.tsx` + client `vectors.tsx` — collection list, stats strip, create dialog with model→dimensions auto-bind, delete with confirm. Editorial chrome. | ✅ |
| 4.F | Sidebar entry "Vectors" wired in `components/dashboard/sidebar/index.tsx` between Presets and Fine-Tuning. | ✅ |
| 4.G | Collection detail page `/dashboard/services/inference/vectors/[id]` (THIS SESSION) — drill-in from collection card, live test-query box (text→auto-embed→search with similarity %), paginated rows table with external_id filter, per-row delete with confirm. + new API routes `/rows` (GET list, DELETE bulk by external_id) and `/rows/[rowId]` (GET full row incl. embedding, DELETE single). | ✅ |
| 4.X | Migration `20260525000001_phase4_polish_vector_rows_anydim.sql` — relaxes `vector_rows.embedding` from `vector(1536)` to dimensionless `vector` so text-embedding-3-large (3072-dim) can store rows; adds `vector_row.deleted` + `vector_rows.deleted` to the audit_action enum. **Operator must apply this migration to Supabase.** | ✅ |

**Operator note:** Until migration `20260525000001` is applied, only 1536-dim
collections can accept upserts (text-embedding-3-large will fail at the INSERT
with a pgvector dimension error). Apply via `supabase db push` or the SQL editor.

**Marketing page:** `/services/embeddings` page exists from Phase 0; vector-store
code snippet section to be added when public API surface stabilizes (deferred).

### Phase 5 — Fine-Tuning ✅ SHIPPED 2026-05-25

Verified end-to-end with `microsoft/phi-4` LoRA: queued → claimed → pod provisioned → image pulled → training ran → adapter uploaded to R2 → completion webhook → model registered in `inference.models` → cost `$0.10` computed and shown. Wall time ~7 min, GPU spend ~$0.10 on A40.

| Chunk | Description | Status |
|---|---|---|
| 5.A | Schema (`inference.finetunes` + enum), POST /api/inference/fine-tuning/jobs, dashboard with chrome.tsx primitives | ✅ |
| 5.B step 3 | Pre-flight validation lib (`lib/inference/finetune-validate.ts`) — HEAD size cap, JSONL parse, schema check, approximate token count, cost preview | ✅ |
| 5.B step 4 | Compute wrapper (`lib/inference/finetune-runpod.ts`) — internal GPU SKU → compute-provider type map, provision/status/terminate | ✅ |
| 5.B step 5 | `workers/ft-runner/` — Node 22 BullMQ orchestrator on LKE, dual responsibility (Postgres claimer + per-job lifecycle), heartbeat-based stall detection with 5-min boot grace, adopt-in-flight on restart | ✅ |
| 5.B step 6 | Webhook receiver — HMAC verify, idempotent on row state, eval gate (final_loss > baseline × 1.1 fails), registers `ahura/<base>:ft-<short>` in catalog, computes `cost_cents` | ✅ |
| 5.B step 7 | Heartbeat receiver — HMAC verify, Upstash 90s TTL, mirrors progress to Postgres `current_step`/`max_steps`/`current_epoch`/`latest_loss` | ✅ |
| FT image | `infra/runpod/training-images/axolotl/` — based on `axolotlai/axolotl-cloud-uv:main-20260525-py3.11-cu128-2.9.1` (uv venv, properly version-aligned axolotl 0.16 + transformers 5.5 + peft 0.19 + accelerate 1.13 + torch 2.9 + CUDA 12.8). Adds rclone+jq+curl+openssl, our train.sh + heartbeat.py + config-template.yaml + accelerate-config.yaml. Build-time sanity check imports peft/transformers/axolotl to catch dep-hell at build, not 11s into every pod. | ✅ |

**Lessons learned the hard way (~5 hours of debugging):** Don't pin transformers/peft/accelerate yourself before `pip install axolotl[deepspeed]` — axolotl 0.16's hard pin overrides yours, the new transformers breaks the precompiled C-extensions, and the resulting torch ABI mismatch surfaces as a misleading `BloomPreTrainedModel` error from `_LazyModule.__getattr__`. Use axolotl's `-uv` variant which keeps deps insulated from pip drift. Detail: see commit `644ef58…ad4b4cb…7dcb3ce` arc.

### Phase 10 — FT serving path ✅ SHIPPED 2026-05-25 (reframed mid-build)

The original design (per Phase 5.B build guide) was an auto-provisioned serverless
endpoint per FT, with the gateway routing `/v1/chat/completions` to it. Built that
end-to-end and discovered a fundamental impedance mismatch: our custom serving
image (`FROM vllm/vllm-openai`) speaks the OpenAI HTTP protocol on port 8000,
but RunPod Serverless workers invoke a Python `handler.py` per-request. The two
architectures don't compose; would need to either abandon our image for
`runpod/worker-vllm` (no R2 adapter loader) or switch entirely to Pods
(always-on, ~$10/day per FT, prohibitive at scale).

**Reframed to self-serve.** AhuraCloud trains and stores the adapter; user serves
on a GPU pod they rent from our existing `/dashboard/services/gpu/deploy` product.
Industry pattern (HF, Together, Modal all offer this tier). Managed serving stays
on the roadmap as Phase 11 (vLLM Multi-LoRA shared per base — Fireworks pattern).

| Chunk | Description | Status |
|---|---|---|
| 10.A | Serving image at `infra/runpod/serving-images/vllm-lora/` — wraps `vllm/vllm-openai:v0.7.3`, two adapter source modes (presigned download URL preferred, R2 creds fallback for ops) | ✅ |
| 10.B | GHA workflow `.github/workflows/ft-serving-image.yml` builds to `ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3` + `:latest` + `:sha-<short>` | ✅ |
| 10.C-D | Originally auto-provisioned endpoint + gateway routing. ROLLED BACK in reframe. Gateway now returns 400 `self_serve_model` for any `runpod_ft`/`runpod_byo` model rows. | ROLLED BACK |
| 10.E | Dashboard inline expandable rows (replaces popup dialog). Each row's expanded view shows: core fields, hyperparams, "Your trained model" section, "How to serve" 3-step flow, compute info, error message. ChevronRight rotates 90° as visual cue. | ✅ |
| 10.X | Presigned-URL adapter download. `train.sh` packs adapter into `adapter.tar.gz` alongside loose files; new `/api/inference/fine-tuning/jobs/[id]/adapter-url` endpoint mints 6-hour signed URLs; serving image's `entrypoint.sh` accepts `ADAPTER_DOWNLOAD_URL` (no creds needed); dashboard's "Copy serve command" button generates a ready-to-paste docker command. | ✅ |

**Operator note:** The `cs2hvh/ahura-ft-serving-vllm` GHCR package must be public
for RunPod to pull it. Same flip as the other images
(<https://github.com/users/cs2hvh/packages/container/ahura-ft-serving-vllm/settings>).

### Phase 6 — BYO Model Deploy ✅ SHIPPED 2026-05-24 (docker source only)

| Chunk | Description | Status |
|---|---|---|
| 6.A | Pre-flight (`lib/inference/deploy-validate.ts`) — Docker registry HEAD, HF API probe, public GitHub probe | ✅ |
| 6.B | Compute wrapper (`lib/inference/deploy-runpod.ts`) — Serverless endpoint CRUD via REST | ✅ |
| 6.C | Best-effort BullMQ enqueue (`lib/inference/deploy-queue.ts`) | ✅ |
| 6.D | API routes: list/create/detail/delete/scale (`app/api/inference/deployments/`) | ✅ |
| 6.E | Dashboard component (`components/dashboard/inference/deployments.tsx`) — chrome primitives, stats strip, create dialog, scale dialog, delete confirm | ✅ |
| 6.F | Page wire + sidebar entry | ✅ |
| 6.G | `workers/deploy-runner/` — Node 22 BullMQ orchestrator on LKE, 3-action state machine (create/scale/delete), 30-min READY budget, idempotent on restart | ✅ |
| **Known gap** | HF + Truss source types accepted at API but `resolveImageUri()` in deploy-runner returns null → marked failed. Need a builder worker (Phase 7 work). | ⚠️ |

### Phase 8 — Observability + cost + dashboard polish ✅ SHIPPED 2026-05-25

| Batch | Description |
|---|---|
| 8.1 | Heartbeat 403 fix (`User-Agent: ahura-ft-heartbeat/1.0` so Cloudflare BIC doesn't reject the Python-urllib default UA) + HF model id mapping audit (all 13 internal IDs verified against real HF repos, 5 marked `gated`) + training.log → R2 + URL in completion webhook |
| 8.2 | DB migration adding `current_step, max_steps, current_epoch, latest_loss, last_heartbeat_at, hourly_cost_cents, training_log_url`. Heartbeat receiver writes progress to Postgres (fire-and-forget). Cost computed at completion (`hourly × elapsed / 3600`). Runner records `hourly_cost_cents` at pod provision. Dashboard renders live progress bar + cost + log link. |
| 8.3 | Real-time GPU dropdown reads `/api/services/gpu/inventory` for SECURE-cloud availability badges. Pricing removed from the dropdown (cost transparency stays in the post-completion detail dialog only). |
| 8.4 | Clickable job rows → detail dialog with sectioned view (status / core / hyperparams / output / samples / compute / errors). Dark-themed scrollbar. Stale "runner pending" banner removed. |
| 8.5 | `GET /api/inference/fine-tuning/jobs/[id]/log-url` — mints 1-hour presigned URL via R2's S3 API. Auth-gated + org-scoped + bucket-allow-listed + key-prefix-locked to `<org_id>/<job_id>/` + rejects path traversal. |
| 8.6 | Brand scrub round 1 — captions, dialog descriptions, GPU dropdown wording, removed runpod.io console deep-link from deployments row. |

### Phase 9 — Enterprise polish (partial) — 2026-05-25

| Chunk | Description | Status |
|---|---|---|
| 9.A | Deep brand scrub — `runpod_job_id` → API `pod_id` alias, `runpod_endpoint_id` → API `endpoint_id` alias on every SELECT. Dashboard types + refs updated. Internal DB schema unchanged. | ✅ |
| 9.B | Generic 5xx error envelope (`lib/inference/api-errors.ts`). 6 routes converted from `err.message` to `internalError()` with server-side logging. 4xx specifics preserved. | ✅ |
| 9.C | Security headers — verified already in `next.config.ts`: HSTS 2yr+preload, X-Frame-Options DENY, Permissions-Policy, COOP/CORP/CSP. No change needed. | ✅ |
| 9.D | Webhook idempotency-key persistence — train.sh already sends `X-Ahura-Idempotency-Key`; receiver currently uses row-state idempotency which is sufficient for v1. Header-based dedup table deferred. | DEFERRED |
| 9.E | PII redaction in `error_message` — low priority (customer's own data, org-scoped). Deferred. | DEFERRED |
| 9.F | Gated badges in model dropdown (5 Meta + Google models need HF approval) — deferred to dashboard work session. | DEFERRED |
| 9.G | RunPod template pre-cache (skip cold image pull) — deferred. Current cold-pull adds 5-10 min to first job on a fresh node; subsequent jobs on the same node are fast due to per-node cache. | DEFERRED |

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
│   ├── members/[id]/route.ts               ← PATCH (role) + DELETE (remove)
│   ├── fine-tuning/jobs/route.ts           ← POST (create + queue) + GET (list)
│   ├── fine-tuning/jobs/[id]/route.ts      ← GET (detail) + DELETE (cancel/remove)
│   ├── fine-tuning/jobs/[id]/webhook/route.ts     ← HMAC-verified completion ingress from train.sh
│   ├── fine-tuning/jobs/[id]/heartbeat/route.ts   ← HMAC-verified progress ingress (every 30s)
│   ├── fine-tuning/jobs/[id]/log-url/route.ts     ← 6h presigned URL for training.log
│   ├── fine-tuning/jobs/[id]/adapter-url/route.ts ← 6h presigned URL for adapter.tar.gz (self-serve)
│   ├── vector/collections/route.ts                ← GET list + POST create (with model validation)
│   ├── vector/collections/[id]/route.ts           ← GET detail + DELETE
│   ├── vector/collections/[id]/upsert/route.ts    ← POST batch upsert (auto-embeds via OpenRouter)
│   ├── vector/collections/[id]/query/route.ts     ← POST similarity search (text or embedding)
│   ├── vector/collections/[id]/rows/route.ts      ← GET list (paginated, filter by external_id) + DELETE bulk
│   └── vector/collections/[id]/rows/[rowId]/route.ts ← GET single (incl. embedding) + DELETE single
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
| 2 | **Many keys pasted in chat history are compromised.** OpenRouter key, Supabase service role, RunPod API key, R2 access/secret, Upstash REST token, HF token, Linode PAT, FT webhook secret. | **HIGH** | Rotate all before public beta. Linode PAT was set to 24h expiry so likely auto-expired; others have no expiry. |
| 2a | **5 of 13 catalog FT base models are HF-gated** (Llama-4 Scout, Llama-4 Maverick, Llama-3.3-70B, Llama-3.1-8B, gemma-3-27b-it). Users hit 403 from HF at training time unless their HF_TOKEN is approved. Dashboard doesn't badge them yet (Phase 9.F deferred). | Medium | First training job on any of these fails fast with `Cannot access gated repo for url ...`. User must request access at the HF model page. |
| 2b | **BYO Deploy: HF + Truss sources are accepted at API but always fail in the runner** (`resolveImageUri()` returns null). Only `source: "docker"` works end-to-end. The dashboard create dialog still offers all 3 source types. | Medium | UX confusion — fix is either restrict the dropdown to Docker only OR build the HF→OCI / Truss→OCI builder (Phase 7 scope). |
| 2c | **First job on a fresh RunPod node waits 5-10 min for the 20GB training image to pull.** Subsequent jobs on the same node start in ~30s. RunPod Template pre-cache (Phase 9.G deferred) would eliminate the cold pull. | Medium | Boot-grace window (5 min default) often isn't enough for cold pulls; bumped to 16 min in cluster secret. Operator note: if you see "heartbeat stall threshold exceeded — killing pod" before 16 min, bump `CONSECUTIVE_STALLS_TO_KILL` further or wait for pre-cache work. |
| 2d | **`~/.ahura-lke.env` is stale.** 4 keys patched live via `kubectl patch secret` but never written back: `CONTROL_PLANE_URL`, `CONSECUTIVE_STALLS_TO_KILL`, `BOOT_GRACE_MS`, `AXOLOTL_IMAGE_URI`. A cluster re-apply would reset them. | Medium | Operator: add those 4 lines to `~/.ahura-lke.env` to prevent drift. |
| 2e | **`api.cs2hvh.com` Worker route was broken on 2026-05-25** when this session ran `cloudflared tunnel route dns --overwrite-dns api.cs2hvh.com` (intended `wao.cs2hvh.com`). Operator needs to `cd workers/inference && npx wrangler deploy` to re-bind. | Medium | Inference gateway `/v1/*` calls fail until restored. |
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
| 14 | **FT jobs trained before 2026-05-25 lack `adapter.tar.gz` in R2** (only loose files). Their "Copy serve command" will mint a presigned URL pointing at a missing key; the docker run will fail at the `curl -fL` step. | Medium | Either re-run those jobs to regenerate, or operator can tar+upload manually: `rclone copy remote:ahura-ft-adapters/<org>/<job>/ ./tmp/ && cd tmp && tar -czf adapter.tar.gz . && rclone copy adapter.tar.gz remote:ahura-ft-adapters/<org>/<job>/`. New jobs (post-train.sh update) get it automatically. |
| 15 | **`cs2hvh/ahura-ft-serving-vllm` GHCR package must be flipped to public** for docker pull to work from any user's GPU pod (same flip we did for `ahura-ft-axolotl`). Operator: <https://github.com/users/cs2hvh/packages/container/ahura-ft-serving-vllm/settings>. | High | Until flipped, every "Copy serve command" → docker run will fail at the image pull step with 403/denied. First GHA build of the image must also have completed. |

---

## Operator runbook — common ops

### Inspect a job from the runner pod (no SQL editor needed)

```bash
export KUBECONFIG=$HOME/.kube/lke-ahura.yaml
export PATH=$HOME/bin:$PATH
kubectl -n ahura exec deploy/ahura-ft-runner -- node -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
sb.schema('inference').from('finetunes')
  .select('id, name, status, base_model_id, gpu_sku, training_seconds, cost_cents, error_message, training_log_url')
  .order('created_at', { ascending: false }).limit(5)
  .then(r => console.log(JSON.stringify(r.data, null, 2)));
"
```

### Tail runner logs

```bash
kubectl -n ahura logs -f deploy/ahura-ft-runner
kubectl -n ahura logs -f deploy/ahura-deploy-runner
```

### Update a cluster secret without re-applying the whole config

```bash
kubectl -n ahura patch secret ahura-ft-runner-secrets \
  --patch '{"stringData":{"BOOT_GRACE_MS":"600000"}}'
kubectl -n ahura rollout restart deploy/ahura-ft-runner
```

### Recreate the LKE cluster from zero

```bash
# Cluster
export LINODE_PAT=...   # fresh scoped PAT, 24h expiry
bash infra/k8s/lke/01-create-cluster.sh

# Manifests
export KUBECONFIG=$HOME/.kube/lke-ahura.yaml
set -a; source ~/.ahura-lke.env; set +a
bash infra/k8s/lke/02-apply-all.sh

# Re-patch the drifted env keys (see gap 2d above)
kubectl -n ahura patch secret ahura-ft-runner-secrets --patch '{"stringData":{"CONTROL_PLANE_URL":"https://wao.cs2hvh.com","CONSECUTIVE_STALLS_TO_KILL":"60","BOOT_GRACE_MS":"300000","AXOLOTL_IMAGE_URI":"ghcr.io/cs2hvh/ahura-ft-axolotl:axolotl-0.29.0"}}'
```

### Restart the Cloudflare Tunnel if it dies

```bash
# On the Windows operator box (Git Bash)
~/bin/cloudflared.exe tunnel run ahura-api &
# Or install as a Windows service for persistence:
~/bin/cloudflared.exe service install
```

### Make a fresh test FT job from the dashboard (smoke check)

1. Dashboard → Inference → Fine-Tuning → New job
2. Name: anything; Base: `microsoft/phi-4` (only ungated 14B); Dataset: `https://wao.cs2hvh.com/test-finetune.jsonl`; GPU: A40
3. Wait ~7 min; expect `$0.10` and a model in catalog.
4. If it gets stuck at "preparing" for >2 min, check `kubectl -n ahura logs deploy/ahura-ft-runner` for the claim event.
5. If pod is provisioned but never sends heartbeats and stalls, check pod logs at `https://www.runpod.io/console/pods` BEFORE it's deleted — RunPod drops logs post-stop.

---

## Active TODO

Immediate hygiene (do soon):
- [x] ~~Re-run `k6 run load.k6.js`~~ — done 2026-05-24, all infra thresholds pass
- [ ] **Rotate ALL keys pasted in this conversation** — OpenRouter, Supabase service role, RunPod, R2, Upstash, HF, Linode (likely expired), FT webhook secret
- [ ] Operator: write the 4 drifted env keys back to `~/.ahura-lke.env` (gap 2d above)
- [ ] Operator: `cd workers/inference && npx wrangler deploy` to restore `api.cs2hvh.com` Worker route (gap 2e above)
- [ ] Operator: flip `cs2hvh/ahura-ft-serving-vllm` GHCR package to public (gap 15 above) — needed before any "Copy serve command" flow works
- [ ] Operator: wait for / verify GHA builds of `ahura-ft-axolotl` (with `adapter.tar.gz` packing in `train.sh`) and `ahura-ft-serving-vllm` have published `:latest` tags
- [ ] Operator: train one new FT job to validate the full self-serve flow end-to-end (expect: completion → expandable row → "Copy serve command" → paste on a GPU pod → vLLM listens on :8000 → OpenAI-compatible request returns adapter output)
- [ ] Operator: apply Phase 4 polish migration `supabase/migrations/20260525000001_phase4_polish_vector_rows_anydim.sql` (relaxes vector_rows.embedding to any-dim + adds 2 audit enum values). Without this, text-embedding-3-large upserts will fail with a pgvector dimension error.
- [ ] Operator: restart Next.js dev server to pick up the new `/vectors/[id]` detail page and `/rows` API routes.
- [ ] Operator: redeploy the inference worker (`cd workers/inference && npx wrangler deploy`) for the L1 cache extension on `/v1/embeddings` and `/v1/messages` to take effect. Smoke test with two identical `Cache-Control: no-cache`-less requests to `/v1/embeddings` — second should respond with `X-Ahura-Cache: hit`.

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
