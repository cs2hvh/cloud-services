# AhuraCloud A.I. Labs — API Reference

Formal endpoint specs for every public-facing API. For conceptual context
and walk-through examples see [user-guide.md](./user-guide.md).

**Base URL:** `https://api.cs2hvh.com/v1` (temporary; final URL will be
`https://api.ahurasense.com/v1`).

**Authentication:** Every request requires `Authorization: Bearer ahu_live_...`.

---

## Conventions

### Request headers

| Header | When | Effect |
|---|---|---|
| `Authorization: Bearer <key>` | always required | Authenticates the request |
| `x-api-key: <key>` | alternative to `Authorization` | Same effect |
| `Content-Type: application/json` | POST | Required when body is JSON |
| `X-Ahura-Request-Id: <uuid>` | optional | Echoed back; we use yours if you set it, otherwise we generate |
| `X-Ahura-Billing: platform\|byok` | optional | `byok` routes the upstream call to a stored provider key |
| `X-Ahura-BYOK-Provider: openrouter\|openai\|anthropic\|google\|mistral` | when `X-Ahura-Billing: byok` | Which stored provider key to use |
| `X-Ahura-Preset: <name>` | optional | Apply a routing preset |
| `X-Ahura-Guardrail: off\|warn\|block` | optional | Prompt-injection policy (default `warn`) |
| `X-Ahura-Cache: off\|aggressive` | optional | Bypass / aggressive cache |
| `X-Ahura-Cache-TTL: <seconds>` | optional | Override L1 TTL (60-3600) |
| `Cache-Control: no-cache` | optional | Bypass cache |

### Response headers

| Header | Meaning |
|---|---|
| `X-Ahura-Request-Id` | Correlation id (matches one in your logs) |
| `X-Ahura-Model` | Model that actually served (relevant for presets) |
| `X-Ahura-Billing` | `platform` or `byok` |
| `X-Ahura-Cache` | `hit` / `semantic-hit` / `miss` / `bypass` / `streaming-skipped` / `non-deterministic` |
| `X-Ahura-Cache-Age` | Seconds since cached response was generated |
| `X-Ahura-Cache-Similarity` | Cosine similarity for semantic hits |
| `X-Ahura-RateLimit-Remaining` | Tokens left in your bucket |
| `X-Ahura-Guardrail` | `clean` / `flagged` / `blocked` |
| `Retry-After` | Seconds (sent on 429 / 503) |

### Error envelope

```json
{
  "error": {
    "message": "string",
    "type": "string",
    "code": "string",
    "request_id": "string"
  }
}
```

See [user-guide.md §17](./user-guide.md#17-error-responses) for the full
code list.

---

## Health

### `GET /v1/health`

Unauthenticated liveness probe.

**Response 200:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "env": "production",
  "timestamp": "2026-05-27T14:00:00.000Z"
}
```

---

## API Key Introspection

### `GET /v1/key`

Return metadata about the authenticated key (no plaintext, hash + scope).

**Response 200:**
```json
{
  "key_id": "uuid",
  "org_id": "uuid",
  "allowed_models": ["openai/gpt-4o", "..."],
  "zdr_enabled": false,
  "semantic_cache_enabled": false,
  "hard_cap_cents": 100000,
  "rate_limit_rpm": 600
}
```

---

## Models

### `GET /v1/models`

List models the calling key is authorized to use.

**Query params:** none.

**Response 200:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "openai/gpt-4o-mini",
      "object": "model",
      "created": 1737936000,
      "owned_by": "openai",
      "ahura": {
        "modality": "chat",
        "capabilities": {
          "streaming": true,
          "tools": true,
          "json_mode": true,
          "vision": true,
          "context_window": 128000
        },
        "pricing": {
          "input_cents_per_mtok": 15,
          "output_cents_per_mtok": 60
        },
        "off_peak": null
      }
    }
  ]
}
```

The top-level `id`, `object`, `created`, `owned_by` match OpenAI's shape
exactly so SDK introspection works unmodified. The `ahura` extension
namespace carries everything OpenAI's `/v1/models` doesn't expose.

---

## Chat Completions

### `POST /v1/chat/completions`

OpenAI-compatible.

**Body:**
```ts
{
  model: string,                          // required (or use preset)
  messages: Message[],                    // required, min 1
  stream?: boolean,                       // default false
  temperature?: number,                   // 0..2, default 1
  top_p?: number,                         // 0..1
  max_tokens?: number,                    // positive integer
  n?: number,                             // 1..8 (samples)
  stop?: string | string[],
  presence_penalty?: number,              // -2..2
  frequency_penalty?: number,             // -2..2
  tools?: Tool[],
  tool_choice?: "auto" | "none" | { type: "function", function: { name } },
  response_format?: { type: "json_object" | "text" },
  seed?: number,
  user?: string                           // your end-user identifier
}
```

`Message`:
```ts
{
  role: "system" | "user" | "assistant" | "tool" | "developer",
  content: string | ContentPart[] | null,
  name?: string,
  tool_call_id?: string,                  // for role: "tool"
  tool_calls?: ToolCall[]                 // for role: "assistant"
}
```

**Response 200 (non-streaming):** standard OpenAI `chat.completion` shape.
**Response (streaming):** SSE chunks of `chat.completion.chunk` shape.

**Headers our gateway adds to every response:** see [Response headers](#response-headers).

---

## Messages (Anthropic-compatible)

### `POST /v1/messages`

Anthropic Messages API drop-in.

**Body:**
```ts
{
  model: string,                          // required
  messages: AnthropicMessage[],           // required, min 1
  max_tokens: number,                     // required
  system?: string | ContentBlock[],       // separate from messages, Anthropic-style
  stream?: boolean,
  temperature?: number,                   // 0..1
  top_p?: number,
  top_k?: number,
  stop_sequences?: string[],
  tools?: Tool[],
  tool_choice?: AnthropicToolChoice,
  metadata?: { user_id?: string }
}
```

`AnthropicMessage`:
```ts
{
  role: "user" | "assistant",
  content: string | AnthropicContentBlock[]
}
```

`AnthropicContentBlock` (subset):
- `{ type: "text", text: string }`
- `{ type: "image", source: { type: "base64", media_type, data } }`
- `{ type: "tool_use", ... }`
- `{ type: "tool_result", ... }`

**Response 200 (non-streaming):** native Anthropic `message` shape (we
translate the upstream response so your Anthropic SDK works unmodified).
**Response (streaming):** Anthropic-style SSE events
(`message_start`, `content_block_delta`, etc.).

---

## Embeddings

### `POST /v1/embeddings`

OpenAI-compatible.

**Body:**
```ts
{
  model: string,                          // required (e.g. openai/text-embedding-3-small)
  input: string | string[],               // required
  encoding_format?: "float" | "base64",   // default "float"
  user?: string
}
```

**Response 200:**
```json
{
  "object": "list",
  "model": "openai/text-embedding-3-small",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.123, ...] }
  ],
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

---

## Vector Store

### `POST /v1/vector/collections`

Create a new collection.

**Body:**
```ts
{
  name: string,                                  // unique per org
  embedding_model_id: string,                    // must be in catalog
  metric?: "cosine" | "l2" | "inner_product"     // default "cosine"
}
```

**Response 200:**
```json
{ "id": "uuid", "name": "product-docs", "embedding_model_id": "...", "metric": "cosine", "created_at": "..." }
```

### `GET /v1/vector/collections`

List the calling org's collections. Returns `{ data: [...] }`.

### `POST /v1/vector/collections/{id}/upsert`

Upsert up to 100 rows.

**Body:**
```ts
{
  rows: Array<{
    external_id?: string,                 // your own id; used for upsert dedup
    content?: string,                     // we auto-embed if provided
    embedding?: number[],                 // OR pass a pre-computed vector
    metadata?: Record<string, unknown>    // arbitrary JSON
  }>
}
```

Either `content` or `embedding` is required per row.

**Response 200:**
```json
{ "upserted": 100 }
```

### `POST /v1/vector/collections/{id}/query`

**Body:**
```ts
{
  query?: string,                         // we auto-embed if provided
  embedding?: number[],                   // OR pass a pre-computed vector
  top_k?: number,                         // default 10
  min_similarity?: number,                // 0..1
  filter?: Record<string, unknown>        // exact-match metadata filter
}
```

**Response 200:**
```json
{
  "data": [
    {
      "external_id": "doc-1",
      "similarity": 0.92,
      "content": "...",
      "metadata": {...}
    }
  ]
}
```

### `DELETE /v1/vector/collections/{id}`

Cascade-deletes all rows in the collection. Returns 204.

---

## Files (used by Batches)

### `POST /v1/files`

Upload a file. `multipart/form-data`:
- `purpose` — currently only `batch`
- `file` — the JSONL payload

**Response 200:**
```json
{ "id": "file_abc", "object": "file", "bytes": 12345, "filename": "...", "purpose": "batch", "created_at": ... }
```

### `GET /v1/files/{id}`

Metadata about a file.

### `GET /v1/files/{id}/content`

Download the file. Default `Content-Type: application/octet-stream`.
Pass `Accept: application/json` to receive a presigned URL instead.

### `DELETE /v1/files/{id}`

Delete the file (and any batch rows that reference it). Returns 204.

---

## Batches

### `POST /v1/batches`

**Body:**
```ts
{
  input_file_id: string,                  // required (previously uploaded)
  endpoint: "/v1/chat/completions" | "/v1/embeddings" | "/v1/messages",
  completion_window?: "24h",              // currently only 24h
  metadata?: Record<string, string>
}
```

**Response 200:**
```json
{
  "id": "batch_xyz",
  "object": "batch",
  "endpoint": "/v1/chat/completions",
  "input_file_id": "file_abc",
  "completion_window": "24h",
  "status": "validating",
  "created_at": ...
}
```

### `GET /v1/batches/{id}`

Get status + result file ids.

**Response 200:**
```json
{
  "id": "batch_xyz",
  "object": "batch",
  "status": "completed",
  "input_file_id": "file_abc",
  "output_file_id": "file_def",
  "error_file_id": null,
  "counts": { "total": 1000, "completed": 998, "failed": 2 },
  "created_at": ...,
  "completed_at": ...,
  "expires_at": ...
}
```

Status: `validating` → `in_progress` → `finalizing` → `completed` |
`failed` | `expired` | `cancelled`.

### `GET /v1/batches`

List the calling org's batches.

### `POST /v1/batches/{id}/cancel`

Cancel an in-progress batch. Returns the batch row with updated status.

### `DELETE /v1/batches/{id}`

Hard-delete a batch + its files. Returns 204.

---

## Fine-Tuning

### `POST /v1/fine-tuning/jobs`

Submit a new FT job. Currently dashboard-only — public API stabilizes
post-GA.

### `GET /v1/fine-tuning/jobs`

List the calling org's jobs.

### `GET /v1/fine-tuning/jobs/{id}`

One job + live progress (current step, epoch, loss).

---

## BYO Model Deploy

### `POST /v1/deployments`

**Body:**
```ts
{
  name: string,                                                  // ^[a-z0-9][a-z0-9_-]*$
  source: "docker" | "huggingface",                              // truss deferred
  source_ref: string,                                            // image URI or HF model id
  source_revision?: string,                                      // git sha or image tag
  hf_token?: string,                                             // only when source = huggingface
  gpu_sku: "A100-80GB" | "A100-40GB" | "H100-80GB" | "L40S" | "A40" | "RTX-6000-Ada",
  autoscale?: {
    min_workers?: number,                                        // 0..50, default 0
    max_workers?: number,                                        // 1..50, default 4
    idle_timeout_s?: number                                      // 5..3600, default 60
  }
}
```

**Response 200:**
```json
{ "id": "uuid", "name": "...", "status": "building", "created_at": ... }
```

### `GET /v1/deployments` / `GET /v1/deployments/{id}` / `DELETE /v1/deployments/{id}`

Standard list / get / delete. Delete tears down the upstream endpoint
+ flips the model row inactive.

### `POST /v1/deployments/{id}/scale`

Update autoscale params on a live endpoint.

---

## Usage

### `GET /v1/usage/summary?days={1..90}`

**Response 200:**
```json
{
  "org": { "id": "...", "slug": "...", "name": "..." },
  "summary": {
    "month": "2026-05",
    "month_spent_cents": 4210,
    "month_requests": 12847,
    "window_days": 7,
    "window_requests": 8234,
    "window_spent_cents": 2810,
    "success_count": 8210,
    "error_count": 24,
    "input_tokens": 1234567,
    "output_tokens": 234567,
    "latency_ms_p50": 412,
    "latency_ms_p95": 1820,
    "latency_ms_p99": 3210,
    "cache_l1_hits": 1200,
    "cache_semantic_hits": 84,
    "cache_hit_rate": 0.156
  },
  "day_series": [{ "day": "2026-05-21", "spent_cents": 0, "requests": 0 }, ...],
  "top_models": [{ "model_id": "...", "spent_cents": 1234, "requests": 800 }, ...],
  "top_api_keys": [{
    "id": "uuid",
    "name": "production-server",
    "preview": "ahu_live_Z9JI4••••QQEf",
    "spent_cents": 2000,
    "requests": 6000,
    "cache_l1_hits": 800,
    "cache_semantic_hits": 60,
    "cache_hit_rate": 0.143
  }, ...],
  "recent": [{
    "created_at": "...",
    "model_id": "openai/gpt-4o-mini",
    "modality": "chat",
    "input_tokens": 100,
    "output_tokens": 60,
    "cost_cents": 1,
    "latency_ms": 400,
    "status": "success",
    "billed_to": "platform",
    "cache_kind": "none"
  }, ...]
}
```

### `GET /v1/usage/export?days={1..90}&api_key_id={uuid}`

CSV download. 100k row cap; `X-Truncated: true` header signals overflow.

Columns: `created_at, request_id, api_key_id, api_key_name, api_key_preview,
model_id, modality, input_tokens, output_tokens, cached_tokens, cost_cents,
cost_usd, upstream_cost_cents, is_off_peak, latency_ms, ttft_ms, status,
error_code, billed_to, cache_kind`.

---

## Notifications

### `GET /v1/notifications`

Fetch the org's notification settings.

### `PUT /v1/notifications` (owner / admin only)

Replace settings.

**Body:**
```ts
{
  events_subscribed: NotificationEvent[],
  email_recipients: string[],                  // max 5
  in_app_enabled: boolean,
  webhook_enabled: boolean,
  webhook_url?: string,                        // https only
  webhook_secret?: string                      // 16..200 chars; omit to keep existing
}
```

### `POST /v1/notifications/test`

Fire a synthetic `finetune.succeeded` event at all configured channels.
Bypasses the `events_subscribed` filter so the test works regardless of
subscriptions.

**Response 200:**
```json
{
  "success": true,
  "channels": { "in_app": true, "email": true, "webhook": false }
}
```

---

## Outbound webhook payload

Every outbound webhook POST carries the same envelope:

**Headers:**
```
Content-Type: application/json
X-Ahura-Signature: sha256=<hex>
User-Agent: ahura-inference-webhook/1.0
```

**Body:**
```json
{
  "event": "finetune.succeeded",
  "occurred_at": "2026-05-27T14:00:00.000Z",
  "org_id": "uuid",
  "resource_id": "uuid",
  "title": "Fine-tune \"my-job\" succeeded",
  "summary": "Trained on microsoft/phi-4 in 7 min. Cost $0.10.",
  "details": {
    "Job": "my-job",
    "Base model": "microsoft/phi-4",
    "Runtime": "7 min",
    "Cost": "$0.10"
  },
  "error": null
}
```

Verify HMAC as in [user-guide.md §15](./user-guide.md#15-notifications--webhooks).

---

## Internal endpoints (operator-only, token-auth)

These exist for our own infra and aren't part of the public surface, but
are documented here for operator-side debugging.

| Endpoint | Auth | Trigger |
|---|---|---|
| `POST /api/inference/internal/serving-pod-watchdog` | `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` | CF cron, every minute |
| `POST /api/inference/internal/spend-alert` | same | CF Worker usage consumer on threshold crossings |

---

## Rate limits

| Surface | Default |
|---|---|
| Gateway `/v1/*` | per API key `rate_limit_rpm` (default 600 RPM = 10 RPS); 6-second burst capacity |
| Control plane `/api/inference/*` | per user (auth.user.id) — varies per route, 5-60 / min |
| Usage CSV export | 6 / min (heavy endpoint) |

429 responses always carry `Retry-After` in seconds.

---

**End of reference.** Conceptual walk-through in [user-guide.md](./user-guide.md).
