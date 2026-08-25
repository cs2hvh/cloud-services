/**
 * Agent-scope gate (doc: manager ask 2026-07-08 — per-agent access keys).
 *
 * A normal key has `auth.agentId === null` and this middleware is a no-op.
 * A key minted from an agent's own "Access Keys" tab has `auth.agentId` set
 * to that one agentcore.agents.id — such a key must never reach any other
 * inference surface (chat completions, images, embeddings, a DIFFERENT
 * agent's runs, ...), only its own agent's run lifecycle.
 *
 * Path-based, not a DB lookup: cheap, runs before spend/rate-limit state is
 * touched. The run-read routes (GET/stream/cancel) can't be scope-checked by
 * path alone (a run id doesn't reveal its owning agent) — those routes add
 * an `.eq("agent_id", auth.agentId)` filter themselves (see agent-runs.ts);
 * this middleware just lets them through to that deeper check.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";

const AGENT_RUN_CREATE = /^\/v1\/agents\/([^/]+)\/runs$/;
const AGENT_RUN_READ = /^\/v1\/agents\/runs\/[^/]+/;

export const agentScopeMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  if (!auth.agentId) return next(); // unrestricted key — no-op

  const requestId = c.get("requestId");
  const path = new URL(c.req.url).pathname;

  const createMatch = path.match(AGENT_RUN_CREATE);
  if (c.req.method === "POST" && createMatch) {
    if (createMatch[1] !== auth.agentId) {
      return c.json(
        gatewayError(
          "This key is scoped to a different agent",
          "invalid_request_error",
          "agent_scope_mismatch",
          requestId
        ),
        403
      );
    }
    return next();
  }

  if (AGENT_RUN_READ.test(path)) return next(); // handler enforces agent_id match itself

  return c.json(
    gatewayError(
      "This key can only run/read its assigned agent",
      "invalid_request_error",
      "agent_scope_restricted",
      requestId
    ),
    403
  );
};
