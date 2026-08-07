/**
 * Env-var loader. Shared fields come from runner-core's loadCoreEnv(); the
 * ft-specific vars are added here. Fails fast at boot if anything required is
 * missing. Don't read process.env anywhere else in the codebase.
 */
import {
  required,
  optional,
  optionalInt,
  loadCoreEnv,
  type CoreRunnerEnv,
} from "@ahura/runner-core";

export interface RunnerEnv extends CoreRunnerEnv {
  // Heartbeat store — Upstash REST (shared with Next.js)
  upstashRedisUrl: string;
  upstashRedisToken: string;

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

  /** Pre-warmed compute-provider Pod Template id; null = use inline image+disk
   *  on every pod create (slower cold pulls). */
  runpodTemplateId: string | null;

  // Optional HF token for gated bases (passed through to pods)
  hfToken: string | null;

  // FT-specific tunables (core supplies maxConcurrentJobs, claimPollIntervalMs,
  // jobLockDurationMs, healthPort).
  monitorPollIntervalMs: number;
  heartbeatStallMs: number;
  consecutiveStallsToKill: number;
  bootGraceMs: number;
}

export function loadEnv(): RunnerEnv {
  return {
    ...loadCoreEnv(),

    upstashRedisUrl: required("UPSTASH_REDIS_REST_URL"),
    upstashRedisToken: required("UPSTASH_REDIS_REST_TOKEN"),

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

    // Optional: a pre-warmed Pod Template id. When set, the compute provider's
    // node-level image cache hits dramatically more often. Leave empty to fall
    // back to inline image+disk+env params. Operator setup: create a Pod
    // Template with imageName=$AXOLOTL_IMAGE_URI, containerDisk=300GB,
    // volumeMount=/workspace/cache, then paste the template id here.
    runpodTemplateId: process.env.RUNPOD_TEMPLATE_ID?.trim() || null,

    hfToken: process.env.HF_TOKEN?.trim() || null,

    monitorPollIntervalMs: optionalInt("MONITOR_POLL_INTERVAL_MS", 15_000),
    heartbeatStallMs: optionalInt("HEARTBEAT_STALL_MS", 90_000),
    consecutiveStallsToKill: optionalInt("CONSECUTIVE_STALLS_TO_KILL", 3),
    // Skip heartbeat-stall counting for this long after a pod is provisioned.
    // RunPod cold-pulls of our 22GB axolotl image regularly take 5-10 min,
    // during which the container can't heartbeat. After grace, normal stall
    // detection kicks in.
    bootGraceMs: optionalInt("BOOT_GRACE_MS", 5 * 60_000),
  };
}
