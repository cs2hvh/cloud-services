# Architecture

## System overview

```
                              ┌─────────────────────────┐
                              │   Cloudflare WAF + DNS  │
                              └───────────┬─────────────┘
                                          │
                              ┌───────────┴─────────────┐
                              │  Cloudflare Workers     │
                              │  (api.cs2hvh.com/v1)    │
                              │  ─────────────────────  │
                              │  • API key auth (KV)    │
                              │  • Rate limit (DO)      │
                              │  • Spend hard-cap (KV)  │
                              │  • OAI/Anth normalize   │
                              │  • L1 response cache    │
                              │  • Streaming SSE proxy  │
                              │  • Audit → CF Queue     │
                              └─────┬───────────┬───────┘
                                    │           │
                ┌───────────────────┘           └─────────────────┐
                ▼                                                 ▼
        ┌────────────────┐                              ┌──────────────────┐
        │   OpenRouter   │                              │  k8s API tier    │
        │  (frontier +   │                              │  (Hono service)  │
        │   open-source, │                              │  ─ self-host mux │
        │   400+ models) │                              │  ─ long jobs     │
        └────────────────┘                              │  ─ vector query  │
                                                        └────────┬─────────┘
                                                                 │
                                                                 ▼
                                                        ┌──────────────────┐
                                                        │ RunPod Serverless│
                                                        │  • Fine-tuning   │
                                                        │  • BYO containers│
                                                        │  (NOT inference) │
                                                        └──────────────────┘

  Shared data plane:
    Supabase Postgres ─ control plane (orgs, members, keys, models, FT,
                         deployments, vector collections) + audit log
                         + usage (monthly partitions)

    Upstash Redis     ─ rate-limit buckets, spend counters, hot cache
    Cloudflare KV     ─ API key hash → AuthContext (5-min TTL)
    Cloudflare DO     ─ per-key rate-limit state (consistent, eviction-safe)
    Cloudflare Queues ─ audit events, async webhook fanout
    BullMQ on k8s     ─ fine-tune orchestration, batch embed, BYO build,
                         billing reconciliation
    S3 / R2           ─ datasets, LoRA outputs, container artifacts

  Observability: OpenTelemetry → Grafana Cloud · Better Stack status page
```

## Why this shape

### Edge tier on Cloudflare Workers

500 RPS burst is well within Workers' capacity (Workers handle millions of RPS routinely). Streaming SSE works fine on Workers — `ReadableStream` holds connections open without consuming CPU time. The 30-second CPU budget applies only to compute, not wall clock.

Workers also give us:
- Global anycast routing for free
- Native KV / Durable Objects / Queues / Cache API in one runtime
- Pay-per-request billing that scales smoothly from 0

The alternative (Next.js API routes on Vercel, or a dedicated Hono server on k8s) was rejected because streaming-heavy inference workloads compound the cost of long-lived serverless functions on Vercel, and self-hosting an API tier for what is mostly proxy work is unnecessary infrastructure.

### k8s for the asynchronous tier

What lives on k8s instead of Workers:
- BullMQ workers: fine-tune orchestration, batch embeddings, BYO container builds, billing reconciliation, webhook delivery
- Long-running API work the Workers tier can't handle (vector-search query with large result sets, etc.)

These workloads are durable, sometimes minutes-long, and benefit from being able to run any Node ecosystem package (Workers has constraints on native modules and some HTTP libs).

### OpenRouter as single upstream

Decision made 2026-05-23: every inference call (frontier closed AND open-source) is proxied to OpenRouter. We do not self-host vLLM workers for inference. Trade-off: we lose the per-token margin we could capture by running open-weight models on our own RunPod fleet, but we ship dramatically faster, have access to OpenRouter's 400+ model catalog on day 1, and carry zero GPU operational burden for inference.

Our value-add is therefore bundling, UX, and the integrated suite (Inference + FT + Embeddings + BYO + bundled compute) rather than per-token unit cost.

### Postgres for control plane, partitioned tables for high-cardinality

At 100k requests/hour (the scale target), `inference.usage` will accumulate ~72M rows/month. Postgres handles this cleanly with monthly partitions — pre-created for 8 months in the initial migration. When we cross ~1B rows total (year 2+), we migrate the analytics workload to ClickHouse or Tinybird; the schema is shaped to make that migration straightforward.

`inference.audit_log` is partitioned the same way for the same reasons, with the added benefit that monthly partitions enable cheap archival of older audit data to cold storage without affecting the recent-90-days dashboard query path.

## Data model — schema overview

12 tables in the `inference` schema:

| Table | Purpose |
|---|---|
| `orgs` | Multi-tenant orgs (every user gets a personal org auto-bootstrapped on signup) |
| `org_members` | User membership with roles (owner / admin / developer / viewer) |
| `api_keys` | Hashed public API keys with budgets, scopes, IP allowlists, ZDR toggle |
| `byok_keys` | Encrypted upstream provider keys (AES-GCM with KMS-rotated DEK) |
| `models` | Unified catalog: proxied (OpenRouter) + RunPod-served (FT outputs, BYO deploys) |
| `model_presets` | Saved fallback chains / provider preferences |
| `usage` | Per-request metering, partitioned monthly |
| `audit_log` | Immutable audit trail, partitioned monthly |
| `finetunes` | LoRA training jobs (queued → running → completed) |
| `deployments` | BYO model container deploys |
| `vector_collections` | Managed pgvector collections (one per RAG corpus) |
| `vector_rows` | Vector data (default 1536-dim; extend for wider models as needed) |

Plus 10 enums covering org roles, billing source, serving type, model modality, statuses, and audit actions.

Helper RPCs:
- `inference.lookup_api_key(hash)` — edge gateway fast path
- `inference.bootstrap_personal_org(user_id, email)` — signup hook
- `inference.is_org_member(org_id)`, `inference.is_org_admin(org_id)` — RLS support

## Request lifecycle (Phase 1+)

A `POST /v1/chat/completions` request flows like this:

1. **DNS → CF anycast → Worker isolate** (~5 ms TTFB to nearest CF PoP)
2. **CORS + request ID + timing init** (instant)
3. **Auth middleware** (sha256 key → KV hot path or Postgres fallback) — ~1 ms on KV hit, ~30 ms on miss
4. **Spend cap middleware** (read KV counter, compare to `hard_cap_cents`) — ~1 ms
5. **Rate-limit middleware** (forward to DO, token-bucket take) — ~5 ms
6. **L1 cache lookup** — sha256(normalized request) → cached SSE replay (Phase 2)
7. **Resolve upstream key** — platform key from env OR decrypt BYOK ciphertext
8. **Forward to OpenRouter** (or RunPod for FT/BYO model IDs) with streaming
9. **TransformStream passthrough** — chunks flow to client without buffering; final chunk captured for usage stats
10. **`waitUntil(usage_event)`** — non-blocking enqueue to CF Queue → consumer worker writes to Postgres `inference.usage`
11. **`waitUntil(audit_event)`** — if mutating action (key creation, etc.)

Streaming-safe cancel: when the client closes the SSE socket, the Worker's `AbortController` propagates the cancel to OpenRouter so they stop billing us mid-stream too.

## Cross-cutting enterprise pillars

These are baked into the data model and middleware from day 0, not retrofitted:

| Pillar | Implementation |
|---|---|
| Multi-tenant orgs | `inference.orgs` + `org_members` + RLS helpers |
| Per-key budgets + hard caps | `api_keys.{monthly_budget_cents, hard_cap_cents}` + edge `spend.ts` |
| Per-key IP allowlist | `api_keys.allowed_ip_cidrs` + edge `auth.ts` |
| Per-key model scope | `api_keys.allowed_models` + edge `auth.ts` |
| Zero Data Retention | `api_keys.zdr_enabled` (overrides org default) |
| Rate limiting | Durable Object `RateLimiter` per-key token bucket |
| Audit log | `inference.audit_log` (partitioned, append-only, immutable) |
| Secrets at rest | `api_keys.key_hash` (sha256 only); `byok_keys.ciphertext` (AES-GCM + KMS_DEK) |
| Observability | OTel from Workers + k8s → Grafana Cloud |
| Status page | Better Stack tracking gateway uptime + per-model SLOs |

## What's deliberately NOT in scope

- **Self-hosted inference on RunPod.** OpenRouter handles all inference. RunPod is for FT + BYO only.
- **OpenRouter's own routing logic.** We don't re-implement provider selection — OpenRouter does it, we forward.
- **A custom UI framework.** Marketing pages reuse `ServiceHeroSection`, `ServicesHomeSectionFive`, `ServicesHomeSectionSix` from the existing editorial DNA.
- **Image/audio/video gen as a standalone product.** OpenRouter is LLM-focused. We might add a separate `/services/generation` later if there's demand; for now those routes return 501.
- **SOC 2 / HIPAA / GDPR certifications at launch.** Deferred; the architecture (audit log, ZDR, encryption, secrets discipline) is ready when we decide to pursue them.

## File map

```
docs/inference/                          ← you are here
├── README.md                            ← module index
├── architecture.md                      ← this file
├── setup.md                             ← operator runbook
├── phases.md                            ← delivery roadmap
└── migration-ahurasense.md              ← domain switch guide

supabase/migrations/
└── 20260523000001_create_inference_schema.sql

workers/inference/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                         ← Hono router
    ├── types.ts                         ← Env + AuthContext + events
    ├── middleware/
    │   ├── auth.ts
    │   ├── rate-limit.ts
    │   └── spend.ts
    ├── durable-objects/
    │   └── rate-limiter.ts
    ├── lib/
    │   └── openrouter.ts
    └── routes/
        ├── chat-completions.ts          ← Phase 1
        ├── embeddings.ts                ← Phase 4
        ├── models.ts                    ← Phase 1
        ├── key.ts                       ← Phase 0 ✓
        └── messages.ts                  ← Phase 1

app/(marketing)/services/
├── inference/page.tsx
├── fine-tuning/page.tsx
├── embeddings/page.tsx
└── model-hosting/page.tsx
```
