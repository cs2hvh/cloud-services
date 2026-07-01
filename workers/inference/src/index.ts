/**
 * AhuraCloud Inference Edge Gateway
 *
 * Public surface: api.ahurasense.com/v1/*
 *
 * Request lifecycle:
 *   1. requestId + timing init
 *   2. authMiddleware  — sha256(API key) → lookup in KV (fallback Postgres),
 *                        attach AuthContext, populate c.var.auth
 *   3. spendCheckMiddleware — block before serving if hard_cap reached
 *   4. rateLimitMiddleware  — per-key token bucket via Durable Object
 *   5. route handler — forwards to OpenRouter (or RunPod for FT/BYO models)
 *   6. usage event enqueued post-stream-complete (or on error)
 *   7. audit event enqueued for mutating actions
 *
 * All routes are stubs in Phase 0. Phase 1 fills in chat-completions
 * with real OpenRouter proxy + streaming.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import type { Env, HonoVariables } from "./types.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { spendCheckMiddleware } from "./middleware/spend.ts";
import { rateLimitMiddleware } from "./middleware/rate-limit.ts";
import { chatCompletions } from "./routes/chat-completions.ts";
import { embeddings } from "./routes/embeddings.ts";
import { listModels } from "./routes/models.ts";
import { keyInfo } from "./routes/key.ts";
import { messagesShim } from "./routes/messages.ts";
import { rerank } from "./routes/rerank.ts";
import { moderations } from "./routes/moderations.ts";
import { imageGenerations } from "./routes/images.ts";
import { createVideoJob, getVideoJob, getVideoContent, retryVideoJob } from "./routes/video-generations.ts";
import { createMusicJob } from "./routes/music-generations.ts";
import { audioSpeech } from "./routes/audio-speech.ts";
import { audioTranscriptions } from "./routes/audio-transcriptions.ts";
import { ocr } from "./routes/ocr.ts";
import { handleUsageBatch } from "./consumers/usage.ts";
import { handleAuditBatch } from "./consumers/audit.ts";
import { handleTraceBatch } from "./consumers/trace.ts";

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ───────────────────────────────────────────────────────────────
// Pre-route middleware (no auth needed)
// ───────────────────────────────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-Ahura-Billing",
      "X-Ahura-BYOK-Provider",
      "X-Ahura-Request-Id",
      "X-Ahura-Idempotency-Key",
      "X-Ahura-Preset",
      "X-Ahura-Guardrail",
      "X-Ahura-Cache",
      "X-Ahura-Cache-TTL",
      "X-Ahura-Trace-Id",
      "X-Ahura-Prompt",
      "X-Ahura-Prompt-Vars",
    ],
    exposeHeaders: [
      "X-Ahura-Request-Id",
      "X-Ahura-Model",
      "X-Ahura-Cost-Cents",
      "X-Ahura-Cache",
      "X-Ahura-Cache-Age",
      "X-Ahura-Guardrail",
      "X-Ahura-Prompt-Version",
      "X-Ahura-Trace-Id",
    ],
    maxAge: 86400,
  })
);

// Request id + timing init
app.use("*", async (c, next) => {
  const requestId = c.req.header("X-Ahura-Request-Id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("startedAt", Date.now());
  c.header("X-Ahura-Request-Id", requestId);
  await next();
});

// ───────────────────────────────────────────────────────────────
// Health (unauthenticated)
// ───────────────────────────────────────────────────────────────
app.get("/v1/health", (c) =>
  c.json({
    status: "ok",
    version: c.env.GATEWAY_VERSION,
    env: c.env.ENV,
    timestamp: new Date().toISOString(),
  })
);

// ───────────────────────────────────────────────────────────────
// Authenticated route group
// ───────────────────────────────────────────────────────────────
const v1 = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

v1.use("*", authMiddleware);
v1.use("*", spendCheckMiddleware);
v1.use("*", rateLimitMiddleware);

// Core inference surface — OpenAI compatible
v1.post("/chat/completions", chatCompletions);
v1.post("/embeddings", embeddings);

// Phase 1 — Rerank + Moderation (OpenRouter proxy: Cohere + Llama Guard)
v1.post("/rerank", rerank);
v1.post("/moderations", moderations);

// Phase 1 — Image generation
v1.post("/images/generations", imageGenerations);
// Slice 4 — Async video generation (POST creates job, GET polls status)
v1.post("/videos", createVideoJob);
v1.get("/videos/:id/content", getVideoContent);  // proxy before :id catch-all
v1.get("/videos/:id", getVideoJob);
v1.post("/videos/:id/retry", retryVideoJob);

// Music generation (synchronous via Lyria streaming, like TTS)
v1.post("/audio/music", createMusicJob);

// Slice 3 — TTS + STT (OpenRouter gpt-audio-mini / voxtral proxy)
v1.post("/audio/speech", audioSpeech);
v1.post("/audio/transcriptions", audioTranscriptions);

// Slice 5 — OCR / Document AI (Gemini via OpenRouter)
v1.post("/ocr", ocr);

// Catalog + introspection
v1.get("/models", listModels);
v1.get("/key", keyInfo);

// Anthropic Messages API compatibility shim — adapts to OAI chat/completions
v1.post("/messages", messagesShim);

app.route("/v1", v1);

// ───────────────────────────────────────────────────────────────
// Error fallback — never leak stack traces; always JSON
// ───────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: c.get("requestId"),
      message: err.message,
      stack: err.stack,
    })
  );
  return c.json(
    {
      error: {
        message: "Internal gateway error",
        type: "internal_error",
        code: "internal_error",
        request_id: c.get("requestId"),
      },
    },
    500
  );
});

app.notFound((c) =>
  c.json(
    {
      error: {
        message: `No such route: ${c.req.method} ${c.req.path}`,
        type: "not_found",
        code: "not_found",
        request_id: c.get("requestId"),
      },
    },
    404
  )
);

// ───────────────────────────────────────────────────────────────
// Worker export — combines the HTTP router (fetch) with the queue
// consumer (queue) and the cron trigger (scheduled). Cloudflare invokes
// whichever handler matches the trigger. The same Worker code therefore
// both produces events (in the request path) and consumes them (in the
// consumer path), and runs the cron-scheduled control-plane sweeps.
// ───────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch.bind(app),

  async queue(
    batch: MessageBatch<unknown>,
    env: Env
  ): Promise<void> {
    // To add a new queue: import its handler, register it here.
    // The queue name must match the `queue` field in wrangler.toml [[queues.consumers]].
    const QUEUE_HANDLERS: Record<
      string,
      (batch: MessageBatch<never>, env: Env) => Promise<void>
    > = {
      "ahura-inference-usage": handleUsageBatch as never,
      "ahura-inference-audit": handleAuditBatch as never,
      "ahura-inference-trace": handleTraceBatch as never,
    };

    const handler = QUEUE_HANDLERS[batch.queue];
    if (handler) {
      await handler(batch as MessageBatch<never>, env);
    } else {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: `Unknown queue routed to consumer: ${batch.queue}`,
        })
      );
      batch.ackAll();
    }
  },

  /**
   * Cron-triggered sweeps. Cloudflare fires this for every entry in
   * wrangler.toml's [triggers.crons]. Today we only have one schedule
   * (`* * * * *`) which fires every minute. Inside the handler we
   * dispatch by what's due:
   *
   *   - Every minute → serving-pod watchdog (reap idle hosted-serving
   *     instances past their auto_stop_at).
   *   - Once per hour (minute == 0) → semantic cache GC (delete rows
   *     past the TTL so the table doesn't grow unbounded).
   *
   * Failures don't retry (Workers cron has no automatic retry); we log
   * + rely on the next firing to catch up. Both sweeps are idempotent
   * (watchdog: state flip conditional on state='running'; GC: DELETE
   * by time predicate), so over-firing is safe.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runServingPodWatchdog(env, event));
    ctx.waitUntil(runMediaJobWatchdog(env, event));
    const minuteOfHour = new Date(event.scheduledTime).getUTCMinutes();
    // Fine-tuning watchdog every 5 min: reaps orphaned FT jobs (stale
    // heartbeat) and zombie GPU pods left on already-terminal jobs. Its
    // thresholds are 30 min so per-minute is overkill, and its zombie-pod
    // sweep makes RunPod API calls — every 5 min is plenty.
    if (minuteOfHour % 5 === 0) {
      ctx.waitUntil(runFinetuneWatchdog(env, event));
      // Backstop for orphaned eval runs (runner died mid-run). Pure status
      // flip — no pod/cost to settle — so a generous stale threshold is fine
      // at the 5-min cadence.
      ctx.waitUntil(runEvalWatchdog(env, event));
      // Meter BYO deployments (RunPod Serverless) for GPU worker uptime.
      ctx.waitUntil(runDeploymentMeter(env, event));
    }
    // GC once per hour to keep noise out of logs + bound Supabase
    // RPC pressure. The query-time freshness filter keeps stale
    // rows invisible to callers between sweeps, so frequency is
    // purely about storage, not correctness.
    if (minuteOfHour === 0) {
      ctx.waitUntil(runSemanticCacheGc(env, event));
    }
  },
};

async function runServingPodWatchdog(env: Env, event: ScheduledEvent): Promise<void> {
  await runControlPlaneSweep(
    env,
    event,
    "/api/inference/internal/serving-pod-watchdog",
    "serving-pod watchdog"
  );
}

async function runMediaJobWatchdog(env: Env, event: ScheduledEvent): Promise<void> {
  await runControlPlaneSweep(
    env,
    event,
    "/api/inference/internal/media-job-watchdog",
    "media-job watchdog"
  );
}

async function runFinetuneWatchdog(env: Env, event: ScheduledEvent): Promise<void> {
  await runControlPlaneSweep(
    env,
    event,
    "/api/inference/internal/finetune-watchdog",
    "finetune watchdog"
  );
}

async function runEvalWatchdog(env: Env, event: ScheduledEvent): Promise<void> {
  await runControlPlaneSweep(
    env,
    event,
    "/api/inference/internal/eval-watchdog",
    "eval watchdog"
  );
}

async function runDeploymentMeter(env: Env, event: ScheduledEvent): Promise<void> {
  await runControlPlaneSweep(
    env,
    event,
    "/api/inference/internal/deployment-meter",
    "deployment meter"
  );
}

/**
 * POST a cron-only internal sweep endpoint on the control plane with the
 * shared X-Ahura-Internal-Token. Best-effort: logs failures (with a 401
 * remediation hint) and only logs success when the sweep actually did
 * something, to keep the per-minute cron out of the log stream.
 *
 * The token has two accepted env names. Operators were previously asked to set
 * BATCH_PROCESSOR_TOKEN on Next.js + INTERNAL_CRON_TOKEN on the worker, then
 * keep them in sync. That's a footgun (silent 401s = no sweeps) so we accept
 * either — the docs recommend BATCH_PROCESSOR_TOKEN on both sides so the value
 * can be set once and reused.
 */
async function runControlPlaneSweep(
  env: Env,
  event: ScheduledEvent,
  path: string,
  label: string
): Promise<void> {
  if (!env.CONTROL_PLANE_URL) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "scheduled: CONTROL_PLANE_URL not configured",
        label,
        cron: event.cron,
      })
    );
    return;
  }
  const token = env.INTERNAL_CRON_TOKEN ?? env.BATCH_PROCESSOR_TOKEN;
  if (!token) {
    console.error(
      JSON.stringify({
        level: "error",
        message:
          "scheduled: no shared-cron secret set — wrangler secret put BATCH_PROCESSOR_TOKEN (same value as Next.js .env)",
        label,
        cron: event.cron,
      })
    );
    return;
  }
  const url = `${env.CONTROL_PLANE_URL.replace(/\/+$/, "")}${path}`;
  const startedAt = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ahura-Internal-Token": token,
        "User-Agent": "ahura-inference-edge/cron",
      },
      // Empty body — the endpoint reads nothing from the request.
      body: "{}",
    });
    const elapsedMs = Date.now() - startedAt;
    if (!r.ok) {
      // 401 is the high-signal failure mode (token mismatch). Surface it
      // loudly with a remediation hint so the operator notices in logs.
      const hint =
        r.status === 401
          ? " — token mismatch. Set worker secret BATCH_PROCESSOR_TOKEN to the SAME value as the Next.js .env BATCH_PROCESSOR_TOKEN."
          : "";
      console.error(
        JSON.stringify({
          level: "error",
          message: `scheduled: ${label} returned ${r.status}${hint}`,
          status: r.status,
          elapsedMs,
          cron: event.cron,
        })
      );
      return;
    }
    const summary = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const num = (k: string) => Number(summary[k] ?? 0);
    // Only log when something happened — avoids zero-activity log spam.
    const didSomething =
      num("scanned") > 0 ||
      num("errors") > 0 ||
      num("stopped") > 0 ||
      num("reaped") > 0 ||
      num("zombie_pods_terminated") > 0 ||
      num("charged") > 0;
    if (didSomething) {
      console.log(
        JSON.stringify({
          level: "info",
          message: `scheduled: ${label} completed`,
          ...summary,
          elapsedMs,
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: `scheduled: ${label} fetch failed`,
        err: err instanceof Error ? err.message : String(err),
        cron: event.cron,
      })
    );
  }
}

/**
 * Hourly sweep that calls inference.gc_semantic_cache to delete
 * cache rows older than the TTL the lib uses (3600s). Best-effort —
 * never throws to the cron runtime since the freshness filter in
 * lookup_semantic_cache already keeps stale rows invisible.
 */
async function runSemanticCacheGc(env: Env, event: ScheduledEvent): Promise<void> {
  const startedAt = Date.now();
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { "X-Client-Info": "ahura-inference-semantic-cache-gc" } },
    });
    const { data, error } = await supabase
      .schema("inference")
      .rpc("gc_semantic_cache", { p_ttl_seconds: 3600 });
    const elapsedMs = Date.now() - startedAt;
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "scheduled: semantic cache gc rpc failed",
          err: error.message,
          elapsedMs,
          cron: event.cron,
        })
      );
      return;
    }
    const deleted = typeof data === "number" ? data : null;
    if (deleted && deleted > 0) {
      console.log(
        JSON.stringify({
          level: "info",
          message: "scheduled: semantic cache gc completed",
          deleted,
          elapsedMs,
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "scheduled: semantic cache gc threw",
        err: err instanceof Error ? err.message : String(err),
        cron: event.cron,
      })
    );
  }
}

// Re-export the Durable Object class for wrangler
export { RateLimiter } from "./durable-objects/rate-limiter.ts";
