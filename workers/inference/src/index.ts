/**
 * AhuraCloud Inference Edge Gateway
 *
 * Public surface: api.cs2hvh.com/v1/*  (migration target: api.ahurasense.com — see docs/inference/migration-ahurasense.md)
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

import type { AuditEvent, Env, HonoVariables, UsageEvent } from "./types.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { spendCheckMiddleware } from "./middleware/spend.ts";
import { rateLimitMiddleware } from "./middleware/rate-limit.ts";
import { chatCompletions } from "./routes/chat-completions.ts";
import { embeddings } from "./routes/embeddings.ts";
import { listModels } from "./routes/models.ts";
import { keyInfo } from "./routes/key.ts";
import { messagesShim } from "./routes/messages.ts";
import { handleUsageBatch } from "./consumers/usage.ts";
import { handleAuditBatch } from "./consumers/audit.ts";

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
    ],
    exposeHeaders: [
      "X-Ahura-Request-Id",
      "X-Ahura-Model",
      "X-Ahura-Cost-Cents",
      "X-Ahura-Cache",
      "X-Ahura-Cache-Age",
      "X-Ahura-Guardrail",
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
    batch: MessageBatch<UsageEvent | AuditEvent>,
    env: Env
  ): Promise<void> {
    if (batch.queue === "ahura-inference-usage") {
      await handleUsageBatch(batch as MessageBatch<UsageEvent>, env);
    } else if (batch.queue === "ahura-inference-audit") {
      await handleAuditBatch(batch as MessageBatch<AuditEvent>, env);
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
   * (`* * * * *`) which invokes the serving-pod watchdog so idle hosted-
   * serving instances past their auto_stop_at deadline get reaped.
   *
   * Failures don't retry (Workers cron has no automatic retry); we log
   * + rely on the next minute's invocation to catch up. The watchdog
   * is idempotent (state flip is conditional on state='running') so
   * over-firing is safe.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runServingPodWatchdog(env, event));
  },
};

async function runServingPodWatchdog(env: Env, event: ScheduledEvent): Promise<void> {
  if (!env.CONTROL_PLANE_URL) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "scheduled: CONTROL_PLANE_URL not configured",
        cron: event.cron,
      })
    );
    return;
  }
  if (!env.INTERNAL_CRON_TOKEN) {
    console.error(
      JSON.stringify({
        level: "error",
        message:
          "scheduled: INTERNAL_CRON_TOKEN not set as worker secret — wrangler secret put INTERNAL_CRON_TOKEN",
        cron: event.cron,
      })
    );
    return;
  }
  const url = `${env.CONTROL_PLANE_URL.replace(/\/+$/, "")}/api/inference/internal/serving-pod-watchdog`;
  const startedAt = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ahura-Internal-Token": env.INTERNAL_CRON_TOKEN,
        "User-Agent": "ahura-inference-edge/cron",
      },
      // Empty body — the endpoint reads nothing from the request.
      body: "{}",
    });
    const elapsedMs = Date.now() - startedAt;
    if (!r.ok) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "scheduled: watchdog returned non-2xx",
          status: r.status,
          elapsedMs,
          cron: event.cron,
        })
      );
      return;
    }
    const summary = (await r.json().catch(() => ({}))) as {
      scanned?: number;
      stopped?: number;
      errors?: number;
    };
    // Only log when something happened — avoids 1440 zero-activity log
    // lines per day. Errors always log.
    if ((summary.scanned ?? 0) > 0 || (summary.errors ?? 0) > 0) {
      console.log(
        JSON.stringify({
          level: "info",
          message: "scheduled: watchdog completed",
          scanned: summary.scanned,
          stopped: summary.stopped,
          errors: summary.errors,
          elapsedMs,
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "scheduled: watchdog fetch failed",
        err: err instanceof Error ? err.message : String(err),
        cron: event.cron,
      })
    );
  }
}

// Re-export the Durable Object class for wrangler
export { RateLimiter } from "./durable-objects/rate-limiter.ts";
