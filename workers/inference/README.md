# AhuraCloud Inference — Edge Gateway

Cloudflare Workers project that fronts every `/v1/*` call to **api.cs2hvh.com** (temporary; migrating to **api.ahurasense.com** later — see [docs/inference/migration-ahurasense.md](../../docs/inference/migration-ahurasense.md)).

## Responsibilities

| Layer | What it does |
|---|---|
| Auth | sha256(API key) → KV lookup (fallback: Postgres `inference.lookup_api_key`) |
| Rate limit | Per-key token bucket via Durable Object |
| Spend cap | Per-org monthly counter in KV; reject at hard cap (HTTP 402) |
| Cache | L1 response cache in KV (Phase 2) |
| Audit | Fire-and-forget event to `AUDIT_EVENTS` queue (consumed by k8s worker) |
| Usage | Fire-and-forget event to `USAGE_EVENTS` queue (consumed by k8s worker, flushed to Postgres) |
| Proxy | Forward to OpenRouter for all inference; RunPod for FT/BYO model IDs |

## Project layout

```
workers/inference/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                       # Hono router
    ├── types.ts                       # Env bindings + AuthContext + events
    ├── middleware/
    │   ├── auth.ts                    # API key → AuthContext
    │   ├── rate-limit.ts              # DO-backed token bucket
    │   └── spend.ts                   # KV-backed hard-cap check
    ├── durable-objects/
    │   └── rate-limiter.ts            # Token-bucket DO class
    ├── lib/
    │   └── openrouter.ts              # Upstream client + streaming passthrough
    └── routes/
        ├── chat-completions.ts        # POST /v1/chat/completions (Phase 1)
        ├── embeddings.ts              # POST /v1/embeddings        (Phase 4)
        ├── models.ts                  # GET  /v1/models            (Phase 1)
        ├── key.ts                     # GET  /v1/key               (Phase 0 ✓)
        └── messages.ts                # POST /v1/messages          (Phase 1)
```

## First-time setup (operator)

```bash
cd workers/inference
npm install

# Authenticate
wrangler login

# Create KV namespaces and copy the IDs into wrangler.toml
wrangler kv namespace create API_KEYS
wrangler kv namespace create API_KEYS --preview
wrangler kv namespace create SPEND
wrangler kv namespace create SPEND --preview
wrangler kv namespace create L1_CACHE
wrangler kv namespace create L1_CACHE --preview

# Create the queues
wrangler queues create ahura-inference-audit
wrangler queues create ahura-inference-usage

# Set secrets (never commit values)
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put OPENROUTER_PLATFORM_KEY
wrangler secret put BYOK_DEK           # base64-encoded AES-GCM key

# Deploy
wrangler deploy
```

## Local development

```bash
wrangler dev    # starts an in-memory Workers runtime
# Hit http://127.0.0.1:8787/v1/health to verify
# Hit http://127.0.0.1:8787/v1/chat/completions with a real key for end-to-end test
```

## What's done in Phase 0

- Hono router with all `/v1/*` routes wired (chat/completions, embeddings, models, key, messages, health)
- Auth middleware with KV-warm-path + Postgres-fallback flow
- Spend-cap middleware (KV counter read)
- Rate-limit middleware (DO-backed token bucket)
- Durable Object class for rate limiter
- OpenRouter client interface + streaming passthrough scaffold

## Coming in Phase 1

- Real OpenRouter forwarding in `chat-completions.ts` with SSE streaming
- BYOK key resolution (decrypt from `inference.byok_keys` using BYOK_DEK)
- Usage event population in the request path
- Audit log enqueue for mutating org endpoints
- 500 RPS load test (k6 scenario)
- Anthropic Messages shim

## What never goes here

- Long-running jobs (fine-tuning orchestration, batch embeddings, BYO container builds): those live in **k8s BullMQ workers**, not Workers
- Vector store queries: routed to the k8s API tier so we can hit a dedicated Postgres read replica
- Anything that needs >30s CPU time
