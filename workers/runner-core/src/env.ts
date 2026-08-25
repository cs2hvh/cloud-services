/**
 * Env-var helpers + the env fields every runner shares. Fails fast at boot if
 * a required var is missing — better to crash-loop in k8s than mis-route work.
 *
 * Each runner composes its own env by spreading loadCoreEnv() and adding its
 * domain-specific vars (RunPod, R2, image tags, …). Keep all process.env reads
 * behind these helpers.
 */

export function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Env var ${name} must be an integer, got "${raw}"`);
  }
  return n;
}

/** The fields shared by every runner's boot path. */
export interface CoreRunnerEnv {
  /** Redis (BullMQ) — IORedis-compatible URL: redis://[:pass]@host:port/db */
  redisUrl: string;
  /** Supabase service-role connection (bypasses RLS). */
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Per-process BullMQ worker concurrency. */
  maxConcurrentJobs: number;
  /** How often the claimer polls Postgres for queued rows. */
  claimPollIntervalMs: number;
  /** BullMQ job lock duration. */
  jobLockDurationMs: number;
  /** Port for the k8s health/readiness probe server. */
  healthPort: number;
}

/** Load the shared core env fields. Runners spread this and add their own. */
export function loadCoreEnv(): CoreRunnerEnv {
  return {
    redisUrl: required("REDIS_URL"),
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    maxConcurrentJobs: optionalInt("MAX_CONCURRENT_JOBS", 4),
    claimPollIntervalMs: optionalInt("CLAIM_POLL_INTERVAL_MS", 5_000),
    jobLockDurationMs: optionalInt("JOB_LOCK_DURATION_MS", 60_000),
    healthPort: optionalInt("HEALTH_PORT", 8080),
  };
}
