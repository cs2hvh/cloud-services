# Multimodal Model APIs — Cluster Design

## 1. Services & customer value

This cluster expands AhuraCloud beyond text-only LLM/embeddings into the full multimodal aggregator surface. Every service is OpenAI-compatible where a standard exists, brand-hidden upstream where we proxy, and slots into the same `inference.models` catalog + `UsageEvent` metering already proven for chat/embeddings.

| Service | Customer buys | Endpoint | Competitor reference |
|---|---|---|---|
| **Image generation** | Text→image, image editing/inpainting, variations | `/v1/images/generations`, `/v1/images/edits` | OpenAI Images, Together, Fal, Replicate |
| **Image OCR / Document AI** | Layout-aware text + structured field extraction from PDFs/scans | `/v1/ocr` (own verb) | Mistral OCR, AWS Textract, Reducto |
| **Text-to-speech (TTS)** | Text→audio, voice selection, streaming chunks | `/v1/audio/speech` | OpenAI TTS, ElevenLabs, Cartesia, Deepgram Aura |
| **Speech-to-text (STT)** | Audio→transcript, word timestamps, diarization, translation | `/v1/audio/transcriptions`, `/v1/audio/translations` | OpenAI Whisper API, Deepgram, AssemblyAI |
| **Realtime speech-to-speech** | Bidirectional low-latency voice agent over WebSocket | `/v1/realtime` (WS) | OpenAI Realtime, Ultravox, Pipecat-cloud |
| **Video generation** | Text/image→short video clips, async job model | `/v1/videos` (own verb, async) | Runway, Luma, Kling, Replicate |
| **Music generation** | Prompt→instrumental/song, async | `/v1/audio/music` (own verb, async) | Suno, Udio, Stability Audio |
| **Reranking** | Query + documents → relevance-scored ordering | `/v1/rerank` | Cohere Rerank, Jina, Voyage, Mixedbread |
| **Content moderation** | Text/image → harm-category scores | `/v1/moderations` | OpenAI Moderation, Mistral, Llama Guard |

The product positioning matches `architecture.md`'s stated value-add: **bundling + UX + integrated suite**, not per-unit cost. A customer gets image gen, voice, OCR, rerank and moderation through one API key, one balance, one usage dashboard, one budget/hard-cap, one ZDR toggle — instead of six vendor accounts. Reranking + moderation specifically complete the retrieval/safety stack we half-own already (embeddings + pgvector vector store + the prompt-injection `guardrail.ts` in the chat route).

Two response-shape families exist and the design treats them differently throughout:
- **Synchronous** (image gen, TTS, STT, rerank, moderation, OCR): request → response in one HTTP call, billed per-unit on completion via the existing `USAGE_EVENTS` queue path.
- **Asynchronous / long-running** (video, music, large batch transcription): request returns a job id; customer polls `/v1/videos/{id}` or receives a webhook. These need a k8s runner + R2 asset storage, mirroring the `ft-runner` claim/queue pattern exactly.

## 2. Build vs proxy

Default stance from `architecture.md`: proxy unless economics or capability force self-host. For a brand-new cluster, **proxy almost everything to ship fast**, then selectively repatriate high-volume modalities onto the Yotta B300/H200 fleet once it lands (the per-unit margin story that justifies the DPR).

| Service | v1 decision | Upstream candidate(s) (never customer-visible) | Justification |
|---|---|---|---|
| **Image generation** | **Proxy** | Aggregator already in use for chat (Flux/SDXL/Imagen routed through it), or Fal/Replicate as image-specialist fallback | Same gateway/billing path as chat; per-image pricing is trivial; zero GPU burden. Highest-volume revenue modality so first repatriation candidate on own fleet. |
| **OCR / Document AI** | **Proxy** | OCR-specialist API + the open Mistral/Qwen-VL OCR weights via aggregator | Layout models are heavy; not worth self-hosting at unknown volume. |
| **TTS** | **Proxy** | Voice-specialist upstream (Cartesia/Deepgram/ElevenLabs-class) via brand-hidden key | Voice quality is the product; specialists beat anything we'd self-host. Streaming chunk passthrough fits Worker `streamPassthrough`. |
| **STT** | **Proxy v1 → self-host candidate** | Whisper-class via aggregator now | Whisper-large is small enough to self-host on the fleet later for margin; proxy de-risks v1. |
| **Realtime S2S** | **Proxy, gated** | Realtime-capable upstream that supports server-to-server WS relay | Per gap #15 this is a *differentiator not table-stakes*. Build only once a stable brand-hideable WS upstream exists; otherwise stub `/v1/realtime` to 501 like images were. **New deployable required** (see §3). |
| **Video generation** | **Proxy** | Video-specialist async API | Capital-intensive to self-host; async job model maps to k8s runner. |
| **Music generation** | **Proxy** | Music-specialist async API | Niche; thin async proxy. |
| **Reranking** | **Self-host on RunPod now** | — (own substrate) | Rerankers are tiny (bge-reranker-v2-m3 ~560M, mxbai-rerank). Perfect fit for the existing `deploy-runner` → RunPod Serverless substrate (gap #3 explicitly says so). Real margin, no upstream dependency, and completes the retrieval stack we own. |
| **Moderation** | **Self-host on RunPod now** | — (own substrate) | Llama-Guard / small classifier, same substrate as rerank. Doubles as self-protection for the public Agents `/api/v1/agents/{id}/chat` endpoint (gap #4). Cheap to run, sensitive to send off-platform, fast. |

The hard constraint is enforced exactly as today: `upstream_provider` and `upstream_model_id` live in `inference.models` (server-side only, like the existing `'openrouter'` rows), errors are sanitized through `customerSafeErrorMessage()` / `lib/inference/error-messages.ts`, and customer-facing model IDs use neutral slugs (`ahura/image-flux-pro`, `ahura/voice-aria`, `ahura/rerank-m3`) that never expose the real model house. This matches the existing pattern where chat models carry a public `model_id` distinct from `upstream_model_id`.

## 3. Architecture

The 4 deployables: **(A)** CF Worker gateway (`workers/inference`), **(B)** Next.js control plane (single Linode VM), **(C)** k8s runners (`ft-runner`/`deploy-runner` on Linode k8s), **(D)** cron (CF Worker `scheduled()` → control-plane internal sweeps). One **NEW deployable (E)** is required only for realtime.

**Synchronous modalities (image, TTS, STT, rerank, moderation, OCR)** — pure gateway work, no new deployable:

1. Request hits `api.ahurasense.com/v1/images/generations` on **(A)**.
2. Existing middleware chain runs unchanged: `authMiddleware` → `spendCheckMiddleware` → `rateLimitMiddleware`. Per-key model-scope, IP allowlist, ZDR, hard-cap all apply for free.
3. New Hono route (e.g. `routes/images.ts`) parses the body, resolves the model via `lookupModelRouting()`, and branches on `serving_type`:
   - `proxy` → `forwardJson`/`streamPassthrough` to the brand-hidden upstream with the resolved upstream key.
   - `runpod_byo` (rerank/moderation) → `forwardToManaged`-style call to the RunPod Serverless endpoint URL stored on the model row.
4. On success the route computes `numUnits` + `unitLabel` (e.g. `1`/`"image"`, `chars`/`"tts_char"`, `audioSeconds`/`"stt_second"`) and enqueues a `UsageEvent` to `USAGE_EVENTS` via `waitUntil` — **the `UsageEvent` type already carries `numUnits`/`unitLabel`/`modality`**, so no event-shape change.
5. The **usage consumer** (queue handler in the same Worker) computes cost from catalog `pricing` and increments the KV `SPEND` counter. We extend `computeCost()` to handle unit-based pricing (per-image/per-char/per-second) alongside per-token.
6. **Media assets** (generated image bytes, TTS audio) are stored to **R2** by the Worker (it already has R2 access for cache); the customer gets a signed `https://cdn.ahurasense.com/...` URL (brand-hidden custom domain over R2), or inline base64 for small payloads matching OpenAI's `response_format` semantics.

**State:** model catalog + pricing in `inference.models` (Postgres); per-request metering in `inference.usage` (partitioned, unchanged); spend counter in KV; generated media in R2 with a TTL lifecycle rule; async job state in a new `inference.media_jobs` table.

**Asynchronous modalities (video, music, long batch STT)** — gateway + k8s runner:

1. **(A)** validates + writes a row to `inference.media_jobs` (status `queued`), uploads any input asset to R2, returns `{ id, status: "queued" }`.
2. A new **k8s runner `media-runner`** (sibling to `ft-runner`, same BullMQ `Claimer` polling Postgres for `status='queued'` rows) claims the job, calls the brand-hidden async upstream, polls/awaits, downloads the result to R2, flips status to `completed`, and enqueues a `UsageEvent` for per-second/per-clip billing.
3. Customer polls `GET /v1/videos/{id}` (served by **(A)**, reads `media_jobs`) or receives a webhook (reuse the existing CF Queue webhook fanout mentioned in `architecture.md`).
4. **(D) cron** gains a `media-job-watchdog` internal sweep (added to the existing per-minute `scheduled()` dispatch in `workers/inference/src/index.ts`) to reap stuck jobs past a deadline and refund, exactly like `runFinetuneWatchdog`/`runDeploymentMeter` already do.

**Realtime S2S — NEW deployable (E) `realtime-relay`:** CF Workers cannot hold the bidirectional, stateful, audio-frame-relayed WebSocket-to-WebSocket session that realtime needs (Workers can do WS but the per-session CPU + duration + upstream WS relay is a poor fit). Add a small **Node WS relay service on Linode k8s** (same cluster as the runners). Flow: client connects `wss://api.ahurasense.com/v1/realtime?model=ahura/voice-realtime`; the Worker authenticates the upgrade (validates key, scope, balance) and **issues a short-lived signed session token**, then the client is routed to the relay (via CF that proxies the WS to the k8s ingress). The relay opens the upstream WS, pipes audio frames both ways, and emits periodic `UsageEvent`s (per-connected-minute + per-audio-second) so a long session is metered incrementally, not only at close. Self-protection: the relay enforces a max session duration and a balance re-check each minute.

## 4. Data model

Three changes: (1) extend the `inference.models` modality enum + featured rows, (2) a new `inference.media_jobs` table for async work, (3) a new `billing.active_inference_realtime` table only for the persistent realtime sessions (synchronous modalities use event metering, **not** an `active_*` table). Migration style matches `20260614000005`/`20260614000006` exactly (idempotent, `DO $$ ... EXCEPTION WHEN duplicate_object`, RLS, grants).

```sql
-- supabase/migrations/20260616000001_multimodal_catalog_and_jobs.sql

-- 1) Extend the modality enum used by inference.models + inference.usage.
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'tts';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'stt';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'video';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'music';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'ocr';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'rerank';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'moderation';
ALTER TYPE inference.model_modality ADD VALUE IF NOT EXISTS 'realtime';

-- 2) Async media jobs (video / music / long batch STT). One row per job.
CREATE TABLE IF NOT EXISTS inference.media_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  api_key_id      UUID REFERENCES inference.api_keys(id) ON DELETE SET NULL,
  modality        inference.model_modality NOT NULL,
  model_id        TEXT NOT NULL,                 -- public catalog slug
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','completed','failed','canceled')),
  request_params  JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_r2_key    TEXT,                          -- uploaded input asset (image/audio)
  output_r2_key   TEXT,                          -- produced asset
  output_url      TEXT,                          -- signed cdn.ahurasense.com URL
  num_units       NUMERIC(14,4),                 -- seconds of video, etc.
  unit_label      TEXT,                          -- 'video_second' | 'music_second'
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  error_code      TEXT,
  claimed_at      TIMESTAMPTZ,
  heartbeat_at    TIMESTAMPTZ,                   -- runner liveness, like finetunes
  deadline_at     TIMESTAMPTZ,                   -- watchdog reaps past this
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_jobs_claim   ON inference.media_jobs (status, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_media_jobs_org      ON inference.media_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_jobs_watchdog ON inference.media_jobs (status, deadline_at)
  WHERE status IN ('queued','running');

ALTER TABLE inference.media_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.media_jobs TO authenticated;
GRANT ALL    ON inference.media_jobs TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read org media jobs" ON inference.media_jobs
    FOR SELECT USING (inference.is_org_member(org_id));   -- reuse existing RLS helper
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service role manages media jobs" ON inference.media_jobs
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_media_jobs_updated_at ON inference.media_jobs;
CREATE TRIGGER trg_media_jobs_updated_at BEFORE UPDATE ON inference.media_jobs
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();   -- shared trigger fn

-- 3) Persistent realtime sessions get the active_* lifecycle (grace/auto-stop)
--    so a wedged session is reaped + billed. service_id = session UUID.
CREATE TABLE IF NOT EXISTS billing.active_inference_realtime (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id     UUID NOT NULL,                  -- realtime session id
  hourly_rate    NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);
-- + indexes / RLS / grants mirroring billing.active_inference_vector verbatim.
```

Then `GRACE_SERVICE_TABLES` in `lib/billing/grace/constants.ts` gains `"active_inference_realtime"`, and the same string is added to the migration allowlists (`20260615000011_extend_grace_lifecycle_allowlist` pattern). Catalog rows are seeded with `ON CONFLICT (model_id) DO UPDATE` blocks identical to the embeddings migration, carrying neutral public slugs + `pricing` JSONB extended with per-unit keys (`cents_per_image`, `cents_per_1k_chars`, `cents_per_audio_minute`, `cents_per_rerank_unit`).

## 5. API surface

**Customer `/v1/*` (gateway, OpenAI-compatible where a spec exists):**

`POST /v1/images/generations`
```json
// request
{ "model": "ahura/image-flux-pro", "prompt": "a tensor flowing through glass",
  "n": 1, "size": "1024x1024", "response_format": "url" }
// response
{ "created": 1718500000,
  "data": [{ "url": "https://cdn.ahurasense.com/img/9f2a...png" }],
  "usage": { "images": 1 } }
```

`POST /v1/audio/speech` → returns `audio/mpeg` bytes (or SSE chunks when `stream:true`); header `X-Ahura-Cost-Cents` set.
```json
{ "model": "ahura/voice-aria", "input": "Welcome to AhuraCloud.", "voice": "aria", "format": "mp3" }
```

`POST /v1/audio/transcriptions` (multipart `file` + fields) → `{ "text": "...", "words": [...], "duration": 12.4 }`.

`POST /v1/rerank`
```json
// request
{ "model": "ahura/rerank-m3", "query": "how to rotate keys",
  "documents": ["...", "...", "..."], "top_n": 3 }
// response
{ "model": "ahura/rerank-m3",
  "results": [{ "index": 2, "relevance_score": 0.91 }, { "index": 0, "relevance_score": 0.55 }],
  "usage": { "rerank_units": 3 } }
```

`POST /v1/moderations` → OpenAI moderation shape `{ results: [{ flagged, categories, category_scores }] }`.

`POST /v1/videos` → `202 { "id": "vid_...", "status": "queued" }`; `GET /v1/videos/{id}` → status + `output_url` when done. `POST /v1/audio/music` / `GET /v1/audio/music/{id}` mirror this.

`GET /v1/realtime` (WebSocket upgrade) — authenticated handshake, then frame relay (§3).

`POST /v1/ocr` → `{ "pages": [{ "page": 1, "markdown": "...", "blocks": [...] }] }`.

**Dashboard `/api/*` (Next.js control plane):**
- `GET /api/inference/media/jobs` — list org's async jobs (RLS-scoped).
- `GET /api/inference/models?modality=image` — catalog filtered by modality for the playground/pricing pages.
- `POST /api/inference/internal/media-job-watchdog` — cron-only, `X-Ahura-Internal-Token` (mirrors existing internal sweep endpoints).
- `POST /api/inference/internal/realtime-meter` — cron-only per-minute realtime metering sweep.

## 6. Code sketches

**(a) Gateway Hono route — `workers/inference/src/routes/rerank.ts`** (matches `chat-completions.ts` style):
```ts
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables, UsageEvent } from "../types.ts";
import { forwardToManaged } from "../lib/model-routing.ts";
import { lookupModelRouting } from "../lib/model-routing.ts";

const rerankSchema = z.object({
  model: z.string().min(1),
  query: z.string().min(1),
  documents: z.array(z.string().min(1)).min(1).max(1000),
  top_n: z.number().int().positive().max(1000).optional(),
}).passthrough();

export const rerank: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  const parsed = rerankSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid rerank request", type: "invalid_request_error",
      code: "invalid_request", request_id: requestId } }, 400);
  }
  const req = parsed.data;
  // Scope check reuses the same allowedModels gate as chat.
  if (auth.allowedModels?.length && !auth.allowedModels.includes(req.model)) {
    return c.json({ error: { message: `Model "${req.model}" not allowed for this key`,
      type: "invalid_request_error", code: "model_not_allowed", request_id: requestId } }, 403);
  }
  const routing = await lookupModelRouting(c.env, req.model);
  if (!routing?.is_active || !routing.serving_url) {
    return c.json({ error: { message: `Model "${req.model}" is not available.`,
      type: "invalid_request_error", code: "model_unavailable", request_id: requestId } }, 503);
  }
  // Rerankers run on our RunPod Serverless substrate behind serving_url.
  const upstream = await forwardToManaged({
    servingUrl: routing.serving_url, servedModelName: routing.served_model_name ?? "reranker",
    body: req as unknown as Record<string, unknown>, signal: c.req.raw.signal,
  });
  const text = await upstream.text();
  c.executionCtx.waitUntil(c.env.USAGE_EVENTS.send({
    orgId: auth.orgId, apiKeyId: auth.keyId, userId: null, modelId: req.model,
    modality: "rerank", requestId, billedTo: auth.billing,
    inputTokens: null, outputTokens: null, cachedTokens: null,
    numUnits: req.documents.length, unitLabel: "rerank_unit",
    costCents: 0, upstreamCostCents: 0, isOffPeak: false,
    latencyMs: Date.now() - startedAt, ttftMs: null,
    status: upstream.ok ? "success" : "error_upstream", errorCode: null,
    cacheKind: "none", occurredAt: new Date().toISOString(),
  } satisfies UsageEvent));
  return new Response(text, { status: upstream.status,
    headers: { "content-type": "application/json", "X-Ahura-Request-Id": requestId,
      "X-Ahura-Model": req.model } });
};
```

**(b) Async runner job handler — `workers/media-runner/src/lifecycle.ts`** (mirrors `ft-runner` claim→run→settle):
```ts
import type { JobPayload, RunnerCtx } from "./types.js";

export async function runMediaJob(ctx: RunnerCtx, job: { data: JobPayload }): Promise<void> {
  const { supabase, upstream, r2, logger } = ctx;
  const { jobId } = job.data;
  // Atomic claim: only a still-queued row matches — idempotency gate, same as serving settle.
  const { data: claimed } = await supabase.schema("inference").from("media_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(),
              heartbeat_at: new Date().toISOString() })
    .eq("id", jobId).eq("status", "queued")
    .select("org_id, model_id, modality, request_params, input_r2_key").maybeSingle();
  if (!claimed) { logger.info({ jobId }, "already claimed"); return; }

  try {
    const result = await upstream.generate(claimed.model_id, claimed.request_params); // brand-hidden
    const key = `media/${claimed.modality}/${jobId}.${result.ext}`;
    await r2.put(key, result.bytes, { httpMetadata: { contentType: result.contentType } });
    await supabase.schema("inference").from("media_jobs").update({
      status: "completed", output_r2_key: key,
      output_url: `https://cdn.ahurasense.com/${key}`,
      num_units: result.seconds, unit_label: `${claimed.modality}_second`,
    }).eq("id", jobId);
    // Bill via the same usage path the gateway uses, so pricing stays single-sourced.
    await ctx.meter.chargeMediaJob(jobId, claimed, result.seconds);
  } catch (err) {
    await supabase.schema("inference").from("media_jobs")
      .update({ status: "failed", error_code: "generation_failed" }).eq("id", jobId);
    logger.error({ jobId, err: String(err) }, "media job failed");  // sanitized; no upstream name leaks
  }
}
```

**(c) Per-unit pricing in the usage consumer — extend `computeCost()` in `workers/inference/src/consumers/usage.ts`:**
```ts
// Added branch: catalog pricing for non-token modalities carries per-unit keys.
function computeUnitCost(event: UsageEvent, info: PricingInfo | undefined): number {
  if (!info || event.status !== "success" || event.numUnits == null) return 0;
  const p = info.pricing as Record<string, number>;
  const units = event.numUnits;
  switch (event.unitLabel) {
    case "image":         return Math.ceil(units * (p.cents_per_image ?? 0));
    case "tts_char":      return Math.ceil((units / 1000) * (p.cents_per_1k_chars ?? 0));
    case "stt_second":    return Math.ceil((units / 60) * (p.cents_per_audio_minute ?? 0));
    case "video_second":
    case "music_second":  return Math.ceil(units * (p.cents_per_media_second ?? 0));
    case "rerank_unit":   return Math.ceil((units / 1000) * (p.cents_per_1k_rerank ?? 0));
    case "moderation":    return Math.ceil((units / 1000) * (p.cents_per_1k_moderation ?? 0));
    default:              return 0;
  }
}
```
The existing `computeCost()` dispatches to this when `event.numUnits != null`, otherwise keeps the per-token math. The KV `SPEND` increment + threshold-alert pass downstream are unchanged, so spend caps and 80%/100% budget alerts work for multimodal automatically.

## 7. Billing

Pricing aligns to each modality's natural unit, stored in the `inference.models.pricing` JSONB (one source of truth, read by the usage consumer):

| Service | Billable unit | Pricing key |
|---|---|---|
| Image gen | per image (size-tiered) | `cents_per_image` |
| TTS | per 1k characters | `cents_per_1k_chars` |
| STT (sync) | per audio minute | `cents_per_audio_minute` |
| Video / Music | per output second | `cents_per_media_second` |
| Rerank | per 1k documents scored | `cents_per_1k_rerank` |
| Moderation | per 1k items | `cents_per_1k_moderation` |
| OCR | per page | `cents_per_page` |
| Realtime | per connected minute (+ audio second) | `active_inference_realtime.hourly_rate` |

**Enrollment in the billing spine — two paths:**
- **Synchronous + async-completion modalities use usage-event metering**, NOT an `active_*` table. They bill exactly like chat: `UsageEvent` → `USAGE_EVENTS` queue → consumer computes cost → `inference.usage` row + KV spend bump. Async jobs settle once on completion. This reuses the entire metering pipeline with zero new cron.
- **Realtime sessions use the `billing.active_*` lifecycle** (`active_inference_realtime`), because a persistent session is a resource that must be metered while open and reaped if wedged — the same reason serving pods, vector collections, and GPU pods use `active_*`. The existing 5-minute hourly cron meters it via proration, and the 7-day grace → auto-delete lifecycle (here: force-disconnect) comes free once added to `GRACE_SERVICE_TABLES`. A new per-minute `realtime-meter` internal sweep also re-checks balance to cut off sessions when credit runs out.

**Markup**: this cluster is the right place to introduce nonzero margin from day 0 (gap #7) since these are brand-new SKUs with no "0% markup" precedent to honor — set `pricing` to upstream-cost × margin, while `upstream_cost_cents` continues to record raw cost in `inference.usage` for analytics, matching the consumer's existing `upstream_cost_cents` field.

**Spend-cap interaction**: identical to chat — `spendCheckMiddleware` blocks before serving once the KV hard-cap counter is reached; per-key `allowed_models` restricts which multimodal SKUs a key can hit; per-key monthly budget triggers the existing 80%/100% alerts. Pre-flight balance guards (the shipped billing slice 1) apply to async job creation: reject `POST /v1/videos` if balance is below an estimated max cost.

## 8. Delivery plan

Slices are shippable increments. Estimates assume one engineer familiar with this gateway.

- **Slice 0 — catalog + metering plumbing (1.5 wk).** Migration `20260616000001` (modality enum, `media_jobs`, `active_inference_realtime`); extend `computeCost()`/`computeUnitCost()`; seed catalog rows; dashboard model-catalog filtering by modality. *No customer endpoint yet* — this de-risks billing first.
- **Slice 1 — rerank + moderation on RunPod (2 wk).** Deploy bge-reranker + Llama-Guard via existing `deploy-runner`; `routes/rerank.ts` + `routes/moderations.ts`; wire moderation into the Agents public chat endpoint as opt-in guardrail (gap #4 synergy). Highest ROI, no upstream dependency, exercises the full per-unit billing path. **Ship first.**
- **Slice 2 — image generation (2 wk).** `routes/images.ts` (generations + edits), R2 asset storage + `cdn.ahurasense.com` signed URLs + R2 lifecycle TTL, playground tile. Highest-revenue modality.
- **Slice 3 — TTS + STT proxy (2 wk).** `routes/audio-speech.ts` (streaming) + `routes/audio-transcriptions.ts` (multipart). Unblocks the voice-app segment (gap #1).
- **Slice 4 — async media (video + music) + `media-runner` (3 wk).** New k8s runner (fork `ft-runner` scaffolding: `Claimer`, BullMQ, health server, heartbeat), `media-job-watchdog` cron sweep, `/v1/videos` + `/v1/audio/music` + poll endpoints + webhook fanout.
- **Slice 5 — OCR / Document AI (1 wk).** `routes/ocr.ts`, per-page billing. Thin once image plumbing exists.
- **Slice 6 — realtime S2S + `realtime-relay` deployable (4 wk, gated).** New k8s WS relay, signed session token handshake on the Worker, per-minute metering via `active_inference_realtime`, balance cutoff. **Do last / only when a brand-hideable WS upstream is confirmed.**

**Dependencies on other clusters:** Slice 1 moderation pairs with the **Agents/guardrails** cluster (gap #4/#13). Per-unit markup decision pairs with the **billing completeness** cluster (gap #7). R2 `cdn.ahurasense.com` custom domain is shared infra — coordinate with the domain-migration runbook (apex `ahurasense.com` + `api.` + now `cdn.`).

**Cut for v1:** realtime (Slice 6 — differentiator, not table-stakes), music (niche), image *edits* (ship generations only), STT diarization + translation endpoints. Ship Slices 0–3 + 5 as the credible "multimodal aggregator" milestone (~8.5 eng-weeks).

## 9. Risks & open questions

1. **Brand-scrub on binary/error surfaces.** TTS/image upstreams may set response headers, model-name fields in JSON, or error strings that leak the real provider. The `customerSafeErrorMessage()` discipline covers JSON errors but **media response headers and multipart error bodies are new write paths** that must be audited (per the three-layer brand-scrub rule). Open: do any upstreams embed provider watermarks/EXIF in generated images? Need a strip step in the R2 write path.
2. **R2 asset lifecycle + privacy.** Generated media on R2 needs a TTL (e.g. 24h signed URLs, 7-day object expiry) and must honor per-key **ZDR** — ZDR keys should get inline base64 only, never a persisted R2 object. Open: default retention window and whether to offer per-org retention config.
3. **Per-unit metering accuracy.** STT bills per audio-second but we only know true duration after transcription; video/music duration is upstream-reported. Risk of under/over-billing if upstream omits duration. Mitigation: fall back to input duration (STT) or requested clip length (video), and reconcile in the watchdog.
4. **Async cost-estimation for pre-flight guards.** Video can cost dollars per clip; the pre-flight balance check needs a worst-case estimate before the job runs, and a refund path if the job fails after partial billing. The `media-job-watchdog` must own refunds on `failed`/timeout.
5. **Realtime is genuinely new infrastructure.** It's the only piece that breaks the "everything is gateway + existing runners" model. The new `realtime-relay` deployable adds an always-on k8s service to operate, monitor, and scale — real ops burden. Confirm a brand-hideable WS upstream exists before committing Slice 6; otherwise keep `/v1/realtime` returning 501.
6. **Catalog enum migration.** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in older Postgres and can't be rolled back — verify the Supabase migration runner tolerates it (the existing `extend_product_type_enum` / `extend_transactions_service_type_allowlist` migrations suggest the pattern is already in use here).
7. **RunPod cold-start for rerank/moderation.** Self-hosted small models on RunPod Serverless cold-start like the FT serving path; the chat route already handles `instance_warming_up` with `Retry-After`. Decide whether rerank/moderation justify a warm `min_workers ≥ 1` (always-on cost) given they're latency-sensitive and feed the synchronous Agents guardrail.
8. **Multipart on Workers.** `/v1/audio/transcriptions` takes file uploads; confirm CF Worker request-body size limits accommodate target audio file sizes, or route large STT through the async `media-runner` path instead of inline.