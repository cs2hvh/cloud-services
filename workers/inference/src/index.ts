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
    ],
    exposeHeaders: [
      "X-Ahura-Request-Id",
      "X-Ahura-Model",
      "X-Ahura-Cost-Cents",
      "X-Ahura-Cache",
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
// consumer (queue). Cloudflare invokes whichever handler matches
// the trigger. The same Worker code therefore both produces events
// (in the request path) and consumes them (in the consumer path).
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
};

// Re-export the Durable Object class for wrangler
export { RateLimiter } from "./durable-objects/rate-limiter.ts";
