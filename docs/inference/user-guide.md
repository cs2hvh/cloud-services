# AhuraCloud A.I. Labs — User Guide

**A complete reference for building on the AhuraCloud A.I. Labs platform.**
Audience: developers, ML engineers, and operators integrating LLMs into their
products. Read this end-to-end (~20 min) for a working mental model;
each section also stands on its own as a reference.

**Gateway URL:** `https://api.cs2hvh.com/v1` (temporary; final URL will be
`https://api.ahurasense.com/v1`).
**Dashboard:** `https://wao.cs2hvh.com`.
**Support:** `support@ahurasense.ai`.

---

## Table of contents

1. [What you get](#1-what-you-get)
2. [Quickstart — 5 minutes from signup to first call](#2-quickstart)
3. [Authentication & API keys](#3-authentication--api-keys)
4. [Models catalog](#4-models-catalog)
5. [Chat Completions](#5-chat-completions) (OpenAI-compatible)
6. [Messages](#6-messages) (Anthropic-compatible)
7. [Embeddings](#7-embeddings)
8. [Vector Store](#8-vector-store)
9. [Fine-Tuning](#9-fine-tuning)
10. [BYO Model Deploy](#10-byo-model-deploy)
11. [Batches](#11-batches)
12. [Routing Presets](#12-routing-presets)
13. [Caching](#13-caching) (L1 + semantic)
14. [Spend caps, alerts, rate limits](#14-spend-caps-alerts-rate-limits)
15. [Notifications & webhooks](#15-notifications--webhooks)
16. [BYOK (Bring Your Own Key)](#16-byok-bring-your-own-key)
17. [Error responses](#17-error-responses)
18. [SDKs](#18-sdks)
19. [Security & privacy](#19-security--privacy)
20. [Status & support](#20-status--support)

---

## 1. What you get

| Capability | What it is |
|---|---|
| **Chat / Messages gateway** | OpenAI- and Anthropic-compatible APIs over 50+ frontier and open-source models. Streaming, tool calling, JSON mode. One API key, one bill. |
| **Embeddings + Vectors** | Managed embedding endpoints + per-org pgvector collections with upsert / similarity-search APIs. |
| **Fine-Tuning** | LoRA training on managed GPUs. Submit a JSONL → trained adapter ships back to the catalog. Serve via copy-paste docker on your own GPU or one-click managed hosting. |
| **BYO Model Deploy** | Bring any docker image (or HuggingFace model id) and we provision a dedicated GPU endpoint. Routes through the same gateway as everything else. |
| **Batches** | OpenAI-compatible batch API for offline workloads. 50% discount vs sync calls. |
| **Per-org spend caps + alerts** | Hard-cap your monthly inference spend, get notified at 80% / 90% / 100% on whichever channels you've enabled. |
| **Caching** | Exact-match L1 cache (free) + opt-in semantic cache (vector-similarity matching of near-duplicate prompts). |
| **BYOK** | Bring your own provider keys so requests bill to your own account. |
| **Audit + observability** | Append-only audit log of every mutating action, usage page with daily spend / latency percentiles / per-key + per-model breakdowns / CSV export. |

---

## 2. Quickstart

**Goal:** make your first API call in under 5 minutes.

### Step 1 — Create an account + org

Sign up at the dashboard. A personal org is auto-created on first login.

### Step 2 — Mint an API key

Dashboard → **A.I. Labs → Build → API Keys → Create key**.

Pick a name (e.g. `my-laptop`), optionally set a monthly spend cap and rate
limit. **The plaintext key is shown exactly once** — copy it now, store it
in a password manager or secrets vault.

Format: `ahu_live_<32 url-safe random chars>` (256 bits of entropy).

### Step 3 — First call

```bash
export AHURA_API_KEY="ahu_live_..."

curl https://api.cs2hvh.com/v1/chat/completions \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

You should see a JSON response within a couple of seconds. The request will
also appear in the dashboard's Usage page within a few seconds — that's the
async usage event landing in Postgres.

### Step 4 — Use any SDK you already have

The gateway is OpenAI-compatible (and Anthropic-compatible at `/v1/messages`).
Drop-in for any existing SDK by changing one line:

```python
from openai import OpenAI
client = OpenAI(
    base_url="https://api.cs2hvh.com/v1",
    api_key=os.environ["AHURA_API_KEY"],
)
```

That's it. Continue reading for everything else.

---

## 3. Authentication & API keys

### Auth header

Every `/v1/*` request must include:

```
Authorization: Bearer ahu_live_xxxxxxxx...
```

Alternative header `x-api-key: ahu_live_...` is also accepted for SDKs that
default to it.

### Key properties (configurable per key)

| Field | Default | What it does |
|---|---|---|
| `name` | required | Human label, shown in dashboard |
| `allowed_models` | null (all) | Whitelist — request to a model not in the list returns 403 |
| `allowed_ip_cidrs` | null (any) | IP allowlist (CIDR notation) — source IP outside the list returns 401 |
| `expires_at` | null (never) | Absolute expiration timestamp |
| `monthly_budget_cents` | null | Informational budget — surfaces in usage page, does NOT block |
| `hard_cap_cents` | null | **Enforced** monthly ceiling — request after cap reached returns 402 |
| `rate_limit_rpm` | 600 (10 RPS) | Per-key requests-per-minute (token bucket, ~6s burst capacity) |
| `zdr_enabled` | false | Zero Data Retention — see §19 |
| `semantic_cache_enabled` | false | Per-key opt-in for semantic cache — see §13 |

### Key lifecycle

- **Create** — dashboard or `POST /api/inference/api-keys`. Plaintext shown once.
- **Rotate** — generate a new key, swap in your code, then revoke the old one.
  No zero-downtime rotation primitive (yet); rolling restarts are the pattern.
- **Revoke** — dashboard "Revoke" button or `DELETE /api/inference/api-keys/{id}`.
  Takes effect within ~5 minutes (KV cache TTL) or immediately on operator
  request.

### Key hashing at rest

We store **only the SHA-256 hash** of your key. The plaintext is never
written to disk. If you lose the key, mint a new one — we cannot recover it.

---

## 4. Models catalog

Currently 50+ models across 14 providers, including:

- OpenAI (gpt-4o, gpt-4o-mini, gpt-4.1, o1, o3)
- Anthropic (Claude 4.5 Sonnet, Claude 4.7 Opus)
- Google (Gemini 2.5 Pro, Gemini 2.5 Flash)
- Meta (Llama 4 Scout, Llama 4 Maverick)
- Mistral (Mistral Large, Codestral)
- DeepSeek, Qwen, Cohere, Perplexity, xAI, Together, Fireworks

### List from the API

```bash
curl https://api.cs2hvh.com/v1/models \
  -H "Authorization: Bearer $AHURA_API_KEY"
```

Returns OpenAI-format `{data: [{id, object, created, owned_by}, ...]}` plus
Ahura extensions (`capabilities`, `pricing.input_cents_per_mtok`,
`pricing.output_cents_per_mtok`).

### Browse in the dashboard

**A.I. Labs → Build → Models** — search by name / description, filter by
provider, capability (vision, tools, JSON mode, thinking, audio), or
featured-only.

### Model ids

Format: `<provider>/<model-name>` (e.g. `openai/gpt-4o`, `anthropic/claude-4-5-sonnet`).
Fine-tunes register as `ahura/<base>:ft-<short>` (e.g. `ahura/phi-4:ft-a1b2c3d4`).
BYO deploys register as `ahura/<name>:byo-<short>`.

### Pricing

We charge per-token, no markup over upstream provider rates. Off-peak
discounts (configurable per model) automatically apply when in window.
See your dashboard usage page for actual costs.

---

## 5. Chat Completions

**Endpoint:** `POST https://api.cs2hvh.com/v1/chat/completions`

Drop-in for OpenAI's Chat Completions API. Streaming, tool calling, JSON
mode, multi-modal content all supported.

### Minimal example

```bash
curl https://api.cs2hvh.com/v1/chat/completions \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are concise."},
      {"role": "user", "content": "What is the capital of France?"}
    ],
    "temperature": 0.2,
    "max_tokens": 50
  }'
```

### Streaming

Set `"stream": true` and consume the SSE response:

```python
from openai import OpenAI
client = OpenAI(base_url="https://api.cs2hvh.com/v1", api_key=AHURA_API_KEY)

stream = client.chat.completions.create(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Stream a poem"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### Tool calling (function calling)

Same shape as OpenAI:

```json
{
  "model": "openai/gpt-4o",
  "messages": [{"role": "user", "content": "What's the weather in Bangalore?"}],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "parameters": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }
  }],
  "tool_choice": "auto"
}
```

### JSON mode

```json
{
  "model": "openai/gpt-4o",
  "messages": [...],
  "response_format": {"type": "json_object"}
}
```

### Response headers we add

| Header | Meaning |
|---|---|
| `X-Ahura-Request-Id` | Correlate with audit log + usage row |
| `X-Ahura-Model` | The model that actually served the request (relevant for presets) |
| `X-Ahura-Billing` | `platform` (we billed) or `byok` (your upstream account billed) |
| `X-Ahura-Cache` | `hit` (L1), `semantic-hit`, `miss`, `bypass`, `streaming-skipped`, `non-deterministic` |
| `X-Ahura-Cache-Age` | Seconds since the cached response was generated (on hits) |
| `X-Ahura-Cache-Similarity` | Cosine similarity for semantic hits (e.g. `0.9742`) |
| `X-Ahura-RateLimit-Remaining` | Tokens left in your bucket |
| `X-Ahura-Guardrail` | `clean`, `flagged`, `blocked` |
| `Retry-After` | Seconds to wait when 429 or 503 |

---

## 6. Messages

**Endpoint:** `POST https://api.cs2hvh.com/v1/messages`

Drop-in for Anthropic's Messages API. Translates to the upstream model
internally — the response carries the native Anthropic shape so your
existing Anthropic SDK code Just Works.

### Minimal example

```python
from anthropic import Anthropic
client = Anthropic(
    base_url="https://api.cs2hvh.com/v1",
    api_key=AHURA_API_KEY,
)
msg = client.messages.create(
    model="anthropic/claude-4-5-sonnet",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hi"}],
)
print(msg.content[0].text)
```

The Messages route supports streaming (`stream: true`), system prompts
(`system: "..."`), and tool use (`tools: [...]`).

---

## 7. Embeddings

**Endpoint:** `POST https://api.cs2hvh.com/v1/embeddings`

OpenAI-compatible. Three embedding models in the catalog:

| Model | Dim | Pricing (per M tokens) |
|---|---|---|
| `openai/text-embedding-3-small` | 1536 | $0.02 |
| `openai/text-embedding-3-large` | 3072 | $0.13 |
| `openai/text-embedding-ada-002` | 1536 | $0.10 |

### Single input

```bash
curl https://api.cs2hvh.com/v1/embeddings \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "The quick brown fox"
  }'
```

### Batch input (faster, cheaper)

```json
{
  "model": "openai/text-embedding-3-small",
  "input": ["sentence 1", "sentence 2", "sentence 3"]
}
```

Returns `{data: [{embedding: [0.123, -0.456, ...], index: 0}, ...]}`.

---

## 8. Vector Store

Managed pgvector collections — per-org isolated, with upsert / similarity
search via REST. Most common use case: RAG.

### Create a collection (dashboard or API)

```bash
curl https://api.cs2hvh.com/v1/vector/collections \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "product-docs",
    "embedding_model_id": "openai/text-embedding-3-small",
    "metric": "cosine"
  }'
```

Available metrics: `cosine` (default), `l2`, `inner_product`.

### Upsert vectors

Send up to 100 rows per request. We auto-embed `content` if you don't
supply `embedding` — saves a round-trip.

```bash
curl https://api.cs2hvh.com/v1/vector/collections/{id}/upsert \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {"external_id": "doc-1", "content": "Returns policy: 30 days"},
      {"external_id": "doc-2", "content": "Shipping: 2-5 business days"}
    ]
  }'
```

### Query

```bash
curl https://api.cs2hvh.com/v1/vector/collections/{id}/query \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how long does shipping take",
    "top_k": 5,
    "min_similarity": 0.7
  }'
```

You can pass `embedding: [0.1, 0.2, ...]` instead of `query` to skip
auto-embedding.

### Browse rows in the dashboard

**A.I. Labs → Workloads → Vectors → click a collection.**
Inline test-query box, paginated rows table, per-row delete with confirm.

---

## 9. Fine-Tuning

LoRA training on managed GPUs (A40 → H100). Submit a JSONL dataset, watch
the job complete, get back a trained adapter you can serve via your own
GPU OR via our one-click managed hosting.

### Dataset format

JSONL, each line a chat completion turn:

```jsonl
{"messages": [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello!"}]}
{"messages": [{"role": "user", "content": "Bye"}, {"role": "assistant", "content": "Goodbye!"}]}
```

Cap: 200MB file size. Validation runs at submit time — bad rows surface
in the error banner before you spend GPU minutes.

### Submit a job (dashboard)

**A.I. Labs → Workloads → Fine-Tuning → New job.**

- Pick a base model from the supported list (Phi-4, Llama 3 / 4, Gemma 3, Qwen,
  Mistral). Five Meta + Google bases are HF-gated and require your HF token.
- Upload dataset (or paste a URL we can fetch).
- Pick GPU size — A40 (~$0.40/hr) for 8-14B bases, A100 80GB for 27-32B,
  H100 for larger MoE.
- Set hyperparameters or use defaults (LoRA r=8, alpha=16, learning_rate=2e-4,
  epochs=3).
- Cost preview shown before submit.

### Job lifecycle

`queued` → `preparing` → `running` → (`completed` | `failed`)

Live progress (current step / epoch / loss) streams to the dashboard from
the training pod. An automatic eval gate compares final_loss against
baseline; jobs that diverge fail the gate instead of registering a bad
adapter.

### Serving a trained adapter

Two paths, your choice per job:

**A. Self-serve docker (free, you own the GPU)**

After completion, the dashboard "Copy serve command" button generates a
6-hour signed URL for `adapter.tar.gz` and a paste-ready docker command:

```bash
docker run --gpus all -p 8000:8000 \
  -e BASE_MODEL="phi-4" \
  -e ADAPTER_DOWNLOAD_URL="https://...presigned..." \
  ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3
```

The image downloads the adapter at boot, launches vLLM with `--enable-lora`
on port 8000, OpenAI-compatible. No credentials leave AhuraCloud; the URL
expires after 6 hours.

**B. Managed hosted serving (pay-per-hour)**

Click "Start hosted serving" → pick a GPU SKU → we provision a dedicated
instance. You'll be billed per hour while it's running. Auto-stops after
6 hours of zero requests (configurable). One pod per fine-tune.

After provisioning (45-90s cold start), call your model through the same
gateway:

```bash
curl https://api.cs2hvh.com/v1/chat/completions \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -d '{
    "model": "ahura/phi-4:ft-a1b2c3d4",
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

During cold-start, requests return `503 + Retry-After: 10`. SDK auto-retry
handles it transparently.

---

## 10. BYO Model Deploy

Deploy any docker container or HuggingFace model as a dedicated endpoint.
Routes through the same gateway as everything else — your customers call
`ahura/<your-name>:byo-<id>` and never know it's bespoke.

### Source types

| Source | Status |
|---|---|
| `docker` | ✅ — any public image (e.g. `ghcr.io/your-org/your-vllm:latest`) |
| `huggingface` | ✅ — pass an HF model id (e.g. `meta-llama/Llama-3.3-8B-Instruct`); we use a pre-built vLLM worker that downloads at boot |
| `truss` | 🛠 deferred — build locally with `truss build`, push to a registry, deploy as `docker` |

### Create a deployment (dashboard)

**A.I. Labs → Workloads → Deployments → Create deployment.**

Fields:
- Name (used in the model id)
- Source (docker / huggingface)
- Source ref (image URI or HF model id)
- Revision / tag (optional)
- HF token (only for huggingface source; encrypted at rest with AES-256-GCM)
- GPU size
- Min / max workers (autoscale)
- Idle timeout (when to scale to zero)

Creation is async — the row enters `building`, then `deploying`, then
`active`. Total time depends on image size and HF model weights download
(can be 5-30 min for the first HF deploy of a large model).

### Calling a BYO model

Same as any other model in the gateway:

```bash
curl https://api.cs2hvh.com/v1/chat/completions \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -d '{
    "model": "ahura/my-llama:byo-a1b2c3d4",
    "messages": [...]
  }'
```

---

## 11. Batches

OpenAI-compatible batch API for offline workloads. Save 50% vs sync calls.

### Workflow

1. Upload a JSONL file of requests
2. Create a batch referencing the file id
3. Poll status; results land in an output file when complete
4. Download the output file

### Example

```bash
# 1. Upload
curl https://api.cs2hvh.com/v1/files \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -F purpose=batch \
  -F file=@requests.jsonl
# → returns {"id": "file_abc", ...}

# 2. Create batch
curl https://api.cs2hvh.com/v1/batches \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input_file_id": "file_abc",
    "endpoint": "/v1/chat/completions",
    "completion_window": "24h"
  }'
# → returns {"id": "batch_xyz", "status": "validating", ...}

# 3. Poll
curl https://api.cs2hvh.com/v1/batches/batch_xyz \
  -H "Authorization: Bearer $AHURA_API_KEY"
# → status: "validating" | "in_progress" | "finalizing" | "completed" | "failed"

# 4. Download output
curl https://api.cs2hvh.com/v1/files/{output_file_id}/content \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  > results.jsonl
```

### Input JSONL format

Each line is a full request object:

```jsonl
{"custom_id": "req-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "Hi"}]}}
{"custom_id": "req-2", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "Bye"}]}}
```

### Output JSONL format

```jsonl
{"id": "batch_req_1", "custom_id": "req-1", "response": {"status_code": 200, "body": {...}}}
{"id": "batch_req_2", "custom_id": "req-2", "response": {"status_code": 200, "body": {...}}}
```

---

## 12. Routing Presets

A preset is a named bundle of routing preferences (provider order, fallback
chain, price ceiling). Apply per-request via the `X-Ahura-Preset` header.

### Create a preset (dashboard)

**A.I. Labs → Build → Presets → Create preset.**

Pick a name, add a fallback chain (e.g. `openai/gpt-4o` → `anthropic/claude-4-5-sonnet`
→ `google/gemini-2.5-pro`), set provider preferences (sort by price, latency,
or throughput; allow only specific providers).

### Use a preset

```bash
curl https://api.cs2hvh.com/v1/chat/completions \
  -H "Authorization: Bearer $AHURA_API_KEY" \
  -H "X-Ahura-Preset: production-cheap-first" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}]}'
```

The body's `model` field becomes optional when a preset is in play — the
preset's first model is used. The response `X-Ahura-Model` header tells
you which model actually served.

---

## 13. Caching

### L1 cache (exact match) — free, automatic

The gateway hashes your normalized request (org-scoped) and replays the
cached response on exact-match repeats. Default TTL 5 min, configurable
per request:

```
X-Ahura-Cache-TTL: 60      # seconds; 60-3600
X-Ahura-Cache: aggressive  # cache non-deterministic requests too
X-Ahura-Cache: off         # bypass entirely
Cache-Control: no-cache    # also bypass (standard semantics)
```

Hits return `X-Ahura-Cache: hit` + `X-Ahura-Cache-Age: <seconds>`.

Streaming requests, requests with tools, and non-deterministic temperatures
are skipped by default. Use `X-Ahura-Cache: aggressive` to override.

### Semantic cache (vector similarity) — opt-in per key

Embeds your prompt and matches against any cached response within cosine
similarity threshold (default 0.95) in the same `(org, model, temperature
bucket)` scope, < 1 hour old.

**Enable:** flip "Semantic cache" on when creating or editing an API key.
**Tune:** org-level threshold slider on **A.I. Labs → Manage → Settings**.

Hits return `X-Ahura-Cache: semantic-hit` + `X-Ahura-Cache-Similarity: 0.9742`
and bill at the cached_input rate (substantially cheaper).

Hard guarantees:
- **ZDR keys never read or write the cache** (privacy)
- Stored values: embedding + response only — original prompt text is NEVER
  persisted
- Streaming, tool-call, and non-deterministic requests skip
- Different temperatures get different cache buckets so deterministic
  hits can't bleed into creative caller's responses

Hit rate visible in **A.I. Labs → Manage → Usage** with per-key breakdown.

---

## 14. Spend caps, alerts, rate limits

### Per-API-key

Set on key creation or edit:
- `monthly_budget_cents` — informational, surfaces as overage indicator
- `hard_cap_cents` — enforced; request after cap reached returns
  `402 hard_cap_reached`
- `rate_limit_rpm` — token bucket, 6-second burst capacity. Returns 429
  with `Retry-After` when exceeded.

### Per-org (whichever is more restrictive wins)

Dashboard **A.I. Labs → Manage → Settings → Spend caps**. Same two fields
at org level. The gateway enforces `min(org_cap, key_cap)` per request.
The error response names which cap was hit (`org_hard_cap_reached` or
`hard_cap_reached`).

Inline live-spend banner shows current month-to-date next to the inputs,
so a customer setting `$500` can immediately see whether they're at $5
or $480 today.

### Spend alerts (always on)

When monthly spend crosses these thresholds, you get a notification on
whichever channels you have enabled:

| Threshold | Severity |
|---|---|
| 80% of `monthly_budget_cents` | informational |
| 100% of `monthly_budget_cents` | informational (budget is advisory) |
| 90% of `hard_cap_cents` | warning |
| 100% of `hard_cap_cents` | critical (traffic now 402s) |

Alerts bypass the events_subscribed filter — these are operational, so
you can't accidentally mute them. You CAN still turn off any channel
(in-app / email / webhook).

---

## 15. Notifications & webhooks

Three channels, configurable per-org. **A.I. Labs → Manage → Notifications.**

| Channel | What |
|---|---|
| **In-app bell** | Shows in the dashboard. On by default. |
| **Email** | Up to 5 recipients. Templated, no per-recipient customization. |
| **Outbound webhook** | HMAC-SHA256 signed POST to your URL. https only. Body cap 16KB. |

### Events

- `finetune.succeeded`
- `finetune.failed`
- `batch.completed`
- `batch.failed`
- `serving_pod.ready`
- `serving_pod.stopped`
- `org.spend_threshold_reached` (always on; see §14)

### Webhook signature verification

We sign every outbound delivery:

```
X-Ahura-Signature: sha256=<hex>
```

The signed payload is the entire request body. Verify in your receiver:

```python
import hmac, hashlib

def verify(secret: str, body: bytes, header: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", header)
```

### Test your webhook

Click "Send test" on the Notifications page. Fires a synthetic
`finetune.succeeded` payload at every enabled channel (bypasses the
events_subscribed filter so the test works regardless of subscriptions).

### Delivery audit log

Every outbound webhook attempt persists to a per-org log readable from the
dashboard. Fields: event, payload preview, HTTP status, response excerpt,
retry count, delivered_at.

---

## 16. BYOK (Bring Your Own Key)

Use your own provider key (e.g. your OpenAI or OpenRouter key) so requests
bill to your account instead of ours.

### Add a key

**A.I. Labs → Build → BYOK Keys → Add key.**

Pick the provider (OpenRouter is the most common — covers every model in
the catalog). Paste the key. Encrypted at rest with AES-256-GCM (single
DEK shared by all platform processes).

### Use it on a request

```
X-Ahura-Billing: byok
X-Ahura-BYOK-Provider: openrouter
```

The gateway decrypts your stored key at the edge, swaps it into the
upstream call. Response `X-Ahura-Billing: byok` confirms the path.

### What's stored

- Encrypted ciphertext of your key
- Provider name + key alias for the dashboard
- `kms_key_version` for future DEK rotation

We never log the plaintext anywhere.

---

## 17. Error responses

Standard OpenAI-shape error envelope. Always JSON.

```json
{
  "error": {
    "message": "Human-readable",
    "type": "...",
    "code": "...",
    "request_id": "..."
  }
}
```

### Common codes

| HTTP | Code | What |
|---|---|---|
| 400 | `invalid_request` | Body validation failed |
| 400 | `model_required` | Missing `model` and no preset that defines one |
| 400 | `guardrail_blocked` | Prompt-injection guardrail (when `X-Ahura-Guardrail: block`) |
| 400 | `byok_unavailable` | BYOK requested but no decryptable key for that provider |
| 401 | `invalid_api_key` | Missing / malformed / revoked / expired key, or source IP not on allowlist |
| 402 | `hard_cap_reached` | This key's monthly hard cap is hit |
| 402 | `org_hard_cap_reached` | The org-level cap is hit (raise on Settings page) |
| 403 | `model_not_allowed` | This key's `allowed_models` doesn't include the requested model |
| 429 | `rate_limit_exceeded` | Per-key RPM exceeded. Honor `Retry-After`. |
| 503 | `instance_warming_up` | Managed serving cold-start. Honor `Retry-After: 10`. SDK auto-retry usually handles it. |
| 503 | `model_unavailable` | Model marked inactive in our catalog (rare). |

All error responses include `X-Ahura-Request-Id` so you can correlate
with the audit log when filing a support ticket.

---

## 18. SDKs

We're OpenAI- AND Anthropic-compatible, so any SDK that supports a custom
`base_url` works as-is.

### Python — OpenAI SDK

```python
from openai import OpenAI
client = OpenAI(
    base_url="https://api.cs2hvh.com/v1",
    api_key="ahu_live_...",
)
```

### Python — Anthropic SDK

```python
from anthropic import Anthropic
client = Anthropic(
    base_url="https://api.cs2hvh.com/v1",
    api_key="ahu_live_...",
)
```

### TypeScript — OpenAI SDK

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.cs2hvh.com/v1",
  apiKey: process.env.AHURA_API_KEY,
});
```

### Bash — raw curl

See examples throughout this guide.

### LangChain / LlamaIndex / instructor / etc.

Any framework that wraps OpenAI's SDK works. Pass our base URL + key into
the underlying client constructor.

---

## 19. Security & privacy

Full detail in [security.md](./security.md). Highlights:

- **TLS 1.3** in transit, HSTS preload, security headers across the board
- **AES-256-GCM** at rest for BYOK keys + HF tokens, single shared DEK
  rotatable per-row via `kms_key_version`
- **SHA-256** hash of API keys at rest; plaintext shown to user exactly
  once at creation
- **Row-level security** on every table holding customer data, scoped per
  org via `is_org_member()` / `is_org_admin()` predicates
- **ZDR mode** per API key — prompts and responses never logged anywhere
  (caches skip entirely, only billing metadata recorded)
- **No model training on customer data, ever**
- **Append-only audit log** of every mutating action, partitioned monthly
- **HMAC-SHA256** signed outbound webhooks
- **Per-org isolation** — no cross-tenant data path possible

### Compliance posture

We are **not yet SOC 2 certified** — audit in progress. We're not
HIPAA-eligible, no BAA available. Full transparent gap list in
[security.md §15](./security.md). For procurement reviews, the
subprocessor list is in [security.md §11](./security.md).

---

## 20. Status & support

### Operational status

- **Customer view:** `https://wao.cs2hvh.com/dashboard/services/inference/diagnostics`
  shows a 4-subsystem vendor-neutral health summary
  (Control plane / Object storage / Real-time state / Inference gateway)
- **Public status page:** roadmapped (will live at `status.ahurasense.com`)

### Support channels

| Channel | Use for |
|---|---|
| Email `support@ahurasense.ai` | All product questions, bugs, account |
| Email `security@ahurasense.ai` | Security reports, pen-test coordination, DPA / BAA requests |
| Dashboard "Send test" | Verify your notification webhook before relying on it |

### When you file a ticket

Include the `X-Ahura-Request-Id` from the response header(s) — lets us
pull the exact row(s) from the audit + usage logs.

### Rate-limited or hitting caps?

- 429 → wait `Retry-After` seconds, then retry. SDK auto-retry usually
  handles it. If you need a higher rate-limit cap, contact support.
- 402 → raise the per-key cap (your dashboard) or the org cap (org
  settings). Hard caps reset at the start of each calendar month UTC.

---

**End of guide.** Last updated 2026-05-27.

For the operator-facing build state (what's deployed, pending migrations,
known issues): [STATUS.md](./STATUS.md).
For architecture details: [architecture.md](./architecture.md).
For the deeper security posture: [security.md](./security.md).
