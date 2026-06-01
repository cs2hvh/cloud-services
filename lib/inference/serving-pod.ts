/**
 * Per-customer dedicated serving pod lifecycle.
 *
 * This is the server-side wrapper for Phase 11.B Tier 1 managed serving.
 * Each call provisions / inspects / terminates a single GPU compute
 * instance that holds one customer's fine-tune adapter and exposes an
 * OpenAI-compatible inference endpoint.
 *
 * IMPORTANT (internal-only file): the upstream compute provider is
 * RunPod. Keep that detail OUT of any string returned to the customer
 * or surfaced through the API. Customer-facing labels everywhere say
 * "compute instance" / "serving instance" / "GPU pod" — never the
 * vendor name. See feedback_never_reveal_upstream_providers.
 */

import { RunPodClient } from "@/lib/services/runpod/client";
import { GPU_SKU_TO_RUNPOD_TYPE } from "@/lib/inference/finetune-runpod";

// ─── GPU SKU registry (mirrors FT side) ────────────────────────────
//
// Source of truth lives in finetune-runpod.ts; we reuse it so a GPU SKU
// the user already picked for training is guaranteed to be valid for
// serving. If we ever need serving-only SKUs (smaller / cheaper inference
// GPUs), add them here without backfilling the FT map.

const SERVING_CONTAINER_DISK_GB: Record<string, number> = {
  A40: 100,
  L40S: 100,
  "RTX-6000-Ada": 100,
  "A100-40GB": 150,
  "A100-80GB": 200,
  "H100-80GB": 300,
};

// Serving image — same one Phase 10 self-serve uses. Keep in sync with
// infra/runpod/serving-images/vllm-lora/Dockerfile.
const DEFAULT_SERVING_IMAGE =
  process.env.AHURA_SERVING_IMAGE_URI ??
  "ghcr.io/cs2hvh/ahura-ft-serving-vllm:vllm-0.7.3";

// ─── Types ─────────────────────────────────────────────────────────

export interface ProvisionServingPodInput {
  /** The FT job whose adapter this pod will serve. */
  jobId: string;
  /** Hugging Face base model id, passed through as BASE_MODEL env. */
  baseModelId: string;
  /** Short-lived presigned R2 URL for the adapter tarball. The pod
   *  downloads it once at boot, after which the URL can expire. */
  adapterDownloadUrl: string;
  /** Internal SKU the customer picked. Must be in GPU_SKU_TO_RUNPOD_TYPE. */
  gpuSku: string;
  /** Optional HF token if the base model is gated (Llama-3.3, Gemma, etc). */
  hfToken?: string;
}

export interface ProvisionServingPodResult {
  /** Opaque upstream pod id. Stored in inference.finetunes.serving_pod_id
   *  for the operator-side lifecycle calls. NOT exposed to customers. */
  podId: string;
  /** Public HTTPS URL the gateway will forward `/v1/chat/completions` to.
   *  Provider-specific shape (currently RunPod's proxy domain), but the
   *  gateway treats it as an opaque OpenAI-compatible base. */
  servingUrl: string;
  /** Hourly cost in cents, from the upstream provisioning response.
   *  Used for the live cost meter + final session bill. */
  hourlyCostCents: number;
}

interface RunPodCreatePodResponse {
  id: string;
  costPerHr?: number;
  // RunPod exposes a proxy URL for each opened TCP port at
  // https://<podId>-<port>.proxy.runpod.net. We don't need to read it
  // from the response — it's deterministic from the pod id.
}

interface RunPodPodStatusResponse {
  id: string;
  desiredStatus?: string;
  runtime?: {
    uptimeInSeconds?: number;
    ports?: Array<{
      ip?: string;
      isIpPublic?: boolean;
      privatePort?: number;
      publicPort?: number;
      type?: string;
    }>;
  };
}

// ─── Provision ─────────────────────────────────────────────────────

export async function provisionServingPod(
  input: ProvisionServingPodInput
): Promise<ProvisionServingPodResult> {
  const gpuTypeId = GPU_SKU_TO_RUNPOD_TYPE[input.gpuSku];
  if (!gpuTypeId) {
    throw new Error(
      `Unknown GPU SKU "${input.gpuSku}". Pick from: ${Object.keys(GPU_SKU_TO_RUNPOD_TYPE).join(", ")}`
    );
  }
  const containerDiskGb = SERVING_CONTAINER_DISK_GB[input.gpuSku] ?? 100;

  const env: Record<string, string> = {
    BASE_MODEL: input.baseModelId,
    ADAPTER_DOWNLOAD_URL: input.adapterDownloadUrl,
    // SERVED_MODEL_NAME defaults to "adapter" in the image; the gateway
    // rewrites the customer-supplied `model` field to "adapter" before
    // forwarding. Leave the default.
  };
  if (input.hfToken) env.HF_TOKEN = input.hfToken;

  const body = {
    // Internal name — visible to operator in upstream console only.
    name: `ahura-serve-${input.jobId.slice(0, 8)}`,
    imageName: DEFAULT_SERVING_IMAGE,
    gpuTypeIds: [gpuTypeId],
    gpuCount: 1,
    cloudType: "SECURE", // dedicated host; never run customer adapters on spot/community
    containerDiskInGb: containerDiskGb,
    // No persistent volume needed for serving — adapter is downloaded
    // fresh each boot from R2 (cheap, ~1GB).
    volumeInGb: 0,
    // Expose vLLM's openai-server port. RunPod publishes a proxy URL
    // automatically at https://<podId>-8000.proxy.runpod.net.
    ports: ["8000/http"],
    supportPublicIp: false,
    env,
  };

  const resp = await RunPodClient.rest<RunPodCreatePodResponse>("POST", "/pods", body);

  // Compute proxy URL deterministically from the pod id. RunPod's docs
  // guarantee this shape for any /http port that's opened on a pod.
  const servingUrl = `https://${resp.id}-8000.proxy.runpod.net`;
  const hourlyCostCents = resp.costPerHr ? Math.ceil(resp.costPerHr * 100) : 0;

  return {
    podId: resp.id,
    servingUrl,
    hourlyCostCents,
  };
}

// ─── Status ────────────────────────────────────────────────────────

export type ServingPodLiveState =
  | "provisioning"
  | "running"
  | "stopped"
  | "failed"
  | "gone";

export interface ServingPodStatusResult {
  state: ServingPodLiveState;
  uptimeSeconds: number | null;
}

export async function getServingPodStatus(podId: string): Promise<ServingPodStatusResult> {
  try {
    const resp = await RunPodClient.rest<RunPodPodStatusResponse>("GET", `/pods/${podId}`);
    const ds = (resp.desiredStatus ?? "").toUpperCase();
    const uptimeSeconds = resp.runtime?.uptimeInSeconds ?? null;
    if (ds === "RUNNING") return { state: "running", uptimeSeconds };
    if (ds === "EXITED" || ds === "STOPPED") return { state: "stopped", uptimeSeconds };
    if (ds === "TERMINATED") return { state: "gone", uptimeSeconds };
    if (ds === "PROVISIONING" || ds === "CREATED" || ds === "STARTING") {
      return { state: "provisioning", uptimeSeconds: null };
    }
    return { state: "failed", uptimeSeconds: null };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") {
      return { state: "gone", uptimeSeconds: null };
    }
    throw err;
  }
}

// ─── Terminate ─────────────────────────────────────────────────────

export async function terminateServingPod(podId: string): Promise<void> {
  try {
    await RunPodClient.rest("DELETE", `/pods/${podId}`);
  } catch (err) {
    // 404 = already gone, treat as success
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") return;
    throw err;
  }
}

/**
 * Translate any vendor-specific error into a generic customer-facing
 * message. Use this on every call site that surfaces an error to the
 * dashboard or API response — never let "RunPod" or vendor codes leak.
 */
export function sanitizeProvisionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Common upstream patterns → generic copy
  if (/no instances available|capacity|out of stock/i.test(raw)) {
    return "No GPU capacity available for the selected size right now. Pick a different GPU or try again in a few minutes.";
  }
  if (/quota|limit/i.test(raw)) {
    return "Your compute quota has been reached. Stop a running instance or contact support to raise the limit.";
  }
  if (/auth|unauthor|forbidden/i.test(raw)) {
    return "Compute provisioning failed due to a platform configuration error. Our team has been notified.";
  }
  return "Could not provision a serving instance. Try again in a moment, or pick a different GPU size.";
}
