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

  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;

  // Queues
  AUDIT_EVENTS: Queue<AuditEvent>;
  USAGE_EVENTS: Queue<UsageEvent>;

  // Public vars
  OPENROUTER_BASE_URL: string;
  SUPABASE_URL: string;
  GATEWAY_VERSION: string;
  ENV: "production" | "preview" | "development";

  // Where the Next.js control plane lives — used by scheduled() to
  // invoke internal endpoints (currently just the serving-pod watchdog).
  CONTROL_PLANE_URL: string;

  // Secrets (populated via `wrangler secret put`)
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENROUTER_PLATFORM_KEY: string;
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
  keyId: string;
  orgId: string;
  allowedModels: string[] | null; // null = unrestricted
  allowedIpCidrs: string[] | null;
  zdrEnabled: boolean;
  monthlyBudgetCents: number | null;
  hardCapCents: number | null;
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
  modality: "chat" | "completion" | "embedding" | "image" | "audio_stt" | "audio_tts" | "video" | "rerank";
  requestId: string;
  billedTo: "platform" | "byok";
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  numUnits: number | null;
  unitLabel: string | null;
  costCents: number;
  upstreamCostCents: number;
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
