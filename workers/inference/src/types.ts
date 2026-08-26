import type { TraceSpan } from "./lib/trace.ts";

/**
 * Bindings exposed to the edge gateway by wrangler.toml.
 * Keep this in sync with the [vars], [[kv_namespaces]], [[queues.producers]],
 * and [[durable_objects.bindings]] entries.
 */
export interface Env {
  // KV
  API_KEYS: KVNamespace;
  SPEND: KVNamespace;
  L1_CACHE: KVNamespace;
  /** Phase 3 S3: prompt template cache. Key: "prompt:{orgId}:{name}:{label}" */
  PROMPTS: KVNamespace;
  /** Phase 3 S2: per-org guardrail policy cache. Key: "guardrail:{orgId}:{name}" */
  GUARDRAILS: KVNamespace;

  // R2
  /** Phase 3 S2: sampled span payloads. Key: spans/{orgId}/{traceId}/{requestId}.json */
  PAYLOAD_BUCKET: R2Bucket;

  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;

  // Queues
  AUDIT_EVENTS: Queue<AuditEvent>;
  USAGE_EVENTS: Queue<UsageEvent>;
  /** Phase 3 S1: trace span events → inference.trace_spans */
  TRACE_EVENTS: Queue<TraceSpan>;

  // Public vars
  OPENROUTER_BASE_URL: string;
  /** Marketplace supplier. Optional: absent means Wokey is simply not
   *  configured, and every route resolves to OpenRouter. */
  WOKEY_BASE_URL?: string;
  SUPABASE_URL: string;
  GATEWAY_VERSION: string;
  ENV: "production" | "preview" | "development";

  // Where the Next.js control plane lives — used by scheduled() to
  // invoke internal endpoints (currently just the serving-pod watchdog).
  CONTROL_PLANE_URL: string;

  // Secrets (populated via `wrangler secret put`)
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENROUTER_PLATFORM_KEY: string;
  WOKEY_PLATFORM_KEY?: string;
  BYOK_DEK: string;
  // For routing fine-tune + BYO models to their per-deployment serving
  // endpoints on the compute provider's serverless layer.
  RUNPOD_API_KEY?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  // Shared cron secret. Two accepted env names — the worker accepts
  // either. Recommended path: set BATCH_PROCESSOR_TOKEN on BOTH the
  // worker (`wrangler secret put BATCH_PROCESSOR_TOKEN`) and Next.js
  // (`.env BATCH_PROCESSOR_TOKEN`) to the same value, so the secret can
  // live in one place. INTERNAL_CRON_TOKEN kept as a fallback for
  // operators who already set it under that name.
  BATCH_PROCESSOR_TOKEN?: string;
  INTERNAL_CRON_TOKEN?: string;
}

/**
 * Resolved authenticated principal — attached to the Hono context after
 * the auth middleware succeeds. Downstream handlers can rely on this being
 * present without re-querying KV.
 */
export interface AuthContext {
  // Rate-limit bucket identity + the on-behalf-of route guard (isOnBehalfOf).
  // For a normal customer key this is the real key id (a UUID). For an
  // on-behalf-of request it's `obo:{orgId}` — a STRING, not a UUID, so it
  // stays per-org for fair rate-limiting instead of one shared global bucket.
  keyId: string;
  // What every route must stamp on UsageEvent.apiKeyId. inference.usage.api_key_id
  // is a plain UUID column — for a normal key this equals `keyId`; for
  // on-behalf-of it's the OBO_API_KEY_ID sentinel (never `keyId` directly,
  // which would fail the INSERT: found live, 2026-07-06 — `obo:{orgId}` isn't
  // a valid UUID and the usage-consumer's insert silently failed/retried).
  usageApiKeyId: string;
  orgId: string;
  // Agent-scope restriction (doc: manager ask 2026-07-08 — per-agent access
  // keys). Null = unrestricted (today's default, and always null for an
  // on-behalf-of identity). Set = agentScopeMiddleware + the agent-run
  // routes restrict this key to running/reading only that one agent.
  agentId: string | null;
  // Public/private tier (doc: manager ask 2026-07-08 — public access keys).
  // "private" (default, and always private for on-behalf-of) = server-to-
  // server, full trace/cost visibility. "public" = safe to embed in a
  // customer's website JS: originCheckMiddleware requires a matching Origin,
  // and agent-runs.ts redacts cost_cents/steps from every response.
  keyTier: "private" | "public";
  // Required (non-null, non-empty) when keyTier is "public" — the DB CHECK
  // constraint (chk_public_key_has_origins) guarantees this at write time.
  allowedOrigins: string[] | null;
  allowedModels: string[] | null; // null = unrestricted
  allowedIpCidrs: string[] | null;
  zdrEnabled: boolean;
  // Per-API-key spend caps (legacy, granular control)
  monthlyBudgetCents: number | null;
  hardCapCents: number | null;
  // Org-level spend caps. The gateway enforces the LOWER of (orgHardCap,
  // keyHardCap) so neither a misconfigured key nor an over-quota org can
  // blow past the agreed ceiling. monthly_budget is informational only.
  orgMonthlyBudgetCents: number | null;
  orgHardCapCents: number | null;
  // Phase 7.C — per-key opt-in to semantic cache. ZDR keys always
  // skip cache regardless of this flag (privacy guarantee).
  semanticCacheEnabled: boolean;
  // Optional org-tuned cosine threshold (0.50..0.99). Null = use the
  // worker's baked-in default (SIMILARITY_THRESHOLD in lib/semantic-cache).
  orgSemanticCacheThreshold: number | null;
  // Phase 1.5 — per-key requests-per-minute override. Null = use the
  // worker's DEFAULT_RPM in rate-limit middleware. Validated in
  // [1, 10000] by the DB CHECK so the middleware can trust the value.
  rateLimitRpm: number | null;
  // Caller's billing election — derived from X-Ahura-Billing header
  // (default: platform). BYOK requires a configured upstream key.
  billing: "platform" | "byok";
  byokProvider?: "openrouter" | "openai" | "anthropic" | "google" | "mistral";
}

export interface AuditEvent {
  orgId: string;
  actorApiKeyId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string; // ISO timestamp
}

export interface UsageEvent {
  orgId: string;
  apiKeyId: string;
  userId: string | null;
  modelId: string;
  modality:
    | "chat"
    | "completion"
    | "embedding"
    | "image"
    | "audio_stt"
    | "audio_tts"
    | "tts"
    | "stt"
    | "video"
    | "music"
    | "ocr"
    | "rerank"
    | "moderation"
    | "realtime"
    | "agent_tool";
  requestId: string;
  billedTo: "platform" | "byok";
  /** Which supplier actually served this request and therefore charged us.
   *  Defaults to 'openrouter', which is what every row was before a second
   *  supplier existed. Without this, upstream_cost_cents is unattributable the
   *  moment a model can be bought from more than one place. */
  provider: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Input tokens served from an upstream prompt cache — billed at the cheap
   *  cached rate. A SUBSET of inputTokens. */
  cachedTokens: number | null;
  /** Input tokens WRITTEN to an upstream prompt cache. Also a subset of
   *  inputTokens, and the expensive one: Anthropic charges 1.25x input for a
   *  5-minute write and 2x for an hour, so a cache write costs MORE than not
   *  caching at all. Null when the upstream does not report it. */
  cacheWriteTokens: number | null;
  numUnits: number | null;
  unitLabel: string | null;
  costCents: number;
  upstreamCostCents: number;
  /** What the SUPPLIER says this request cost us, in cents, when it tells us.
   *  OpenRouter returns `usage.cost` (in credits) on every response including
   *  streaming — authoritative, per-request, and independent of whether our
   *  rate table is synced or even has a row for this modality.
   *
   *  Null when the supplier reports nothing; the rate table is the fallback. */
  reportedUpstreamCostCents: number | null;
  isOffPeak: boolean;
  latencyMs: number;
  ttftMs: number | null;
  status:
    | "success"
    | "error_upstream"
    | "error_rate_limit"
    | "error_budget"
    | "error_auth"
    | "error_validation"
    | "error_internal"
    | "cancelled";
  errorCode: string | null;
  /** Which cache served this request, if any. 'none' for upstream
   *  calls and error paths; 'l1' for the CF KV exact-match cache;
   *  'semantic' for the pgvector similarity cache (Phase 7.C).
   *  Drives the cache-hit-rate aggregation in the usage dashboard. */
  cacheKind: "none" | "l1" | "semantic";
  occurredAt: string;
}

/**
 * Hono variable typing — exposes the resolved AuthContext on c.var.auth.
 */
export type HonoVariables = {
  auth: AuthContext;
  requestId: string;
  startedAt: number;
};
