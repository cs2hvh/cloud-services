# Inference supply routing — plan

**Status:** recommendation recorded, not started · **Written:** 2026-08-25 ·
**Owner:** deep

## Recommendation

> **Revised 2026-08-25 after learning the platform is pre-production.** The first
> version of this recommendation assumed a running business with customers and
> historical spend. It was inferred from production-shaped comments in the code
> ("found on the live screen", "under-stated platform spend by 34%") rather than
> confirmed. That assumption was wrong, and it changes the answer.

**What breaks: the decision gate cannot be run.**

§11 asks what share of upstream spend the six Wokey-overlapping models carry,
and §12 P0 makes everything conditional on that answer. **With no real customer
traffic there is nothing meaningful in `inference.usage` to measure**, so the
gate returns noise. It is removed as a gate. Keep the query for later; do not
block on it now.

**What the three defects (§8) now mean.**

They are not money leaking today — there is little money yet. They are worse in
a different way: **you cannot set customer prices without knowing what a request
costs.** Cache writes are unpriced, non-chat modalities have no cost basis, and
one product's spend is unattributed. That is a launch blocker, not a leak. Fix
them before pricing is published, not because of Wokey.

**What gets cheaper: trying Wokey.**

Most of §9's caution — per-org permissions, fail-closed policy reads, staged
one-model-one-org rollouts — protects a customer base that does not exist yet.
Pre-production, the honest move is to stop arguing and measure: **buy a small
amount of credit, point a dev build at their API, and find out.** A week of real
requests settles questions no amount of review can: does streaming hold up, do
tool calls work, does `cache_control` produce real cache hits through the relay,
does their billed cost match their published price.

The evidence against them still stands — six overlapping models, a dead
discount tier, resold subscription supply, unconfirmed invoicing. But those are
reasons not to *depend* on them, not reasons to avoid *testing* them when
testing is nearly free.

**Revised order:**

| | Do | Why now |
|---|---|---|
| 1 | Fix the three defects (§8) | Cannot price the product without them |
| 2 | Refresh the catalog (§12 P1) | We would launch selling a generation-old lineup at higher cost — Sonnet 5 is $2/$10 against the $3/$15 we carry for 4.6 |
| 3 | Benchmark Wokey (§12 P3) | Cheap now, and evidence beats argument |
| 4 | Decide on supply | With real benchmark data, not a price table |

**Two things from §9 to keep even now**, because they are cheap at the start and
expensive to retrofit: `allow_marketplace_supply` defaults to **off**, and a
supplier's routing state fails **closed**. Defaults are hard to change once
anything depends on them. The rest of the machinery — health panels, staged
rollouts, cooldown tuning — waits until there are customers to protect.

**What does not change:** do not put a marketplace supplier in front of
customer data at launch without deciding the retention question first (§10), and
do not publish customer-facing supplier tiers (§13 Q3).

---

---

The question this document answers: *we buy all our model capacity from one
supplier. Should we buy some of it from Wokey instead, and what would that
actually take?*

Every price, endpoint and model list below was verified against the live APIs,
not taken from vendor marketing. The research that started this began as an AI
chat transcript; that transcript is deliberately NOT in the repository, because
several of its claims turned out to be false — most notably that Wokey serves
Gemini models, which it does not. What survived verification is here; what did
not is recorded as a correction in §6.2.

---

## 1 · Aim

Three goals, in priority order. They are separable and should not be delivered
as one project.

| # | Aim | Why it matters |
|---|---|---|
| **A** | **Know our real cost of goods.** | Three separate defects mean our reported upstream cost is wrong, and one whole product's spend is unattributed. Every decision below is measured against a number we cannot currently trust. |
| **B** | **Lower cost of goods on the traffic we already serve.** | Two independent levers: removing the gateway's platform fee, and buying the same models from a cheaper supplier. |
| **C** | **Stop being a single-supplier business.** | Today one vendor outage is a total outage. The catalog schema already anticipates multiple upstreams; the gateway ignores it. |

Explicit non-aims: replacing the gateway outright, moving customer data to a
marketplace supplier by default, or building our own provider network.

### 1.1 · The whole thing in plain terms

Strip away the detail and this is the entire design:

> **Every model in the catalog gets a "buy from" setting. An operator sets it in
> the admin screen. If that supplier fails *before it starts answering*, the
> request goes to OpenRouter instead. One switch turns a supplier off
> everywhere, instantly.**

That qualifier is load-bearing, not pedantry: once a streamed answer has begun,
no gateway can switch suppliers without splicing two different generations
together. See §9.8.

That is it. There is no routing engine, no price-comparison algorithm, no
automatic supplier selection. A human looks at the price table, decides "Claude
Sonnet is worth buying from Wokey", changes a dropdown, and watches the result
on the same screen.

```
   admin sets: claude-sonnet-4.6  →  buy from: Wokey
                                        │
   customer request ────────────────────┤
                                        ├─ Wokey ──ok──→ done
                                        └─ failed ─────→ OpenRouter → done
                                                          (and the admin
                                                           screen counts it)
```

Four things an operator can see and control, all in the existing admin section:

| Screen | Shows | Controls |
|---|---|---|
| Model catalog | our price, each supplier's cost, margin | **buy from** dropdown per model |
| Supply health | per supplier: serving / degraded / cooling down / no traffic, share of requests, spend, fallbacks in 24h, last price sync | — |
| Capability switches | — | one kill switch per supplier |
| Organisations | per-org spend | may this org use marketplace supply (default **no**) |

Why deliberately manual: automatic price routing is the part that can surprise
you. A human choosing per model is auditable, reversible in one click, and needs
no algorithm to explain when someone asks why a request cost what it did. With
six eligible models there is nothing here worth automating.

---

## 2 · What we sell today

The platform exposes an OpenAI-compatible API at `/v1`, across 8 modalities.

> **The catalog size in this document is not verified.** An earlier draft said
> "~62 chat and ~26 non-chat". That came from grepping the seed migrations, and
> two later attempts to count the same way produced 72 and 53 — so the method is
> unreliable and the figure should not be quoted. The live database is the only
> authority:
>
> ```sql
> SELECT modality, COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) AS total
> FROM inference.models GROUP BY modality ORDER BY total DESC;
> ```
>
> Nothing in this plan's conclusions depends on the exact count — the Wokey
> overlap is six models whether the catalog holds 53 or 72 — but the number
> should be replaced with a measured one before anyone quotes it.

| Product surface | Route | Modality | Billing unit |
|---|---|---|---|
| Chat completions | [chat-completions.ts](../../workers/inference/src/routes/chat-completions.ts) | chat | tokens |
| Anthropic Messages shim | [messages.ts](../../workers/inference/src/routes/messages.ts) | chat | tokens |
| Embeddings | [embeddings.ts](../../workers/inference/src/routes/embeddings.ts) | embedding | tokens |
| Rerank | [rerank.ts](../../workers/inference/src/routes/rerank.ts) | rerank | per 1k docs |
| Moderations | [moderations.ts](../../workers/inference/src/routes/moderations.ts) | moderation | per 1k items |
| Image generation | [images.ts](../../workers/inference/src/routes/images.ts) | image | per image |
| Video generation | [video-generations.ts](../../workers/inference/src/routes/video-generations.ts) | video | per second |
| Music generation | [music-generations.ts](../../workers/inference/src/routes/music-generations.ts) | music | per second |
| Text to speech | [audio-speech.ts](../../workers/inference/src/routes/audio-speech.ts) | tts | per 1k chars |
| Speech to text | [audio-transcriptions.ts](../../workers/inference/src/routes/audio-transcriptions.ts) | stt | per audio minute |
| OCR | [ocr.ts](../../workers/inference/src/routes/ocr.ts) | ocr | per page |
| Vector collections + RAG answer | [vector-collections.ts](../../workers/inference/src/routes/vector-collections.ts), [vector-answer.ts](../../workers/inference/src/routes/vector-answer.ts) | embedding + chat | tokens |
| Batch inference | [batches/[id]/process](../../app/api/inference/batches/) | chat | tokens |
| Agents (agentcore) | agent-runner worker | chat | tokens |
| Fine-tuning + managed serving | RunPod, `serving_type='runpod_ft'` | chat | GPU time |

Only the last row does not depend on the model gateway.

---

## 3 · How a request flows today

```
customer
   │  Bearer sk-ahura-...
   ▼
workers/inference  ── auth (KV) ── feature gate ── model scope
   │
   ├─ lookupModelRouting()          inference.models  (per-request DB read)
   │     serving_type='proxy'  ──────────────┐
   │     serving_type='runpod_*' ─→ managed vLLM pod
   │                                          │
   ├─ resolveUpstreamKey()                    │
   │     billing='platform' → OPENROUTER_PLATFORM_KEY
   │     billing='byok'     → decrypt org's key from inference.byok_keys
   │                                          │
   ├─ preset compile (X-Ahura-Preset) ────────┤  provider.sort / max_price /
   │                                          │  allow_fallbacks / fallback chain
   ▼                                          ▼
   semantic cache ──miss──→  OPENROUTER_BASE_URL + /chat/completions | /embeddings
                                               | /rerank | /images | /videos
                                          │
   brand-scrub (strip upstream identity) ←┘
                                          │
   usage event → Cloudflare queue → consumers/usage.ts → computeCost()
                                          │           reads inference.models.pricing
                                          │           and .upstream_pricing
                                          ▼
                                   inference.usage  → admin screens, billing
```

**One supplier is assumed at every layer.** The key resolver, the preset
compiler, the cost consumer and the admin margin screen all treat "upstream" as
a singular thing.

---

## 4 · Where OpenRouter is wired in

Two environment variables (`OPENROUTER_BASE_URL`, `OPENROUTER_PLATFORM_KEY`)
plus `OPENROUTER_API_KEY` for the pricing script. Three layers of code.

### 4.1 Inference worker — the gateway

| File | Line | Call |
|---|---|---|
| [lib/openrouter.ts](../../workers/inference/src/lib/openrouter.ts) | 30 | `forwardJson()` — the shared primitive |
| [routes/chat-completions.ts](../../workers/inference/src/routes/chat-completions.ts) | 696, 856, 910 | chat + retry + repair |
| [routes/messages.ts](../../workers/inference/src/routes/messages.ts) | 326 | Anthropic shim |
| [routes/embeddings.ts](../../workers/inference/src/routes/embeddings.ts) | 155 | `/embeddings` |
| [routes/rerank.ts](../../workers/inference/src/routes/rerank.ts) | 85 | `/rerank` |
| [lib/rag-rerank.ts](../../workers/inference/src/lib/rag-rerank.ts) | 61 | `/rerank` |
| [lib/semantic-cache.ts](../../workers/inference/src/lib/semantic-cache.ts) | 126 | `/embeddings` |
| [routes/vector-collections.ts](../../workers/inference/src/routes/vector-collections.ts) | 57 | `/embeddings` — **URL hardcoded, ignores env** |
| [routes/vector-answer.ts](../../workers/inference/src/routes/vector-answer.ts) | 298 | chat |
| [routes/images.ts](../../workers/inference/src/routes/images.ts) | 84 | `/images` |
| [routes/video-generations.ts](../../workers/inference/src/routes/video-generations.ts) | 105, 309, 506 | `/videos` submit + poll |
| [routes/ocr.ts](../../workers/inference/src/routes/ocr.ts) | 135 | chat (vision) |
| [routes/moderations.ts](../../workers/inference/src/routes/moderations.ts) | 144 | chat (llama-guard) |
| [routes/audio-speech.ts](../../workers/inference/src/routes/audio-speech.ts) | 82 | chat (audio out) |
| [routes/audio-transcriptions.ts](../../workers/inference/src/routes/audio-transcriptions.ts) | 107 | chat (audio in) |
| [routes/music-generations.ts](../../workers/inference/src/routes/music-generations.ts) | 70 | chat |

Note the shape: **TTS, STT, OCR, moderation and music are not dedicated upstream
endpoints.** They are chat/completions calls with a crafted prompt. That makes
them *technically* portable to any OpenAI-compatible supplier — but only if that
supplier carries the specific model.

### 4.2 Control plane (Next.js)

| File | Purpose |
|---|---|
| [batches/[id]/process/route.ts](../../app/api/inference/batches/) | fans out batch items directly at the upstream, bypassing the Worker |
| [internal/media-job-watchdog/route.ts](../../app/api/inference/internal/media-job-watchdog/route.ts) | re-polls stuck video jobs |
| [vector/collections/[id]/upsert/route.ts](../../app/api/inference/vector/) | server-side auto-embed |
| [byok-keys/route.ts](../../app/api/inference/byok-keys/route.ts) | verifies customer keys against `GET /key` |
| [presets/route.ts](../../app/api/inference/presets/route.ts) | stores OpenRouter routing config |
| [scripts/sync-or-model-pricing.ts](../../scripts/sync-or-model-pricing.ts) | syncs `upstream_pricing` from the upstream catalog |

### 4.3 Legacy AI-agents stack

[lib/ai/openrouter.ts](../../lib/ai/openrouter.ts) — hardcoded base URL, its own
client, separate from the gateway. Serves the older `ai-agents` product.

### 4.4 What does *not* need touching

`agent-runner` calls our own `/v1` via `INFERENCE_BASE_URL`
([env.ts:71](../../workers/agent-runner/src/env.ts#L71)). Agents inherit any
routing decision automatically.

---

## 5 · What our supply costs today

### 5.1 Platform fees (verified on openrouter.ai/pricing, 2026-08-25)

| Billing mode | Fee |
|---|---|
| PAYG prepaid credits | **5.5%** on purchase |
| PAYG bring-your-own provider key | **$0 up to $25,000/mo** of list-price inference, then 5% |
| Enterprise BYOK | $0 up to $200,000/mo, then 5% |

Inference itself is passed through at provider list price.

> **Naming warning.** "BYOK" here means *we* give the gateway our own Anthropic /
> OpenAI keys. It is unrelated to our own BYOK feature (`inference.byok_keys`,
> `auth.billing === 'byok'`), which is a *customer* giving *us* a key. The two
> must never be conflated in routing code or in this plan's tasks.

### 5.2 Live model prices, USD per 1M tokens

| Model | in | out | cache read | cache write 5m | cache write 1h |
|---|---|---|---|---|---|
| claude-sonnet-4.6 | 3.00 | 15.00 | 0.30 | 3.75 | 6.00 |
| claude-opus-4.7 | 5.00 | 25.00 | 0.50 | 6.25 | 10.00 |
| claude-haiku-4.5 | 1.00 | 5.00 | 0.10 | 1.25 | 2.00 |
| gpt-5.5 | 5.00 | 30.00 | 0.50 | — | — |
| gpt-5.2 | 1.75 | 14.00 | 0.175 | — | — |
| kimi-k2.6 | 0.95 | 4.00 | 0.16 | — | — |
| minimax-m2.5 | 0.27 | 1.08 | 0.027 | — | — |

**Cache writes cost more than fresh input** on Anthropic models. We do not record
them at all — see §8.

---

## 6 · What Wokey actually is

A two-sided marketplace: people run a Provider Node that exposes their own idle
AI-subscription capacity, and Wokey resells it through an OpenAI-compatible API.
That is the source of the discount, and the source of the risk.

### 6.1 Endpoints — probed directly, unauthenticated

`401` means the endpoint exists and wants a key. `404` means it does not exist.

| Endpoint | Wokey | Our dependency |
|---|---|---|
| `/v1/chat/completions` | **401 — exists** | chat, TTS, STT, OCR, moderation, music |
| `/v1/messages` | **400 — exists**, validates Anthropic body | Messages shim |
| `/v1/responses` | **401 — exists** | — |
| `/v1/images/generations`, `/v1/images/edits` | **401 — exists** | images |
| `/v1/videos` | **401 — exists** | video |
| `/v1/embeddings` | **404** | embeddings, semantic cache, vector auto-embed |
| `/v1/rerank` | **404** | rerank, RAG rerank |
| `/v1/audio/speech`, `/v1/audio/transcriptions` | **404** | TTS, STT |
| `/v1/moderations` | **404** | moderations |
| `/v1/batches` | **404** | batch API |

### 6.2 Catalog — `GET /v1/models/pricing`, public

43 models. **Anthropic 9, OpenAI 8, xAI 5, Jimeng media 5, Cursor 6, Volcengine
3, Zhipu 3, Moonshot 3, MiniMax 1.**

Three corrections to the research transcript:

1. **No Google / Gemini models at all.** The transcript listed Gemini as
   supported. It is a Provider Node *vendor*, not a purchasable model.
2. **No Llama, Qwen, Mistral, Cohere or Phi either.**
3. **All six `cursor-*` models — the 95%-off tier — are `available: false`.**
   That is the marketplace failure mode visible in their own API: cheap supply
   that has already gone dark.

### 6.3 Prices, USD per 1M tokens

Their `reference_price` matches list price exactly, so this is like-for-like.

| Wokey model | in | out | cache read | cw 5m | cw 1h | vs list |
|---|---|---|---|---|---|---|
| claude-sonnet-4-6 | 0.54 | 2.70 | 0.054 | 0.675 | 1.08 | −82% |
| claude-sonnet-5 | 0.36 | 1.80 | 0.036 | 0.45 | 0.72 | −82% |
| claude-opus-4-7 | 1.10 | 5.50 | 0.11 | 1.375 | 2.20 | −78% |
| claude-haiku-4-5 | 0.20 | 1.00 | 0.02 | 0.25 | 0.40 | −80% |
| gpt-5.5 | 0.50 | 3.00 | 0.05 | — | — | −90% |
| gpt-5.6-sol | 0.50 | 3.00 | 0.05 | 0.625 | — | −90% |
| kimi-k2.6 | 0.19 | 0.80 | 0.032 | — | — | −80% |
| grok-4.3 | 0.25 | 0.50 | 0.025 | — | — | −80% |

`pricing_mode` is `dynamic_discount` — settlement uses the price at request
time. **A static price column cannot represent this supplier.**

---

## 7 · What we could actually replace

### 7.1 By endpoint

| Our service | Verdict | Reason |
|---|---|---|
| Chat completions | ✅ replaceable, for models in the intersection | same wire format |
| Messages shim | ✅ replaceable | Wokey speaks Anthropic natively |
| Image generation | ➖ adapter needed | different endpoint shape and model ids |
| Video generation | ➖ adapter needed | Jimeng/Seedance only, async job model |
| OCR, moderation, TTS, STT, music | ❌ | the specific models are not in their catalog |
| Embeddings, rerank, batch | ❌ | endpoint does not exist |
| Vector DB, fine-tuning, managed serving | ❌ n/a | ours, not a supplier concern |
| Presets | ❌ | compiles vendor-specific routing knobs |
| Customer BYOK traffic | ❌ | we would be spending the customer's key |

### 7.2 By model — the number that matters

**Measured against the LIVE database and the LIVE Wokey catalog** by
[scripts/sync-wokey-catalog.ts](../../scripts/sync-wokey-catalog.ts), run
2026-08-25:

```
Wokey lists 43 models.  Our catalog has 83 proxy models.
5 of our chat models exist at Wokey; 51 do not.
```

**5 models, not 6.** An earlier draft said six, derived by grepping the seed
migrations — the same unreliable method that produced the bogus catalog count in
§2. `anthropic/claude-sonnet-4.5` appears in the migrations but is not a live,
priced chat row, so it is not actually sellable through Wokey or anyone else.
The live catalog is the only authority, and the sync script is how you ask it.

Cents per million tokens, as the sync actually read them:

| Ours | Wokey id | in / out | cache read / write |
|---|---|---|---|
| `anthropic/claude-sonnet-4.6` | `claude-sonnet-4-6` | 54 / 270 | 5 / 68 |
| `anthropic/claude-opus-4.7` | `claude-opus-4-7` | 110 / 550 | 11 / 138 |
| `anthropic/claude-haiku-4.5` | `claude-haiku-4-5` | 20 / 100 | 2 / 25 |
| `openai/gpt-5.5` | `gpt-5.5` | 50 / 300 | 5 / 50 |
| `moonshotai/kimi-k2.6` | `kimi-k2.6` | 19 / 80 | 3 / 19 |

Everything else has no Wokey equivalent. Three of the five are Anthropic. Note
the cache-write column exists here and did not exist in our own cost model at
all until §8 Bug 1 was fixed.

**The intersection is small partly because our catalog is stale.** Wokey carries
`claude-sonnet-5`, `gpt-5.6-*`, `kimi-k3`, `deepseek-v4-pro`, `glm-5.x`; we
carry the previous generation of each. Refreshing the catalog is therefore a
*precondition* for this project mattering, not an unrelated task.

---

## 8 · Three cost-reporting defects found while researching this

All three affect current business reporting whether or not we ever adopt a
second supplier. **They should be filed as production bugs, not as subtasks
here.**

### Bug 1 — cache writes are invisible

* [sync-or-model-pricing.ts](../../scripts/sync-or-model-pricing.ts) reads
  `input_cache_read` only. The upstream catalog also publishes
  `input_cache_write` and `input_cache_write_1h`; neither is fetched.
* No column exists to hold them. `TOKEN_FIELDS` in
  [lib/admin/inference-pricing.ts](../../lib/admin/inference-pricing.ts) is
  `input / cached / output`.
* `rawTokenCostCents()` in
  [consumers/usage.ts](../../workers/inference/src/consumers/usage.ts) has no
  write leg.
* The upstream returns `cache_write_tokens` and `cache_discount` in
  `prompt_tokens_details`; we read only `cached_tokens`.
* [messages.ts:522](../../workers/inference/src/routes/messages.ts#L522) reports
  `cache_creation_input_tokens: 0` to the customer.

Effect: on Anthropic models a cache write costs 1.25×–2× input — **more than not
caching**. Every cached Claude request under-reports our cost and over-reports
margin.

### Bug 2 — non-chat modalities have no cost basis at all

The upstream `/api/v1/models` endpoint lists **only chat models** (419 of them).
It contains no `text-embedding-3-*`, no `cohere/rerank-v3.5`, no Whisper. Our
sync iterates every `serving_type='proxy'` row, so embeddings, rerank, TTS, STT,
OCR and moderation all land in its `notOnOr` bucket and keep a NULL
`upstream_pricing`.

Downstream, per the documented fallback in `computeCost()`,
`upstreamCostCents = costCents`. And in
[lib/admin/inference-usage.ts](../../lib/admin/inference-usage.ts),
`hasMeasuredCost()` treats equal costs as *unmeasured* — correctly, but the
result is that **we cannot answer "are embeddings profitable?" at all.** The
admin usage screen already surfaces this as `margin_coverage_pct`.

### Bug 3 — legacy agent traffic has no cost side at all

The older `ai-agents` product does not go through the gateway. It calls the
upstream directly via [lib/ai/openrouter.ts](../../lib/ai/openrouter.ts), and
records usage through `AgentUsage.record()` into **`agents.usage`** — a daily
rollup per agent holding `request_count`, token counts and `estimated_cost`.

`estimated_cost` is the **customer** price. There is no upstream cost column, no
`provider`, and no per-model breakdown — rows are aggregated by agent and date.

Commit `30271aff` fixed the *revenue* side here: prices now come from
`inference.models.pricing` rather than the drifted local table
([ai_agents.ts:1192](../../lib/supabase/queries/ai_agents.ts#L1192), `pricesFor`). The cost
side was not part of that fix and remains unmeasured.

Two consequences:

1. **Real money is spent upstream by this product and attributed nowhere.** It
   is invisible to every admin margin screen, because those all read
   `inference.usage`.
2. **It skews the decision gate.** The §11 addressable-COGS query reads
   `inference.usage` and therefore does not see this traffic at all. If legacy
   agents route meaningful Claude volume, the six overlapping models are a
   *larger* share of real upstream spend than that query will report.

Because `agents.usage` is a daily rollup with no model dimension, the legacy
share cannot be reconstructed from our own data. Reconciling against the
supplier's own monthly spend report is a **measurement technique for the P0
gate, not a fix** — it answers "how big is this" once, and answers nothing next
month. The durable fix is to record `model_id`, `provider`, `upstream_cost`,
`customer_cost` and tokens per request, as the gateway already does.

**Tech debt this exposes.** The real problem is that a second inference and
billing path exists at all:

```
today            new agents ──→ Ahura /v1 ──→ supplier
                 legacy agents ─────────────→ supplier (own client, own table)

eventually       new agents ────┐
                 legacy agents ─┴─→ Ahura /v1 ──→ routing + usage + tracing
```

Routing the legacy stack through our own `/v1` deletes the parallel path
outright — it would inherit usage, tracing, margin reporting and any future
supplier routing for free, instead of needing each one reimplemented. That is
not a blocker for anything in this plan, and it should not be smuggled into P0.
It is debt that P0 uncovered, and it belongs on the backlog with this reasoning
attached.

---

## 9 · What a second supplier breaks

### 9.1 Gateway

| Area | Change |
|---|---|
| `forwardJson` / `resolveUpstreamKey` | take a provider argument; add a Wokey platform key |
| `lookupModelRouting` | must return the preferred route **and** the OpenRouter fallback, not one upstream id |
| Fallback | new: try the preferred supplier, fall through to OpenRouter on failure. One retry, not a chain |
| Availability | Two separate signals — the supplier's catalog flag (synced, DB) and observed health (KV). Health must **not** become more per-request DB reads: `lookupModelRouting` already opens a fresh Supabase client on every request on every route. See §9.2 |
| Presets | a preset-carrying request must force OpenRouter |
| Customer BYOK | `billing === 'byok'` must force OpenRouter |
| Brand scrub | [brand-scrub.ts](../../workers/inference/src/lib/brand-scrub.ts), [error-messages.ts](../../lib/inference/error-messages.ts), [infra-scrub.ts](../../workers/agent-runner/src/tools/infra-scrub.ts) all rewrite one vendor name. A second supplier leaks through model output, error text and agent traces until all three are extended |
| Hardcoded URL | [vector-collections.ts:57](../../workers/inference/src/routes/vector-collections.ts#L57) ignores the env var entirely |

### 9.2 Data model

`inference.models` **already has an `upstream_provider` column** (type
`inference.byok_provider`), populated by the seed migrations and read by the
admin screen — but the gateway never reads it. It is dead weight today.

It is also not sufficient, though not for the reason an earlier draft gave. A
model needs a provider-specific id, a per-supplier price and per-supplier
catalog state — several rows' worth of facts — even though only one non-default
supplier is ever *preferred* at a time. One column cannot hold facts about
suppliers we are not currently using.

Three different kinds of fact get confused here, and they must not share a
column. Policy is ours and changes when an operator decides. Catalog state is
the supplier's and changes when they publish. Health is observed and changes by
the minute. Only the first two belong in Postgres.

The dropdown in §1.1 is **one column**, and OpenRouter is always the fallback.
That removes the need for a priority chain entirely:

```
inference.models
  preferred_provider  NULL = OpenRouter (the default for every row today).
                      Set to 'wokey' and that model is bought from Wokey.
                      THIS is what the admin dropdown writes — one column,
                      one write, trivially auditable and reversible.

inference.model_routes            -- per-supplier FACTS about a model
  model_id            → inference.models
  provider            'openrouter' | 'wokey' | 'direct_anthropic' | ...
  upstream_model_id   provider-specific id ('claude-sonnet-4-6' vs
                      'anthropic/claude-sonnet-4.6')
  upstream_pricing    jsonb, this supplier's cost
  enabled             bool — OUR policy. Only an operator writes this.
                      The catalog sync must never touch it. Defaults FALSE
                      for marketplace suppliers, matching §9.4's fail-closed
                      rule: a newly discovered route is off until a human
                      turns it on.
  catalog_present     bool — is this model still listed by the supplier at all
  catalog_available   bool — the supplier's own `available` flag
  catalog_synced_at   when the sync last looked
                      All three: SYNC ONLY. Never written per request.

KV: cooldown:{provider}:{model}   -- HEALTH: one key, with a TTL
  present = this route just failed, skip it
  absent  = try it
```

Choosing a supplier is `UPDATE inference.models SET preferred_provider = ...`.
Choosing OpenRouter again is the same statement with NULL. There is no ordering
to keep consistent, no pair of rows that can disagree, and no state where a
model has no route — OpenRouter is the floor by construction.

*(A priority chain becomes worth having if we ever run three suppliers with a
non-fixed fallback order. Per §9.4, not before.)*

**One writer per column — and the sync never deletes a row.** Protecting the
`enabled` column is not enough on its own: if the sync owns the row's
*existence*, it can erase an operator's decision by deleting and later
re-inserting it.

```
operator      wokey + model X → enabled = false     (a deliberate veto)
sync          X vanishes from the supplier catalog  → row DELETED
sync          X comes back next week                → row re-INSERTED
result        the veto is gone, and nobody was told
```

So the rule is a soft delete:

| Event | What the sync does |
|---|---|
| new model appears in a supplier's catalog | INSERT, `catalog_present = true`, **`enabled = false`** |
| model disappears from the catalog | `catalog_present = false`, `catalog_available = false` — **never DELETE** |
| model returns | `catalog_present = true`, refresh price and availability, **leave `enabled` exactly as it was** |

Rows are only ever removed by a human, deliberately. With that, an operator
decision cannot be undone by anything except another operator, and nobody has to
special-case a collision, because the collision cannot happen.

It also gives the admin screen a distinction worth showing: **"listed but
unavailable right now"** is a supplier having a bad day; **"no longer listed"**
is supply that has gone for good — which is precisely what happened to the
`cursor-*` models (§6.2).

Health is deliberately one key with an expiry, not a metrics store. A route
fails → write the key with a short TTL → requests skip that route while it
exists → once it expires, requests try the supplier again, and another failure
reinstates it. **This is not a half-open circuit breaker.** Several requests can
race through the moment the key expires, and that is accepted: the cost is a
handful of extra failures every cooldown period, and guaranteeing exactly one
probe needs an atomic lease, which is more machinery than the problem deserves.
No failure counters, no latency percentiles, no background poller either —
latency and error rates already live in the traces, off the request path.

Wokey's `available: false` on the `cursor-*` models is a *catalog* fact and
belongs in the first block; a route that just timed out is a *health* fact and
belongs in the second. Keeping them apart is what stops two sources of truth
from disagreeing — it is not extra machinery.

`inference.usage` needs a `provider` column, for billing attribution only.
Today the row records `upstream_cost_cents` with no record of *who* charged it —
with two suppliers that number becomes unattributable, and per-model margin
becomes meaningless.

That column alone loses the failed attempts, though:

```
Wokey attempt → timeout after 4s → OpenRouter fallback → success
```

records `provider = openrouter` and hides the fact that Wokey cost the customer
four seconds and failed. That information is the whole point of the P3
benchmark, and it must survive into production.

**Use the existing trace pipeline for this, not a new table.**
[trace.ts](../../workers/inference/src/lib/trace.ts) already emits OTel-style
spans with `parentSpanId`, `latencyMs`, `ttftMs`, `status` and a free-form
`attributes` object, drained by a queue consumer into the partitioned
`inference.trace_spans`. A failed route attempt is exactly a child span with
`status: 'error_upstream'` and `attributes: { provider, upstream_model_id,
attempt_no, quoted_price, http_status, failure_class }`. Spans are always
emitted — only payloads are sampled or suppressed for ZDR keys — so attempt
coverage is complete. A dedicated `route_attempts` table would add a third
high-volume write path for data the trace pipeline is already built to carry.

**Dynamic pricing breaks the pipeline shape.** Cost is currently computed
*after* the request, in the queue consumer, from a static column. Wokey settles
at request time, so a static column cannot be right for it.

What we can *definitely* capture on the request path is the **price snapshot at
dispatch** plus actual token usage; cost is then computed from that snapshot
rather than from the catalog. If the supplier's authenticated response turns out
to carry an authoritative billed cost for that request, store that instead — but
we have not proven it does, and the design must not assume a response field
nobody has seen. Either way the figure gets reconciled against the supplier's
own billing (P3, step 13), which is the only way dynamic pricing is ever
trustworthy.

### 9.3 Admin section

This is the part most likely to be underestimated. The admin pricing engine
([lib/admin/inference-pricing.ts](../../lib/admin/inference-pricing.ts), 360
lines of pure, tested rules) is built on **one price versus one cost**.

| Admin surface | What it does today | Impact |
|---|---|---|
| `marginPct()` | `(ours − theirs) / ours` on the basis field | With two suppliers "theirs" is no longer scalar. Margin must be computed per provider, or from actual usage rows, not from the catalog |
| `TOKEN_FIELDS` | `input`, `cached`, `output` | No cache-write field exists. Bug 1 cannot be *displayed*, let alone priced, until this list grows |
| `planReprice()` | prices to a target margin off `upstream_pricing.output_cents_per_mtok` | Which supplier's cost do we price against? Pricing off the cheap one and then failing over to the expensive one turns a fallback into a loss |
| `planPriceUpdate()` floor | refuses a price below known upstream cost | Same question. The floor must be the *most expensive* eligible route, not the cheapest |
| `summarize()` → `cost_unknown` | counts models with no cost basis | This is where Bug 2 is already visible on screen |
| [inference-usage](../../components/admin/inference-usage/) | reports `margin_pct` with `margin_coverage_pct` | Needs a per-provider split, and a "% of spend served by each supplier" figure |
| [inference-overview feature switches](../../components/admin/inference-overview/feature-switches.tsx) | five kill switches in `public.platform_settings`, fail-open, audited, each with a real enforcement point | **The right home for a Wokey kill switch** — same table, same UI, same typed reason on disable. **One deliberate difference: this switch fails CLOSED** (§9.4). The existing five gate capabilities, where closed means 503; a supplier switch gates only *which upstream*, where closed means OpenRouter. Say so in its `enforced_in` |
| [inference-orgs](../../components/admin/inference-orgs/) | per-org spend | Needs the per-org "may use marketplace supply" flag from §10 |

**The admin work, stated as screens rather than features:**

1. **Model catalog** — add two columns to the existing pricing table: *cost by
   supplier*, and a **buy from** dropdown. That dropdown is the entire control
   surface for routing. Everything else on that screen already exists.
2. **Supply health** — one new read-only panel. Specified in full in §9.5,
   because "is it reachable" is exactly the kind of phrase that smuggles a
   background poller back in.
3. **Capability switches** — one new entry per supplier in the existing
   `FEATURE_SWITCHES` list. Same table, same typed reason on disable, but
   **fail-closed rather than fail-open** — see §9.4 for why that is the correct
   inconsistency.
4. **Organisations** — one flag, `allow_marketplace_supply`, default off, read
   fail-closed.

Three of the four are additions to screens that already exist. Only "supply
health" is new, and it is a read-only panel.

**Modularity, concretely.** One interface, one small file per supplier:

```
lib/suppliers/
  types.ts        the interface every supplier implements
  openrouter.ts   what lib/openrouter.ts already does, behind that interface
  wokey.ts        new — base URL, key, id mapping, cost extraction
```

Adding a third supplier will legitimately need a few registrations elsewhere: a
secret binding, a value in the provider enum, a line in the catalog sync, a
dropdown option, a kill-switch entry. Those are declarations, not design.

The test is narrower and stricter than "touch nothing outside this folder":
**if adding supplier #3 requires changing request-execution logic, the cost and
billing pipeline, or any individual inference route, the abstraction is wrong.**
Registration is expected. Surgery is not.

### 9.4 What we deliberately do not build

An earlier draft of this plan had the router compare live prices and pick the
cheaper supplier above a minimum-saving threshold. **That is cut.** It solved a
problem created entirely by automatic routing, and automatic routing is not
worth having for six models.

The rule at request time is a lookup, not a decision:

```
p = models.preferred_provider        (NULL → OpenRouter, done)

use p ONLY IF EVERY ONE of these is affirmatively true:
    its model_routes row exists and enabled = true
    catalog_available = true
    p's kill switch reads explicitly ON
    this org's allow_marketplace_supply reads explicitly TRUE
    no cooldown key
anything false, missing, unreadable or uncertain → OpenRouter
```

Five checks and one column read. Every one is either something an operator set
or something the system observed. Nothing is computed from prices on the request
path, and there is no ordering to get wrong.

**These checks fail CLOSED, and that is a deliberate departure from the existing
switch pattern.** [feature-switches.ts](../../lib/admin/feature-switches.ts)
fails *open* on purpose — a missing row or an unreachable database means
ENABLED — and its reasoning is sound for what it guards: those switches gate
whole capabilities, so failing closed would return 503 to customers and cause a
bigger outage than the one the switch exists to contain.

A supplier switch is a different question with a different answer. Failing
closed here does **not** fail the customer's request; it serves it from
OpenRouter. The cost of failing closed is a slightly higher bill for a few
minutes. The cost of failing open is routing to a marketplace supplier at the
exact moment we could not verify that the org is allowed to use one — which
contradicts `allow_marketplace_supply` defaulting to off and the commitment that
enterprise and ZDR traffic never touches marketplace capacity (§10).

> **Rule: uncertainty routes to OpenRouter.** Marketplace supply requires a
> positive answer to every question. Silence is a no.

This must be stated in the switch's `enforced_in` note so nobody later
"corrects" it into consistency with the other five.

| Not building | Why |
|---|---|
| price-comparison routing | a human with the price table decides better, and can explain why |
| minimum-saving thresholds | needed only to make automatic routing safe |
| health scores, latency percentiles on the request path | already in traces, off the hot path |
| background health pollers | a failed request is the health check |
| customer-facing supplier tiers | see §13, decided against for now |
| a Wokey adapter for images or video | §12 P5, only if chat proves itself |

Each of these becomes worth revisiting when there is data saying so. None of
them are worth building before the first model has ever been served by a second
supplier.

### 9.5 Supply health, and the operator's lifecycle

The health panel must not need any new data collection. Every figure below comes
from something the platform already writes.

| Panel column | Derived from | Not from |
|---|---|---|
| requests today, by supplier | `inference.usage.provider` | — |
| upstream spend today, by supplier | `inference.usage.upstream_cost_cents` + `provider` | — |
| fallbacks in 24h | `trace_spans` child spans with `status='error_upstream'` and a `provider` attribute | — |
| currently cooling down | the presence of `cooldown:{provider}:{model}` KV keys | a health poller |
| last price sync | `model_routes.catalog_synced_at` | — |
| models delisted by the supplier | `model_routes.catalog_present = false` | — |
| models currently bought here | `models.preferred_provider` | — |

**There is no reachability probe, and the panel must not imply one.** A supplier
is only ever exercised by real traffic. This follows the pattern already set by
[cron-registry.ts](../../lib/admin/cron-registry.ts), which judges health on the
age of a heartbeat rather than on what the last run said.

That registry exists because of a real incident: six cron endpoints 404'd in
production for about two months and the overview reported the platform healthy
throughout, **because a sweep that stops running produces nothing at all**. The
identical trap applies here. A supplier nobody routes to produces no errors, and
"no errors" must never render the same as "working". So the verdicts are:

| Verdict | Meaning |
|---|---|
| **Serving** | traffic in the last hour, mostly succeeding |
| **Degraded** | traffic in the last hour, fallbacks above a visible share |
| **Cooling down** | one or more cooldown keys currently set |
| **Idle** | enabled, but no model has `preferred_provider` set to it |
| **No traffic** | models point at it, but nothing has been served recently — the suspicious state, and the one the cron incident teaches us to render loudly |

**Nobody is paged, and that is a deliberate choice.** The panel is pull-based,
like the cron panel next to it. Building alerting is not in this plan because
the fallback changes what a supplier outage *is*: if Wokey goes dark at 03:00,
customers are served by OpenRouter and notice nothing. We pay more until someone
looks. That makes it a cost event on a dashboard, not an incident worth waking
someone for. **If that ever stops being true — if a supplier becomes primary for
enough traffic that the cost difference matters within hours — this decision has
to be revisited.**

**What an operator actually does, start to finish:**

```
1. ADD          secret + enum value + catalog sync entry + kill switch
                (a deploy, done once per supplier — not per model)

2. VERIFY       supply health shows the supplier, prices synced,
                models listed as usable.  Still zero traffic.

3. ENABLE       org flag on ONE internal org.
                Kill switch on.

4. POINT        model catalog → claude-sonnet-4.6 → buy from: Wokey
                One dropdown. Audited like any price change.

5. WATCH        a week. Requests, spend, fallbacks, margin, error rate.
                Compare margin against the same model the week before.

6a. GOOD        point a second model. Repeat 5.
6b. BAD         set the dropdown back to OpenRouter. Traffic moves on the
                next request. No deploy, no migration, no data to unwind.
6c. URGENT      flip the kill switch. Every model on that supplier reverts
                at once, with a typed reason recorded in the audit log.
```

Step 6b is the property worth protecting above all others in this design: **the
undo is a dropdown, and it takes effect on the next request.** Anything proposed
later that weakens that — cached routing decisions, migrated data, customer-
visible supplier names — is trading away the reason this plan is safe.

### 9.6 Designed for change — and where it currently is not

Prices move, models break, models appear. Three questions, answered honestly.

**The two mechanisms we need already exist. Neither runs on a schedule.**

| Script | What it does | Scheduled? |
|---|---|---|
| [sync-or-model-pricing.ts](../../scripts/sync-or-model-pricing.ts) | pulls current upstream prices into `upstream_pricing` | ❌ manual `npx tsx` |
| [health-check-models.ts](../../scripts/health-check-models.ts) | calls every active model through our own gateway and deactivates ones that cannot answer | ❌ manual `npx tsx` |

[cron-registry.ts](../../lib/admin/cron-registry.ts) schedules nine jobs —
watchdogs, reapers, the connector scheduler, the deployment meter. **Neither of
these is among them.** That is why the catalog went stale: not a missing design,
an unscheduled one. Scheduling them is a small change and it is the highest-value
flexibility work in this whole document.

`health-check-models.ts` is worth reading before anyone writes anything similar.
It probes *behaviour* rather than diffing the upstream catalog, and explains why:
measured 2026-07-28, the catalog diff produced **18 false positives** — including
`text-embedding-3-small` and `bge-m3`, absent from the upstream list purely
because that list enumerates chat models only. Acting on it "would have disabled
embeddings and taken down the whole RAG stack." That is the same chat-only fact
that causes Bug 2 (§8), found independently, months earlier.

**Change 1 — a price moves.**

Handled *mechanically*: the sync overwrites `upstream_pricing`; Wokey's dynamic
price is snapshotted per request (§9.2). Not handled *consequentially*: when our
cost rises above our customer price, nothing says so. The sync prints a
"losing money" warning to a console nobody is watching, and the catalog has been
underwater before — twenty models at once.

The fix is small, because the maths already exists.
[inference-pricing.ts](../../lib/admin/inference-pricing.ts) has `marginPct`,
`priceTone` and `summarize`, and the admin screen already renders
`at_or_below_cost`. What is missing is that the sync should **record** what it
made underwater rather than only printing it, so the pricing screen shows it the
next time an operator opens it.

**Change 2 — a model stops working.**

Three different failures, three different mechanisms, and they should not be
confused:

| Failure | Signal | Handled by |
|---|---|---|
| transient (timeout, 429, 5xx) | the request itself | cooldown key, fallback (§9.2) |
| supplier delists it | `catalog_present = false` | catalog sync (§9.2) |
| listed but genuinely broken | it 4xxs with "unknown model" | `health-check-models.ts` — **once scheduled** |

**Change 3 — a new model appears. This one is not designed at all.**

Adding a model to `inference.models` is a hand-written SQL migration today. That
is how every model in the catalog got there, and it is the actual reason §12 P1
exists as a chunk of manual work. Nothing notices that a supplier has started
carrying something we do not sell.

The cheap fix follows the same rule as §9.2's soft delete — **record, never act**:

```
catalog sync sees a supplier model with no matching inference.models row
        ↓
write it to a proposals list (id, supplier, price, first_seen)
        ↓
it appears on the model catalog screen as "available, not sold"
        ↓
a human decides whether to sell it, and at what price
```

No automatic catalog growth: a model we have not priced must never become
sellable on its own. But "Wokey and OpenRouter both carry Sonnet 6, we do not
sell it, first seen 11 days ago" is a fact an operator should be shown rather
than have to go looking for.

**Adding a new supplier** is covered in §9.3 — one file in `lib/suppliers/`, plus
registrations. That is the change this design handles best.

### 9.7 Schema in migrations, catalog through an API

The instinct is right but the line matters. **Structure stays in migrations.
Data moves to an API.** They are different things and only one of them should
ever be editable from a browser.

The real defect today is not that migrations are hard to edit. It is that
**catalog data is stored in migrations at all.** Seed migrations were the right
way to bootstrap a catalog; they are the wrong way to keep one. That is why
adding a model is a code change, why the catalog drifted a generation behind,
and why §12 P1 exists as a lump of manual work.

| | Where it lives | Editable by an operator |
|---|---|---|
| Tables, columns, enums, indexes | migration | **never** |
| RLS policies and column grants | migration | **never** |
| Model rows: ids, names, capabilities, prices, active | `inference.models` via admin API | **yes, audited** |
| Routes: which supplier, upstream id, per-supplier price | `inference.model_routes` via admin API | yes, audited |
| Feature switches, org flags | already API-driven | yes, audited |

Structure stays in migrations for reasons that do not weaken over time: the code
must match the shape, so a schema change without a deploy is a broken deploy; it
needs review and a rollback path; and the column-level grants that hide our
upstream and cost basis from customers
([20260806000002](../../supabase/migrations/20260806000002_hide_upstream_columns_from_customers.sql))
are security controls. Nothing that can revoke them should be one click away.

**What exists already**, from the current admin routes:

| Method | Path | Purpose | State |
|---|---|---|---|
| GET | `/api/admin/inference/pricing` | list the catalog with cost and margin | ✅ |
| PUT | `/api/admin/inference/pricing` | set one model's price; toggle active | ✅ |
| POST | `/api/admin/inference/pricing/bulk` | bulk reprice, dry-run by default | ✅ |
| PUT | `/api/admin/inference/switches` | capability kill switches | ✅ |
| PUT | `/api/admin/inference/orgs` | per-org limits | ✅ |
| **POST** | **`/api/admin/inference/models`** | **create a model** | ❌ **missing — this is the gap** |
| **GET** | **`/api/admin/inference/models/proposals`** | supplier models we do not sell (§9.6) | ❌ missing |
| PATCH | `/api/admin/inference/models/{id}/route` | preferred supplier | ❌ P4 |

So the catalog can already be *edited* and *priced* — it just cannot be
*extended*. One POST plus a proposals list closes most of the distance, and both
follow patterns that already exist ([audit.ts](../../lib/admin/audit.ts) has
`modelPriceEntry` and `modelActivationEntry`; a create entry is the same shape).

**Five rules that belong in the API, not in the UI.** A browser form is a
suggestion; the route is the enforcement point.

1. **A model with no price cannot be activated.** The platform already refuses to
   sell an unpriceable model at request time; enforcing it at write time means
   the invalid state cannot be created in the first place.
2. **Activation requires a passing behaviour probe.** Reuse
   [health-check-models.ts](../../scripts/health-check-models.ts) rather than
   re-deriving it — it already distinguishes "genuinely dead" from "our probe
   body disagreed with that model's parameter rules", a distinction that cost
   someone a real investigation to learn.
3. **Never DELETE a model row.** `inference.usage` references `model_id` for
   billing history. Deactivate. This is the same soft-delete rule as §9.2, for
   the same reason.
4. **Bulk operations preview before they write.** `planReprice` already returns a
   plan the caller executes separately, so preview and apply cannot disagree.
   Anything bulk should copy it.
5. **Every write audited**, with the actor, the diff and — for anything
   overriding a guard — the typed reason. The pattern exists; use it.

Keep the validation rules in a pure module beside
[inference-pricing.ts](../../lib/admin/inference-pricing.ts) so they are testable
without a database, exactly as that file's own comment argues.

**Not building:** a generic table editor, a SQL console, or anything that emits
DDL. The value here is a *catalog* editor with the platform's rules enforced —
not a database client with a nicer skin.

### 9.8 Checked against how other gateways do this

Compared with LiteLLM, Portkey, Cloudflare AI Gateway and OpenRouter's own
routing. Three gaps, one of which invalidates a sentence in §1.1.

**Where we match the field.** Our `model_id` → `upstream_model_id` mapping *is*
the registry/alias pattern every gateway uses; moving `upstream_model_id` onto
the route row (§9.2) is the standard extension of it. A KV cooldown key is the
same mechanism LiteLLM implements with Redis. Config-driven routing (Portkey's
weighted, conditional configs) is more powerful than our per-model dropdown, and
deliberately so: for six models the dropdown is the right size, and named configs
are the thing to adopt *if* per-customer routing is ever needed.

---

**Gap 1 — fallback does not work once a stream has started. §1.1 overstates it.**

§1.1 says "if that supplier fails, the request goes to OpenRouter instead."
**That is only true before the first content chunk reaches the customer.** After
that the response is committed: bytes have already been sent, and switching
suppliers would splice two different generations into one answer.

This is not our limitation, it is the field's — it is a known, open issue in
LiteLLM and applies to Cloudflare's gateway and every other proxy. Our own
codebase already respects the rule: the structured-output retry in
[chat-completions.ts:856](../../workers/inference/src/routes/chat-completions.ts#L856)
is explicitly non-streaming only.

So the honest statement of the guarantee is:

```
before the first content chunk   →  fall back to OpenRouter (customer sees nothing wrong)
after the first content chunk    →  the request fails as it is, mid-answer
```

Two consequences the plan must carry:

* **The §11 fallback-cost line about "failures after generation began" applies to
  non-streaming requests only.** For a stream there is no retry to bill: the
  request is simply broken.
* **Streaming raises the real cost of marketplace supply.** Most chat traffic is
  streamed, so the fallback protects fewer requests than §1.1 implies. Worth
  measuring the *pre-first-chunk* failure rate specifically during the P3
  benchmark, because that is the number the whole design rests on.

**Gap 2 — an error arriving inside a 200 stream never triggers anything.**

A supplier can return `200 OK`, open a stream, and put the failure in the first
chunk. Our design keys fallback and cooldown off HTTP status, so that request
looks like a success: no fallback, no cooldown, no degraded reading on the health
panel — and the next request repeats it. This is precisely the failure mode a
relay-based marketplace produces, since the relay's HTTP layer succeeds even when
the vendor behind it does not.

We can at least detect it. `streamPassthrough` in
[openrouter.ts](../../workers/inference/src/lib/openrouter.ts) already buffers the
full stream text to parse usage at flush. That is too late to fail over, but not
too late to **set the cooldown key and record a failed attempt span** — which
stops the second, third and hundredth request from repeating it. Do that.

**Gap 3 — no per-supplier spend cap.**

Cloudflare's gateway and Portkey both enforce budgets per provider. We enforce
org spend caps, but nothing bounds *what we spend at a supplier*. With a supplier
whose price is settled per request (§6.3) a price move means we quietly spend
more and find out on a dashboard nobody is watching (§9.5).

The simple form fits this design: a daily spend ceiling per supplier, checked
from the same usage rows the health panel already reads. Over the ceiling,
`preferred_provider` stops being honoured and traffic serves from OpenRouter
until the next day — the same "fall back to the safe supplier" move as every
other check in §9.4, and the same cost of being wrong.

**Not adopting: health-check-driven routing.** LiteLLM runs background health
checks and removes deployments *before* a user hits them. We deliberately do not
(§9.4) — a failed request is our health check. The trade-off is that one request
eats each failure. With a fallback in front of it that is acceptable, and it is
consistent with our position: a *scheduled* catalog probe (§9.6) yes, a
per-route background poller no.

---

## 10 · Risks

| Risk | Evidence | Mitigation |
|---|---|---|
| Supply disappears | six `cursor-*` models are `available: false` in their own API right now | never primary without fallback; treat availability as a live routing signal |
| Upstream account bans | their own blog discusses relay ban mitigation and does not claim zero risk | fallback; cap the share of traffic exposed |
| Data retention | failed/abnormal requests can retain full payloads for 14 days, unredacted | per-org `allow_marketplace_supply` flag, default **off**, read fail-closed (§9.4); enterprise and ZDR traffic pinned to approved suppliers |
| Price volatility | `pricing_mode: dynamic_discount`, settled at request time | capture cost per request; floor customer prices against the expensive route; the scheduled sync **records** what it made underwater so the pricing screen shows it (§9.6) — not a page, per §9.5 |
| Invoicing / GST | no confirmed business invoicing; crypto and Alipay reported | finance sign-off **before** any production spend — this is a blocker for an Indian entity, not a detail |
| Quality drift | a marketplace can serve a different backend per request | benchmark before and continuously after |
| Concentration risk from BYOK | with only our own Anthropic key at the gateway, it can no longer fail over to Bedrock/Vertex | hold more than one direct credential, or accept and monitor |

---

## 11 · Benefits, honestly sized

| Lever | Saving | Risk | Blocked on |
|---|---|---|---|
| Prepaid credits → our own provider keys | 5.5% of top-ups, up to $25k/mo of list inference | low; concentrates failover on our accounts | commercial accounts, ops |
| Catalog refresh to current generation | Sonnet 5 costs $2/$10 against the $3/$15 we pay for Sonnet 4.6 — **we pay 50% more for an older model** | none | catalog work |
| Wokey for the 6 overlapping models | 78–90% on that traffic only | high | measurement, benchmark, finance |

**The missing number is addressable COGS, not revenue share.**

Three metrics, and only the third decides anything:

| Metric | What it tells us |
|---|---|
| share of requests | load, not money |
| share of revenue | distorted — our markup differs per model |
| **share of upstream spend** | **the money actually at stake** |

Revenue share can point the wrong way entirely. Both of these are plausible:

```
6 models = 12% of requests but 48% of COGS   → clearly worth doing
6 models = 30% of requests but  6% of COGS   → clearly not
```

`usage.upstream_cost_cents` is the column that is broken (§8), so the gate
cannot be run before the P0 fixes — it is the *last* step of P0, not the first.
In the meantime the number can be approximated from tokens × catalog rate, which
is reliable for chat models because the sync does price them:

```sql
-- Addressable COGS by model, last 30 days.
-- Computed from tokens x catalog rate, NOT from usage.upstream_cost_cents,
-- which is unreliable until P0 lands. Mirrors rawTokenCostCents() in
-- workers/inference/src/consumers/usage.ts on purpose.
-- Excludes cache writes (that is the bug), so it reads as a FLOOR on real cost.
WITH rate AS (
  SELECT model_id,
         (upstream_pricing->>'input_cents_per_mtok')::numeric  AS in_rate,
         (upstream_pricing->>'output_cents_per_mtok')::numeric AS out_rate,
         (upstream_pricing->>'cached_cents_per_mtok')::numeric AS cached_rate
  FROM inference.models
  WHERE upstream_pricing ? 'output_cents_per_mtok'
)
SELECT u.model_id,
       COUNT(*)                                    AS requests,
       SUM(u.cost_cents)                           AS revenue_cents,
       ROUND(SUM(
           GREATEST(COALESCE(u.input_tokens,0) - COALESCE(u.cached_tokens,0), 0)
             * r.in_rate / 1e6
         + COALESCE(u.cached_tokens,0) * COALESCE(r.cached_rate, r.in_rate) / 1e6
         + COALESCE(u.output_tokens,0) * r.out_rate / 1e6
       ), 2)                                       AS upstream_cents
FROM inference.usage u
JOIN rate r USING (model_id)
WHERE u.created_at >= NOW() - INTERVAL '30 days'
  AND u.status = 'success'
GROUP BY u.model_id
ORDER BY upstream_cents DESC;
```

The decision then reduces to:

```
potential monthly saving =
    Σ(tokens per model × current rate)
  − Σ(same workload      × Wokey rate)
  − expected fallback cost, which is NOT simply "billed twice":
        pre-inference failures (429, 5xx, model unavailable)
            → nothing billed upstream, latency only
        failures after generation began, NON-STREAMING only
            → partial output is billable, then the retry is billed in full
            (a streamed request cannot be retried at all — see §9.8)
        successful fallback
            → billed once, at the fallback route's rate
```

The distinction matters. Treating every fallback as a double charge overstates
the cost of exactly the failure mode a marketplace supplier produces most —
capacity that is simply not there, which fails before a token is generated.

**This query does not see the legacy agents product** (Bug 3) — that traffic
lives in `agents.usage` and never reaches `inference.usage`. Reconcile the total
against the supplier's own monthly spend before trusting the percentages; a
large gap is legacy agent volume.

If the six models are under ~20% of upstream spend, phases P3–P4 are not worth
the engineering and should be dropped.

---

## 12 · Plan

### P0 — Know the real number *(no supplier change)*

1. Add cache-write pricing end to end: sync `input_cache_write` and
   `input_cache_write_1h`; add the columns; extend `rawTokenCostCents()`; read
   `cache_write_tokens` from upstream usage; stop reporting
   `cache_creation_input_tokens: 0`.
2. Give non-chat modalities a cost basis. The chat catalog does not price them,
   so the source must be per-modality and the sync must **report** what it could
   not price rather than leaving NULL.
3. Extend `TOKEN_FIELDS` and the admin pricing screen to show cache write.
4. Attribute legacy agent spend (Bug 3): give `agents.usage` a cost side, or at
   minimum reconcile its volume against the supplier's own spend report so the
   gate below is measured on the whole bill rather than part of it.
5. **Last, after 1–4 land:** run the addressable-COGS query (§11). **Decision
   gate: continue only if the six overlapping models are a material share of
   upstream spend** — not of requests, and not of revenue.

### P1 — Catalog refresh *(independent value)*

6. Add the current generation: `claude-sonnet-5`, `claude-opus-5`, `gpt-5.6-*`,
   `kimi-k3`, `deepseek-v4-*`. Retire what upstream no longer serves.
7. Audit `upstream_model_id` values against the live catalog — several ids in
   the seed migrations do not resolve today.
8. **Schedule the two maintenance scripts** (§9.6) via `cron-registry.ts`, and
   make the price sync record underwater models rather than only printing them.
   This is what stops the catalog going stale again, and it is cheap.
9. **`POST /api/admin/inference/models` + the proposals list** (§9.7), so adding
   a model stops being a migration. This is what stops P1 from recurring every
   few months.
10. Re-run the reprice planner once real costs exist.

### P2 — Own provider keys behind the gateway *(ops, not code)*

11. Open direct commercial accounts where it pays; compare direct rates against
   catalog rates before switching each one.
12. Configure them at the gateway, keeping its routing and failover.
13. Verify the platform fee actually drops, and watch for lost cross-provider
    failover.

### P3 — Benchmark Wokey *(needs an account and a key)*

14. Chat only, the six overlapping models. Measure TTFT, tokens/sec, p50/p95/p99,
    429 and 5xx rates, availability over a week, tool calling, structured
    output, streaming aborts, reasoning fields, usage-field accuracy, and
    whether `cache_control` produces real cache hits through the relay.
15. Reconcile their billed cost against their published price — dynamic pricing
    must be verified, not trusted.
16. Finance sign-off on invoicing.

### P4 — Production routing *(only if P3 passes)*

17. `lib/suppliers/` — the interface, plus OpenRouter moved behind it. **No
    behaviour change, no second supplier yet.** This step is refactor-only and
    ships on its own.
18. `inference.models.preferred_provider` (all NULL) + `inference.model_routes`
    seeded with one OpenRouter row per model + a `provider` column on
    `inference.usage`. Still no behaviour change — NULL means today's behaviour.
19. `lib/suppliers/wokey.ts`, plus the cooldown key and the fail-closed checks
    of §9.4. Skip rules: preset → OpenRouter, customer BYOK → OpenRouter, org
    without an explicit `allow_marketplace_supply = true` → OpenRouter. Test the
    unreadable-switch and unreadable-org-flag paths explicitly; they are the
    ones that must not fail open.
20. Extend all three brand scrubs; fix the hardcoded URL in
    `vector-collections.ts`.
21. Admin: the four screens in §9.3.
22. Turn on **one model** for **one internal org**. Watch error rate, fallback
    count and margin for a week before the second.

### P5 — Media adapters *(optional, later)*

23. Images and video only if chat proves itself. Different endpoint shapes and a
    small model catalog; the work does not resemble P4.

---

## 13 · Open questions

1. What share of spend do the six overlapping models carry? *(P0, blocks everything)*
2. Will Wokey issue GST-compliant invoices to an Indian company? *(blocks P4)*
3. ~~Customer-facing supplier tiers?~~ **Decided: not yet.** Supplier choice
   stays internal through P3 and P4. Publishing "Economy / Standard /
   Enterprise" creates pricing pages, contractual expectations, usage rules and
   support load around marketplace supply *before* we know whether it is
   reliable enough to sell. The internal per-org flag
   `allow_marketplace_supply` gives us the same routing control with none of
   that commitment, and productising it later is easy; withdrawing a published
   tier is not. Revisit after P4 has a quarter of real reliability data.
   *(Recommendation — needs your sign-off, it is a product call.)*
4. What happens to `X-Ahura-Preset` long term — do we keep compiling a specific
   vendor's routing knobs, or define our own?
5. Which direct provider accounts are worth opening for P2?

---

## 14 · Sources

Live APIs read 2026-08-25: `api.wokey.ai/v1/models/pricing`,
`api.wokey.ai/v1/models`, endpoint probes against `api.wokey.ai/v1/*`,
`openrouter.ai/api/v1/models`, `openrouter.ai/pricing`, OpenRouter prompt-caching
guide. Codebase read at commit `30271aff` on `ai-admin-workphase-7`. The originating research transcript is not kept: its vendor and capability
claims did not survive checking (§6.2), and a wrong document in `docs/` is worse
than no document.
