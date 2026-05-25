/**
 * Env-var loader + validator. Fails fast at boot if anything required is
 * missing — better to crash-loop in k8s than silently mis-route training pods.
 *
 * Every value the runner needs flows through here. Don't read process.env
 * anywhere else in the codebase.
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
  // Redis (BullMQ) — IORedis-compatible URL: redis://[:pass]@host:port/db
  redisUrl: string;

  // Heartbeat store — Upstash REST (shared with Next.js)
  upstashRedisUrl: string;
  upstashRedisToken: string;

  // Supabase
  supabaseUrl: string;
  supabaseServiceRoleKey: string;

  // RunPod
  runpodApiKey: string;
  runpodRestUrl: string;

  // Webhooks / control plane
  controlPlaneUrl: string;
  ftWebhookSecret: string;

  // R2 (passed through to training pods)
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Endpoint: string;

  // Training image
  axolotlImageUri: string;

  // Optional HF token for gated bases (passed through to pods)
  hfToken: string | null;

  // Tunables
  maxConcurrentJobs: number;
  claimPollIntervalMs: number;
  monitorPollIntervalMs: number;
  heartbeatStallMs: number;
  consecutiveStallsToKill: number;
  bootGraceMs: number;
  jobLockDurationMs: number;
  healthPort: number;
}

export function loadEnv(): RunnerEnv {
  return {
    redisUrl: required("REDIS_URL"),

    upstashRedisUrl: required("UPSTASH_REDIS_REST_URL"),
    upstashRedisToken: required("UPSTASH_REDIS_REST_TOKEN"),

    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

    runpodApiKey: required("RUNPOD_API_KEY"),
    runpodRestUrl: optional("RUNPOD_REST_URL", "https://rest.runpod.io/v1"),

    controlPlaneUrl: required("CONTROL_PLANE_URL").replace(/\/+$/, ""),
    ftWebhookSecret: required("FT_WEBHOOK_SECRET"),

    r2AccessKeyId: required("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    r2Endpoint: required("R2_ENDPOINT"),

    axolotlImageUri: optional(
      "AXOLOTL_IMAGE_URI",
      "ghcr.io/hav0ky/ahura-ft-axolotl:axolotl-0.29.0"
    ),

    hfToken: process.env.HF_TOKEN?.trim() || null,

    maxConcurrentJobs: optionalInt("MAX_CONCURRENT_JOBS", 4),
    claimPollIntervalMs: optionalInt("CLAIM_POLL_INTERVAL_MS", 5_000),
    monitorPollIntervalMs: optionalInt("MONITOR_POLL_INTERVAL_MS", 15_000),
    heartbeatStallMs: optionalInt("HEARTBEAT_STALL_MS", 90_000),
    consecutiveStallsToKill: optionalInt("CONSECUTIVE_STALLS_TO_KILL", 3),
    // Skip heartbeat-stall counting for this long after a pod is provisioned.
    // RunPod cold-pulls of our 22GB axolotl image regularly take 5-10 min,
    // during which the training container hasn't started and can't send
    // heartbeats. Without this grace window we'd kill every pod mid-pull.
    // After grace expires, normal stall detection kicks in.
    bootGraceMs: optionalInt("BOOT_GRACE_MS", 5 * 60_000),
    jobLockDurationMs: optionalInt("JOB_LOCK_DURATION_MS", 60_000),
    healthPort: optionalInt("HEALTH_PORT", 8080),
  };
}
