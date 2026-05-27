/**
 * RunPod wrapper for fine-tuning operations.
 *
 * Used by the BullMQ ft-runner (workers/ft-runner/) to provision pods
 * that run our axolotl training image. Wraps the lower-level
 * lib/services/runpod/client.ts directly — does NOT go through the
 * marketplace pod-lifecycle-operations.ts because FT pods are platform-
 * internal (not user-visible GPU rentals).
 *
 * Single source of truth for: GPU SKU → RunPod gpuTypeId mapping,
 * image URI defaulting, env-var contract for the training container.
 */

import { RunPodClient } from "@/lib/services/runpod/client";

// ─── GPU SKU → RunPod IDs ──────────────────────────────────────────────
//
// These map our public `gpu_sku` enum (in inference.finetunes) to the
// exact RunPod gpuTypeId strings their API expects. Keep this dictionary
// in sync with `GPU_OPTIONS` in components/dashboard/inference/fine-tuning.tsx
// and the validation list in app/api/inference/fine-tuning/jobs/route.ts.

export const GPU_SKU_TO_RUNPOD_TYPE: Record<string, string> = {
  "A40": "NVIDIA A40",
  "L40S": "NVIDIA L40S",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
  "A100-40GB": "NVIDIA A100-PCIE-40GB",
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
};

// Suggested per-GPU container disk size (GB). Bigger for jobs that
// store multiple checkpoints + base model weights + dataset.
const CONTAINER_DISK_GB: Record<string, number> = {
  "A40": 100,
  "L40S": 100,
  "RTX-6000-Ada": 100,
  "A100-40GB": 200,
  "A100-80GB": 300,
  "H100-80GB": 400,
};

// ─── Types ─────────────────────────────────────────────────────────────

export interface ProvisionFineTunePodInput {
  jobId: string;
  baseModelId: string;
  method: "lora" | "qlora" | "full";
  datasetUrl: string;
  hyperparams: Record<string, unknown>;
  gpuSku: string;
  outputR2Prefix: string;
  /** Webhook URL the training container will POST completion to. */
  webhookUrl: string;
  /** HMAC secret shared with control plane for signing the webhook payload. */
  webhookSecret: string;
  /** R2 credentials for dataset download + adapter upload. */
  r2: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
  };
  /** Optional HF token for pulling gated bases. */
  hfToken?: string;
}

export interface ProvisionFineTunePodResult {
  podId: string;
  imageName: string;
  gpuTypeId: string;
  hourlyCostUsd: number | null;
}

interface RunPodPodResponse {
  id: string;
  desiredStatus?: string;
  costPerHr?: number;
}

interface RunPodPodStatusResponse {
  id: string;
  desiredStatus?: string;
  lastStatusChange?: string;
  runtime?: { uptimeInSeconds?: number };
}

// ─── Provision ─────────────────────────────────────────────────────────

export async function provisionFineTunePod(
  input: ProvisionFineTunePodInput
): Promise<ProvisionFineTunePodResult> {
  const gpuTypeId = GPU_SKU_TO_RUNPOD_TYPE[input.gpuSku];
  if (!gpuTypeId) {
    throw new Error(
      `Unknown GPU SKU "${input.gpuSku}". Known: ${Object.keys(GPU_SKU_TO_RUNPOD_TYPE).join(", ")}`
    );
  }

  const imageName =
    process.env.AHURA_FT_AXOLOTL_IMAGE_URI ??
    "ghcr.io/hav0ky/ahura-ft-axolotl:axolotl-0.29.0";

  const containerDiskGb = CONTAINER_DISK_GB[input.gpuSku] ?? 100;

  const body = {
    name: `ahura-ft-${input.jobId.slice(0, 8)}`,
    imageName,
    gpuTypeIds: [gpuTypeId],
    gpuCount: 1,
    cloudType: "SECURE", // SECURE = dedicated host; COMMUNITY = spot
    containerDiskInGb: containerDiskGb,
    volumeInGb: 100,
    volumeMountPath: "/workspace/cache",
    env: buildEnv(input),
    // Don't expose any ports — the container POSTs out, no inbound needed
    ports: [],
    supportPublicIp: false,
  };

  const resp = await RunPodClient.rest<RunPodPodResponse>("POST", "/pods", body);

  return {
    podId: resp.id,
    imageName,
    gpuTypeId,
    hourlyCostUsd: resp.costPerHr ?? null,
  };
}

// ─── Status / lifecycle ────────────────────────────────────────────────

export type FineTunePodStatus =
  | "PROVISIONING"
  | "RUNNING"
  | "EXITED"
  | "TERMINATED"
  | "UNKNOWN";

export async function getFineTunePodStatus(podId: string): Promise<FineTunePodStatus> {
  try {
    const resp = await RunPodClient.rest<RunPodPodStatusResponse>("GET", `/pods/${podId}`);
    const ds = (resp.desiredStatus ?? "").toUpperCase();
    if (ds === "RUNNING") return "RUNNING";
    if (ds === "EXITED" || ds === "STOPPED") return "EXITED";
    if (ds === "TERMINATED") return "TERMINATED";
    if (ds === "PROVISIONING" || ds === "CREATED" || ds === "STARTING") return "PROVISIONING";
    return "UNKNOWN";
  } catch (err) {
    // 404 likely means the pod was already torn down — treat as terminated
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") {
      return "TERMINATED";
    }
    throw err;
  }
}

export async function terminateFineTunePod(podId: string): Promise<void> {
  try {
    await RunPodClient.rest("DELETE", `/pods/${podId}`);
  } catch (err) {
    // Already gone = success
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") {
      return;
    }
    throw err;
  }
}

// ─── Env builder ───────────────────────────────────────────────────────

/**
 * Build the environment-variable dict the training container's train.sh
 * expects. Keep field names exactly in sync with
 * infra/runpod/training-images/axolotl/train.sh.
 */
function buildEnv(input: ProvisionFineTunePodInput): Record<string, string> {
  const env: Record<string, string> = {
    JOB_ID: input.jobId,
    BASE_MODEL: input.baseModelId,
    METHOD: input.method,
    DATASET_URL: input.datasetUrl,
    HYPERPARAMS_JSON: JSON.stringify(input.hyperparams),
    OUTPUT_R2_PREFIX: input.outputR2Prefix,
    WEBHOOK_URL: input.webhookUrl,
    WEBHOOK_SECRET: input.webhookSecret,
    R2_ACCESS_KEY_ID: input.r2.accessKeyId,
    R2_SECRET_ACCESS_KEY: input.r2.secretAccessKey,
    R2_ENDPOINT: input.r2.endpoint,
  };
  if (input.hfToken) env.HF_TOKEN = input.hfToken;
  return env;
}
