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

  /** AES-256-GCM data encryption key — base64-encoded 32 bytes. Must
   *  match the value set on the Next.js dashboard process; sharing
   *  the same DEK lets the runner decrypt HF tokens that the
   *  dashboard encrypted at create time. Optional because deployments
   *  with no hf_token_encrypted don't need it; required at use site
   *  for HF deploys with a token. */
  byokDek: string | null;

  /** Worker image used to materialize a HuggingFace deploy at runtime.
   *  Today we use runpod's published vLLM worker which accepts MODEL_NAME
   *  + HF_TOKEN at boot and exposes OpenAI-compatible HTTP on port 8000.
   *  Pinned to a specific tag in env so we don't get surprise behavior
   *  changes on `:latest`. */
  hfWorkerImage: string;

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
    byokDek: process.env.BYOK_DEK?.trim() || null,
    hfWorkerImage: optional("HF_WORKER_IMAGE", "runpod/worker-v1-vllm:stable"),

    maxConcurrentJobs: optionalInt("MAX_CONCURRENT_JOBS", 4),
    claimPollIntervalMs: optionalInt("CLAIM_POLL_INTERVAL_MS", 5_000),
    readyPollIntervalMs: optionalInt("READY_POLL_INTERVAL_MS", 10_000),
    readyTimeoutMs: optionalInt("READY_TIMEOUT_MS", 30 * 60_000), // 30 min build budget
    jobLockDurationMs: optionalInt("JOB_LOCK_DURATION_MS", 60_000),
    healthPort: optionalInt("HEALTH_PORT", 8080),
  };
}
