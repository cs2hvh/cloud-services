/**
 * Per-capability kill switches, enforced at the gateway.
 *
 * The control plane can turn a capability off from the admin console
 * (`/dashboard/admin/inference-overview`, backed by `public.platform_settings` —
 * the same table and pattern as the long-standing `gpu_deploy_enabled`). This is
 * the half that makes the flip real: without an enforcement point a switch is a
 * row in a table that lets an operator believe the bleeding stopped when it did
 * not.
 *
 * FOUR RULES, each one load-bearing:
 *
 * 1. **Fail OPEN.** A missing row, an unreachable database, a malformed value —
 *    all mean enabled. A kill switch that takes the platform down when its own
 *    storage hiccups is a bigger outage than the one it exists to contain.
 *
 * 2. **Gate the SPENDING routes only.** Reads, polls and management calls stay
 *    up. Turning media off must not stop a customer polling the video job they
 *    already paid for, and turning agents off must not lock them out of deleting
 *    a runaway agent — the same reasoning spend.ts had to be corrected for
 *    (2026-07-18), arrived at deliberately this time rather than in production.
 *
 * 3. **Match paths explicitly.** Hono flattens sub-app routes into one routing
 *    table (see lib/management-paths.ts), so a wildcard middleware sees every
 *    /v1 path regardless of which instance declared it. Path-aware is the only
 *    option available, and an allowlist of shapes is the safe direction to be
 *    wrong in: an unmatched path stays SERVED.
 *
 * 4. **Refuse before spending.** This runs before any upstream call, so a
 *    refused request is never billed.
 *
 * It also adds ZERO latency to a customer request — see the cache note below,
 * which is the part of this file most worth reading before changing it.
 */
import type { MiddlewareHandler } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";

/** Keys must match lib/admin/feature-switches.ts in the control plane. */
const INFERENCE = "ai_inference_enabled";
const AGENTS = "ai_agents_enabled";
const MEDIA = "ai_media_enabled";
const CONNECTOR_SYNC = "ai_connector_sync_enabled";

const UUID = "[^/]+";

interface Gate {
  key: string;
  /** Human name, used in the 503 message. */
  label: string;
  method: string;
  pattern: RegExp;
}

/**
 * Only routes that START new paid work.
 *
 * Absent on purpose: GET /v1/videos/:id (polling a job the customer already
 * paid for), GET /v1/models, GET /v1/key, every agent-management and MCP route,
 * GET on agent runs, and connector CRUD. Turning a capability off should stop
 * new spend, not strand work already in flight or block the customer from
 * cleaning up.
 */
const GATES: Gate[] = [
  // Core inference
  { key: INFERENCE, label: "Inference API", method: "POST", pattern: new RegExp(`^/v1/chat/completions$`) },
  { key: INFERENCE, label: "Inference API", method: "POST", pattern: new RegExp(`^/v1/embeddings$`) },
  { key: INFERENCE, label: "Inference API", method: "POST", pattern: new RegExp(`^/v1/rerank$`) },
  { key: INFERENCE, label: "Inference API", method: "POST", pattern: new RegExp(`^/v1/moderations$`) },
  { key: INFERENCE, label: "Inference API", method: "POST", pattern: new RegExp(`^/v1/messages$`) },

  // Agents — starting a run only. Cancel and stream stay open by design.
  { key: AGENTS, label: "Agents", method: "POST", pattern: new RegExp(`^/v1/responses$`) },
  { key: AGENTS, label: "Agents", method: "POST", pattern: new RegExp(`^/v1/agents/${UUID}/runs$`) },

  // Media — every generator, plus the retry that re-submits upstream.
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/images/generations$`) },
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/videos$`) },
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/videos/${UUID}/retry$`) },
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/audio/music$`) },
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/audio/speech$`) },
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/audio/transcriptions$`) },
  { key: MEDIA, label: "Media generation", method: "POST", pattern: new RegExp(`^/v1/ocr$`) },

  // RAG ingestion — the sync trigger only; querying existing vectors stays up.
  {
    key: CONNECTOR_SYNC,
    label: "Connector syncs",
    method: "POST",
    pattern: new RegExp(`^/v1/connectors/${UUID}/sync$`),
  },
];

/** The gate for this request, or null when nothing gates it. Exported for tests. */
export function gateFor(method: string, path: string): Gate | null {
  return GATES.find((g) => g.method === method && g.pattern.test(path)) ?? null;
}

/**
 * Every switch key this file reads.
 *
 * Exported so a test can assert it matches `FEATURE_SWITCHES` in
 * lib/admin/feature-switches.ts and the seed in the migration. Those three lists
 * live in three deploy units that ship independently, and a key present in the
 * admin but absent here is the exact failure this file's header warns about: an
 * operator flips a switch, believes the bleeding stopped, and nothing read it.
 */
export const GATED_KEYS: string[] = [...new Set(GATES.map((g) => g.key))].sort();

/**
 * NEVER BLOCK A CUSTOMER REQUEST ON THIS LOOKUP.
 *
 * The obvious implementation — await the setting, cache it for 10s — is wrong
 * here, and measurably so. Cloudflare recycles isolates constantly, and at this
 * platform's volume (~1,700 inference requests per 30 days) almost every request
 * lands in a cold isolate. A blocking read would therefore add a Supabase
 * round trip (tens of milliseconds, edge → Postgres) to essentially EVERY chat
 * completion, permanently, to support a switch that is flipped perhaps twice a
 * year. That is a real regression paid every day for a capability used almost
 * never.
 *
 * So the cache is read-through-stale with a BACKGROUND refresh:
 *
 *   - warm and fresh  → answer from memory, no I/O at all
 *   - warm but stale  → answer from memory NOW, refresh behind the request
 *   - cold isolate    → answer "enabled" and refresh behind the request
 *
 * Added latency in every one of those paths: zero.
 *
 * THE TRADE, STATED: for a few seconds after an operator flips a switch off,
 * each edge isolate lets through roughly one request before its cache catches
 * up. That is the correct trade for a KILL SWITCH — it exists to stop a flood or
 * a bleeding upstream, not to enforce a security boundary, and it is already
 * fail-open by design (rule 1). If something ever needs hard, immediate
 * enforcement, it belongs in authMiddleware's KV path, not here.
 */
const TTL_MS = 30_000;
const cache = new Map<string, { value: boolean; at: number }>();
/** De-dupes concurrent refreshes of the same key within one isolate. */
const refreshing = new Set<string>();

async function refresh(env: Env, key: string): Promise<void> {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { "X-Client-Info": "ahura-inference-edge/feature-gate" } },
    });
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle<{ value: unknown }>();
    // A read error caches ENABLED rather than leaving the entry absent, so a
    // database wobble cannot turn into a refresh storm on the next request.
    cache.set(key, { value: error || data == null ? true : data.value !== false, at: Date.now() });
  } catch {
    cache.set(key, { value: true, at: Date.now() }); // fail open — see rule 1
  } finally {
    refreshing.delete(key);
  }
}

/**
 * The whole caching decision, as a pure function of what is cached and when.
 *
 * Split out because this — not the path matching — is the subtle part: it is
 * where "never block a customer request" either holds or quietly stops holding.
 * Exported so it can be tested without a Worker runtime or a database.
 */
export function decide(
  entry: { value: boolean; at: number } | undefined,
  now: number,
  ttlMs = TTL_MS
): { enabled: boolean; refresh: boolean } {
  if (!entry) return { enabled: true, refresh: true };            // cold isolate: serve, then learn
  if (now - entry.at < ttlMs) return { enabled: entry.value, refresh: false };
  return { enabled: entry.value, refresh: true };                 // stale: serve last known, refresh behind
}

/** Synchronous: returns what we know now and schedules a refresh if it is stale. */
function isEnabled(c: { env: Env; executionCtx: ExecutionContext }, key: string): boolean {
  const { enabled, refresh: needsRefresh } = decide(cache.get(key), Date.now());

  if (needsRefresh && !refreshing.has(key)) {
    refreshing.add(key);
    // waitUntil keeps the isolate alive for the fetch without the response
    // waiting on it. If the runtime has no executionCtx (tests), just drop it —
    // an un-refreshed cache means "enabled", which is the safe direction.
    try {
      c.executionCtx.waitUntil(refresh(c.env, key));
    } catch {
      refreshing.delete(key);
    }
  }
  return enabled;
}

export const featureGateMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const gate = gateFor(c.req.method, new URL(c.req.url).pathname);
  if (!gate) return next();

  if (isEnabled(c, gate.key)) return next();

  // 503 with Retry-After, not 403: this is us being unavailable, not the
  // customer being forbidden. Clients and SDKs already back off on 503.
  c.header("Retry-After", "60");
  return c.json(
    gatewayError(
      `${gate.label} is temporarily unavailable while we work on the platform. No charge is made for refused requests.`,
      "service_unavailable",
      "feature_disabled",
      c.get("requestId")
    ),
    503
  );
};
