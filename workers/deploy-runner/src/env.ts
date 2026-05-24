/**
 * Env-var loader + validator. Same fail-fast pattern as ft-runner.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Env var ${name} must be an integer, got "${raw}"`);
  }
  return n;
}

export interface RunnerEnv {
  redisUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  runpodApiKey: string;
  runpodRestUrl: string;

  /** Default serving endpoint id for LoRA adapters. Unrelated to BYO but
   *  inserted on registered models so the inference gateway can route. */
  loraServingEndpointId: string | null;

  maxConcurrentJobs: number;
  claimPollIntervalMs: number;
  readyPollIntervalMs: number;
  readyTimeoutMs: number;
  jobLockDurationMs: number;
  healthPort: number;
}

export function loadEnv(): RunnerEnv {
  return {
    redisUrl: required("REDIS_URL"),
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    runpodApiKey: required("RUNPOD_API_KEY"),
    runpodRestUrl: optional("RUNPOD_REST_URL", "https://rest.runpod.io/v1"),
    loraServingEndpointId: process.env.LORA_SERVING_ENDPOINT_ID?.trim() || null,

    maxConcurrentJobs: optionalInt("MAX_CONCURRENT_JOBS", 4),
    claimPollIntervalMs: optionalInt("CLAIM_POLL_INTERVAL_MS", 5_000),
    readyPollIntervalMs: optionalInt("READY_POLL_INTERVAL_MS", 10_000),
    readyTimeoutMs: optionalInt("READY_TIMEOUT_MS", 30 * 60_000), // 30 min build budget
    jobLockDurationMs: optionalInt("JOB_LOCK_DURATION_MS", 60_000),
    healthPort: optionalInt("HEALTH_PORT", 8080),
  };
}
