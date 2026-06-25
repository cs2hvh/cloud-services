/**
 * Env-var loader. Shared fields come from runner-core's loadCoreEnv(); the
 * deploy-specific vars are added here. Same fail-fast pattern as before.
 */
import {
  required,
  optional,
  optionalInt,
  loadCoreEnv,
  type CoreRunnerEnv,
} from "@ahura/runner-core";

export interface RunnerEnv extends CoreRunnerEnv {
  runpodApiKey: string;
  runpodRestUrl: string;

  /** Default serving endpoint id for LoRA adapters. Unrelated to BYO but
   *  inserted on registered models so the inference gateway can route. */
  loraServingEndpointId: string | null;

  /** AES-256-GCM data encryption key — base64-encoded 32 bytes. Must match
   *  the value set on the Next.js dashboard process so the runner can decrypt
   *  HF tokens the dashboard encrypted at create time. Optional because
   *  deployments with no hf_token_encrypted don't need it. */
  byokDek: string | null;

  /** Worker image used to materialize a HuggingFace deploy at runtime. Pinned
   *  to a specific tag so we don't get surprise behavior changes on :latest. */
  hfWorkerImage: string;

  // Deploy-specific tunables (core supplies maxConcurrentJobs,
  // claimPollIntervalMs, jobLockDurationMs, healthPort).
  readyPollIntervalMs: number;
  readyTimeoutMs: number;
}

export function loadEnv(): RunnerEnv {
  return {
    ...loadCoreEnv(),

    runpodApiKey: required("RUNPOD_API_KEY"),
    runpodRestUrl: optional("RUNPOD_REST_URL", "https://rest.runpod.io/v1"),
    loraServingEndpointId: process.env.LORA_SERVING_ENDPOINT_ID?.trim() || null,
    byokDek: process.env.BYOK_DEK?.trim() || null,
    hfWorkerImage: optional("HF_WORKER_IMAGE", "runpod/worker-v1-vllm:stable"),

    readyPollIntervalMs: optionalInt("READY_POLL_INTERVAL_MS", 10_000),
    readyTimeoutMs: optionalInt("READY_TIMEOUT_MS", 30 * 60_000), // 30 min build budget
  };
}
