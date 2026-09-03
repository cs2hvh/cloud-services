# Inference & AI Labs — Architecture Reference

**Service:** AI Inference (OpenAI-compatible API, playground, fine-tuning, vectors, media)
**Upstream provider:** Wokey (migrated from OpenRouter, 2026-08-26)
**Edge:** Cloudflare Worker `ahura-inference-edge` → `api.ahurasense.com/v1/*`
**Status:** Live in production, low traffic
**Last verified against running system:** 2026-09-01; the billing claim in §3 corrected 2026-09-03

---

## 1. What this service is

Two products sharing one backend.

**The API** — an OpenAI-compatible endpoint at `api.ahurasense.com/v1`. A
customer points any OpenAI SDK at it, uses their AhuraSense key, and gets access
to 32 active models. There is also an Anthropic Messages shim, so Anthropic SDKs
work unmodified.

**AI Labs** — the dashboard around it: playground, model catalogue, usage
analytics, API keys, BYOK, presets, vector stores, fine-tuning, batches, evals,
audit and diagnostics.

The customer never learns which upstream serves a request. Public model ids are
stable and ours; the upstream's id is a translation detail.

**Scale today:** 110 models across 12 modalities (32 active), 136 routing rules,
39 active API keys, 15 orgs, 2,083 recorded requests, 27 fine-tune jobs,
33 media jobs, 8 vector collections.

---

## 2. The two halves, and why the split

```
   Customer SDK                     Dashboard (Next.js on Linode)
        │                                    │
        ▼                                    ▼
┌───────────────────────────┐    ┌──────────────────────────────┐
│  Cloudflare Worker        │    │  app/api/inference/*         │
│  ahura-inference-edge     │    │  keys · vectors · finetunes  │
│  api.ahurasense.com/v1    │    │  batches · presets · usage   │
│                           │    └───────────────┬──────────────┘
│  HOT PATH — every token   │                    │
└─────────┬─────────────────┘                    │
          │                                      │
          ▼                                      ▼
   ┌─────────────┐                     ┌───────────────────┐
   │   Wokey     │                     │    Supabase       │
   │  /v1 API    │                     │  inference schema │
   └─────────────┘                     │   ~68 tables      │
          │                            └───────────────────┘
          │  usage + audit events               ▲
          ▼                                     │
   ┌─────────────────────────┐                  │
   │  CF Queues → consumers  │──────────────────┘
   │  usage · audit          │
   └─────────────────────────┘
```

**The hot path runs at the edge, not on the Linode.** A token stream must not
traverse a single VPS in Mumbai for a customer in Frankfurt, and an inference
request holds a connection open for a long time at almost no CPU cost — the
opposite of what a Node server is good at. The dashboard's own CRUD stays in
Next.js where it belongs.

**Usage is recorded asynchronously through a queue.** Billing must not sit in
the latency path of a token stream, and a metering failure must not fail a
request the customer already received.

---

## 3. Request pipeline

```
POST /v1/chat/completions
   │
   ├─ authMiddleware        API key → KV lookup (API_KEYS), org resolution
   ├─ spendCheckMiddleware  KV counter (SPEND) — refuse over a cap
   ├─ rateLimitMiddleware   Durable Object (RATE_LIMITER) — per-key window
   │
   ├─ model routing         public id → upstream_model_id
   ├─ guardrails            optional policy pass
   ├─ semantic cache        optional L1 (KV) + semantic hit
   │
   ├─ forward to Wokey      streaming passthrough or JSON
   │
   └─ enqueue               USAGE_EVENTS + AUDIT_EVENTS  (never blocking)
```

**Rate limiting is a Durable Object, not KV.** KV is eventually consistent, so
two concurrent requests can both read "under the limit" and both proceed. A DO
gives a single-threaded counter per key — the only way the limit is real.

**Spend caps use KV**, and the cap is the only money control on this path. The
2026-09-01 version of this paragraph said a stale KV counter was acceptable
"because the hourly billing sweep is authoritative". That was false. Nothing
bills `inference.usage` to a wallet: the sweep walks `billing.service_meters`,
no meter is ever opened for gateway traffic, and the usage consumer prices each
row (`pricing`, `upstream_pricing`) and stops. The KV counter enforces a
per-key hard cap, not a balance. As of 2026-09-03: 2,083 usage rows, the last on
2026-08-26, 39 active keys, none of it charged to anyone. Recorded as an open
decision in [Current State](07-current-state.md) §3.

Two fixes from 2026-09-03 sit in `workers/inference/src` and are **code only
until `wrangler deploy` runs**: a stored hard cap of `0` now blocks (only `NULL`
means no cap; `0` used to read as unlimited), and the usage consumer inserts the
row with `error_code='unpriced'` for an unknown model or empty pricing instead
of dropping the event, and counts a failed org lookup for spend alerts rather
than skipping it.

### The upstream translation seam

`inference.models.upstream_model_id` is the single most important column in this
service.

| Public id (ours, stable) | `upstream_model_id` (Wokey's) |
|---|---|
| `zhipu/glm-5.3` | provider's own id |
| `ahura/video-gen` | `alibaba/wan-2.6` |

Customers code against **our** id. Changing provider, or repointing a product
name at a different model, is a row update — no customer change, no version
bump. The OpenRouter → Wokey migration was possible in a day *because* this seam
already existed.

`inference.model_routes` (136 rows) layers routing rules on top: fallbacks,
per-org overrides, A/B splits.

---

## 4. The model catalogue

110 models, 12 modalities. Only 32 are active.

| Modality | Total | Active | Notes |
|---|---|---|---|
| chat (proxy) | 80 | **29** | the live product |
| chat (`runpod_ft`) | 3 | **3** | customers' own fine-tunes — see §6 |
| embedding | 7 | 0 | **Wokey has no embeddings endpoint** |
| agent_tool | 6 | 0 | |
| video / image / music / tts / stt / ocr / moderation / rerank | 14 | 0 | media products, built not launched |

Two things worth reading twice:

**Embeddings are inactive because the upstream has no embeddings API.** The
migration deliberately removed `/embeddings` from the client's path union, so
reintroducing it is a *compile* error rather than a runtime 503. Vector stores
that need embeddings currently fall back to `OPENAI_API_KEY`.

**`serving_type` distinguishes proxy from self-served.** `proxy` forwards to
Wokey. `runpod_ft` means the model is a customer's fine-tune running on a RunPod
pod we manage — the same infrastructure as the GPU Pods service. That is the one
place where the two products meet in the request path.

---

## 5. Data model

~68 tables in the `inference` schema. The ones that matter:

### Partitioned by month

`usage`, `trace_spans` and `audit_log` are **monthly partitions** — `usage_y2026m07`,
`trace_spans_2026_07`, `audit_log_y2027m12` and so on, pre-created into 2027.

This is the right call for append-only telemetry that is always queried by time
window: dropping a month is a `DROP TABLE`, not a delete of millions of rows. It
is also the pattern `gpu_inventory_snapshots` should have used and didn't — that
table reached a million rows with no retention and took the deploy page down.

### Core tables

| Table | Rows | Role |
|---|---|---|
| `models` | 110 | catalogue + `upstream_model_id` + pricing |
| `model_routes` | 136 | routing rules, fallbacks, overrides |
| `usage` | 2,083 | one row per request — tokens, cost, cached tokens |
| `api_keys` | 62 (39 active) | hashed keys, scopes, spend caps |
| `byok_keys` | 1 | customer's own provider key, AES-256-GCM |
| `orgs` / `org_members` | 15 / 15 | multi-tenancy |
| `finetunes` | 27 | training jobs |
| `media_jobs` | 33 | video/music/image generation |
| `vector_collections` / `vector_rows` | 8 / 33 | managed vector store |
| `batches` | 1 | async bulk inference |
| `evals` (`runs`/`cases`/`datasets`/`results`) | 14/5/2/31 | model evaluation harness |
| `prompts` / `prompt_versions` | 1 / 3 | versioned prompt store |
| `semantic_cache` | 0 | GC'd hourly |
| `connectors` / `connector_documents` | 0 / 0 | built, unused |
| `guardrail_policies` | 0 | built, unused |

### Cost accounting on `usage`

Each row records both sides:

- `pricing` — what we charge (sell price)
- `upstream_pricing` — what Wokey charges us

so margin is computable per request. A defect found during the migration: the
usage consumer wrote `upstream_cost_cents = costCents`, i.e. our sell price in
the cost column, making every request look like zero margin. Now it rates the
event against `upstream_pricing` separately. The off-peak discount is
deliberately **not** applied to the upstream figure — a discount we give does
not change what we are charged.

---

## 6. Fine-tuning — where AI meets GPU Pods

The one flow that spans both services.

```
customer submits job
   → dataset validated
   → RunPod pod provisioned with the training image (axolotl)
   → training runs, heartbeats to inference.finetunes
   → adapter uploaded to R2
   → model row created with serving_type='runpod_ft'
   → pod destroyed
   → the fine-tune is now selectable in the playground
```

**Watchdogs, because training jobs fail in ways that do not report themselves:**

| Watchdog | Cadence | Reaps |
|---|---|---|
| finetune watchdog | every 5 min | jobs with a stale heartbeat (>30 min); zombie pods left on already-terminal jobs |
| serving-pod watchdog | every minute | pods serving a model that no longer exists |

A job whose pod died silently would otherwise hold a GPU meter open forever.

**Current state: 17 failed, 7 completed, 3 cancelled.** A 63% failure rate is
high and worth investigating — the customer-facing error mapper already special-
cases the two most common causes (gated base models needing access approval, and
CUDA OOM from a base model too large for the chosen GPU).

---

## 7. Scheduled work

All on the Cloudflare Worker's single `* * * * *` trigger, dispatched by minute:

| Job | Cadence | Purpose |
|---|---|---|
| serving-pod watchdog | every minute | reap pods serving dead models |
| finetune watchdog | `*/5` | stale heartbeats, zombie pods |
| deployment meter | `*/5` | meter BYO serverless deployments (0 today); since 2026-09-03 an unknown SKU, a missing payer or a failed inventory read leaves `last_metered_at` where it was (outcomes `unpriced`, `no_payer`) instead of advancing it over an unbilled interval |
| semantic cache GC | `:00` hourly | bound cache growth |

`inference.cron_runs` records job outcomes — though note only 9 rows, and a
lesson attached: those rows were once used to infer which worker build was
deployed, and the inference was wrong. **The repo does not tell you what is
running; `wrangler deployments status` does.**

---

## 8. Security

**Keys are hashed, never stored.** `api_keys` holds a hash; the plaintext is
shown once at creation. Lookup is by hash via KV for edge speed.

**BYOK is scoped to one provider.** `ROUTABLE_BYOK_PROVIDER = "wokey"`, and the
guard rejects any other provider **before** the ciphertext is fetched. Without
it, a caller declaring `provider: "openai"` would have their OpenAI key
decrypted and sent as a Bearer token to Wokey — handing one vendor's credential
to another. The `openrouter` branch is retained only to validate historical rows
and can never be routed.

**Upstream identity is scrubbed.** `sanitizeUpstreamError()` strips provider
identity from error bodies. The dashboard-side equivalent
(`lib/inference/error-messages.ts`) strips **URLs before vendor names** — a bare
`/\bRunPod\b/` over `https://rest.runpod.io/v1/pods` rewrites the host in place
and leaves `https://rest.GPU compute.io/...`, which still discloses an upstream
and is gibberish. Ordering is load-bearing.

**The error fallback never leaks stack traces** — the worker always returns JSON.

**Spend caps and rate limits are per key**, so a leaked key has a bounded blast
radius.

---

## 9. Migration history — OpenRouter → Wokey

Completed 2026-08-26. Verified in production with two live completions on
`zhipu/glm-5.3`, a model absent from OpenRouter's entire 417-model catalogue —
so it could only have been served by Wokey. Usage rows recorded the **public**
id, confirming the translation seam.

Rollback: `npx wrangler rollback c1cea429-b6c0-4dca-8b98-22f2870853f6` — but
`zhipu/*` and `bytedance/doubao-*` (4 models) only work post-migration, so a
rollback must delist them.

**Three beliefs held during that work turned out to be wrong**, recorded so
nobody re-derives them:

1. *"The deployed worker is the ai7 build."* It was not — Cloudflare showed a
   2026-06-02 pre-divergence build. The inference came from ai7-only job names
   in `cron_runs`; the deployed build writes no `cron_runs` rows at all. The
   entire 21-file ai7 port was unnecessary.
2. *"Deploying would delete 16 endpoints."* False, same cause — those routes had
   never been deployed.
3. *"Wokey exposes no pricing."* False —
   `/api/models/pricing?output_modalities=text,image` has full SKU pricing.

**Deploying the worker also revived Cloudflare's crons**, which had been dead
since 2026-08-04. The trigger was configured all along and `last_status` stayed
`ok`; a redeploy re-registers it. That is also what started the GPU inventory
sync writing 135,000 rows a day.

---

## 10. Known gaps

- **No load or concurrency testing.** Only a 5-request sequential latency sample
  (~1.2–1.4 s per minimal call). No sustained rate, no parallelism, no behaviour
  under pressure.
- **Cached-token handling is unproven on Wokey.** The tolerant reader checks
  `prompt_tokens_details.cached_tokens` then `cache_read_input_tokens` /
  `cache_read_tokens`, but no post-migration request has produced a cache hit.
- **Embeddings are dead** until an upstream provides them.
- **Untested paths:** BYOK decryption with a real key, spend caps, streaming
  cancel propagation, tool calling, guardrails under the new upstream.
- **`@cloudflare/vitest-pool-workers` conflicts with vitest 4**, blocking tests
  that need real Workers bindings (KV/DO/Queues). Worker `npm install` needs
  `--no-save --legacy-peer-deps`.
- **`lib/ai/openrouter.ts` is still on OpenRouter** — the AI-agents lane was
  never migrated. It is a separate code path from this service.
- **Gateway usage is not billed.** No meter, no wallet debit and no ledger row
  for any of the 2,083 usage rows; the per-key hard cap is the only limit. See
  §3.
- **Traffic is near zero.** 2,083 usage rows total, 9 in the last week, and
  those were migration tests. The gateway is alive and idle, not broken.
- **Fine-tune failure rate is 63%** and unexplained.

---

## Appendix — file map

| Path | Lines | Role |
|---|---|---|
| `workers/inference/src/index.ts` | 445 | routing, middleware chain, cron dispatch |
| `workers/inference/src/routes/chat-completions.ts` | 766 | the main endpoint |
| `workers/inference/src/routes/messages.ts` | 789 | Anthropic compatibility shim |
| `workers/inference/src/lib/wokey.ts` | 372 | upstream client, BYOK guard, error scrub |
| `workers/inference/src/consumers/usage.ts` | 446 | queue consumer, cost + margin |
| `workers/inference/src/lib/semantic-cache.ts` | 317 | semantic cache |
| `workers/inference/src/lib/guardrail.ts` | 232 | policy pass |
| `workers/inference/src/middleware/auth.ts` | 199 | key → org resolution |
| `workers/inference/src/durable-objects/rate-limiter.ts` | 71 | the only strongly-consistent counter |
| `lib/inference/error-messages.ts` | — | customer-safe error rewriting |
| `app/dashboard/services/inference/**` | 14 sections | AI Labs UI |

### Cloudflare bindings

| Kind | Binding | Purpose |
|---|---|---|
| KV | `API_KEYS` | key lookup at the edge |
| KV | `SPEND` | approximate spend counters |
| KV | `L1_CACHE` | response cache |
| Durable Object | `RATE_LIMITER` | strongly-consistent per-key limits |
| Queue (producer + consumer) | `USAGE_EVENTS` | metering, off the latency path |
| Queue (producer + consumer) | `AUDIT_EVENTS` | audit trail |
