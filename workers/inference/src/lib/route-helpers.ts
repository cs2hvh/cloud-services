/**
 * Shared plumbing for the API-key-authed management routes (agent-
 * management.ts, mcp-servers.ts, vector-collections.ts) — extracted after a
 * duplication review (2026-07-17) found identical copies of all four
 * functions below in every one of those three files, plus vector-
 * collections.ts silently missing the audit calls the other two had (a
 * correctness gap, not just style — row mutations went unaudited).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import type { AuditEvent, Env, HonoVariables } from "../types.ts";

type RouteContext = Parameters<Handler<{ Bindings: Env; Variables: HonoVariables }>>[0];

export function makeSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge" } },
  });
}

export function auditContextFrom(c: RouteContext): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: c.req.header("CF-Connecting-IP") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
  };
}

/** Fire-and-forget audit event — a failure here must never affect the
 *  mutation it's describing (same discipline as the AUDIT_EVENTS consumer's
 *  own retry handling; this is best-effort at the producer side). */
export function enqueueAudit(
  c: RouteContext,
  event: Pick<AuditEvent, "action" | "targetType" | "targetId" | "metadata">
): void {
  const auth = c.get("auth");
  const { ipAddress, userAgent } = auditContextFrom(c);
  const full: AuditEvent = {
    orgId: auth.orgId,
    actorApiKeyId: auth.keyId,
    actorUserId: null,
    occurredAt: new Date().toISOString(),
    ipAddress,
    userAgent,
    ...event,
  };
  c.executionCtx.waitUntil(c.env.AUDIT_EVENTS.send(full).catch(() => undefined));
}

/** Reads the request body as JSON. Returns `undefined` as a sentinel for
 *  "invalid JSON" — distinct from a valid JSON `null`/empty body, which
 *  callers should let their zod schema reject with a normal validation
 *  error instead of a generic "invalid JSON" one. */
export async function readJson(c: RouteContext): Promise<unknown> {
  try {
    const text = await c.req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return undefined;
  }
}
