/**
 * RunPod Serverless wrapper for BYO Model Deploy.
 *
 * Uses RunPod Serverless endpoints (NOT Pods — that's for fine-tuning where
 * we want a long-lived training process). Serverless gives us autoscale-to-
 * zero, per-request billing, and load-balanced cold/warm workers — the right
 * primitive for inference traffic with variable QPS.
 *
 * Reads the existing RunPodClient for auth + retries.
 */

import { RunPodClient } from "@/lib/services/runpod/client";

export const GPU_SKU_TO_RUNPOD_TYPE: Record<string, string> = {
  A40: "NVIDIA A40",
  L40S: "NVIDIA L40S",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
  "A100-40GB": "NVIDIA A100-PCIE-40GB",
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
};

// Cold-start cost prediction: networking, container start, model load.
// We pre-warm by setting min_workers ≥ 1 if the customer pays the always-on tier.
const DEFAULT_CONTAINER_DISK_GB = 50;

export interface AutoscaleConfig {
  min_workers: number;
  max_workers: number;
  idle_timeout_s: number;
}

export interface CreateServerlessEndpointInput {
  name: string;
  imageUri: string;
  gpuSku: string;
  autoscale: AutoscaleConfig;
  /** Container env vars. Things like HF_TOKEN, MODEL_REVISION go here. */
  env: Record<string, string>;
  /** Container start command override. Empty array = use Dockerfile CMD. */
  startCommand?: string[];
  /** Container port the inference server listens on (passed as HTTP_PORT env). */
  port?: number;
}

export interface ServerlessEndpoint {
  id: string;
  name: string;
  status: "PENDING" | "READY" | "DEGRADED" | "UNKNOWN";
  workersMin: number;
  workersMax: number;
  workersIdleTimeoutS: number;
  imageUri: string;
  gpuTypeId: string;
  url: string;
}

interface RunPodEndpointResponse {
  id: string;
  name?: string;
  templateId?: string;
  workersMin?: number;
  workersMax?: number;
  workersStandby?: number;
  idleTimeout?: number;
  status?: string;
  url?: string;
}

interface RunPodTemplateResponse {
  id: string;
  name?: string;
  imageName?: string;
  containerDiskInGb?: number;
}

// ── Create ──────────────────────────────────────────────────────────

export async function createServerlessEndpoint(
  input: CreateServerlessEndpointInput
): Promise<ServerlessEndpoint> {
  const gpuTypeId = GPU_SKU_TO_RUNPOD_TYPE[input.gpuSku];
  if (!gpuTypeId) {
    throw new Error(
      `Unknown GPU SKU "${input.gpuSku}". Allowed: ${Object.keys(GPU_SKU_TO_RUNPOD_TYPE).join(", ")}`
    );
  }

  // RunPod Serverless wants a Template (image+disk+env baseline) and then an
  // Endpoint (template + GPU + autoscaler config). We create both in sequence.
  const envArray = Object.entries({
    ...input.env,
    ...(input.port ? { HTTP_PORT: String(input.port) } : {}),
  }).map(([key, value]) => ({ key, value }));

  // 1. Template
  const template = await RunPodClient.rest<RunPodTemplateResponse>("POST", "/templates", {
    name: `${input.name}-tmpl`,
    imageName: input.imageUri,
    containerDiskInGb: DEFAULT_CONTAINER_DISK_GB,
    env: envArray,
    isServerless: true,
    ...(input.startCommand?.length ? { dockerArgs: input.startCommand.join(" ") } : {}),
  });

  // 2. Endpoint
  const endpoint = await RunPodClient.rest<RunPodEndpointResponse>("POST", "/endpoints", {
    name: input.name,
    templateId: template.id,
    gpuTypeIds: [gpuTypeId],
    gpuCount: 1,
    workersMin: input.autoscale.min_workers,
    workersMax: input.autoscale.max_workers,
    idleTimeout: input.autoscale.idle_timeout_s,
    networkVolumeId: null,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
    flashboot: true,
  });

  return {
    id: endpoint.id,
    name: input.name,
    status: parseStatus(endpoint.status),
    workersMin: endpoint.workersMin ?? input.autoscale.min_workers,
    workersMax: endpoint.workersMax ?? input.autoscale.max_workers,
    workersIdleTimeoutS: endpoint.idleTimeout ?? input.autoscale.idle_timeout_s,
    imageUri: input.imageUri,
    gpuTypeId,
    url: endpoint.url ?? `https://api.runpod.ai/v2/${endpoint.id}`,
  };
}

// ── Read ────────────────────────────────────────────────────────────

export async function getServerlessEndpoint(endpointId: string): Promise<ServerlessEndpoint | null> {
  try {
    const resp = await RunPodClient.rest<RunPodEndpointResponse>("GET", `/endpoints/${endpointId}`);
    return {
      id: resp.id,
      name: resp.name ?? "",
      status: parseStatus(resp.status),
      workersMin: resp.workersMin ?? 0,
      workersMax: resp.workersMax ?? 0,
      workersIdleTimeoutS: resp.idleTimeout ?? 0,
      imageUri: "", // not returned on GET — caller already has it from DB
      gpuTypeId: "",
      url: resp.url ?? `https://api.runpod.ai/v2/${endpointId}`,
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") {
      return null;
    }
    throw err;
  }
}

// ── Update (scale) ──────────────────────────────────────────────────

export async function scaleServerlessEndpoint(
  endpointId: string,
  autoscale: AutoscaleConfig
): Promise<void> {
  await RunPodClient.rest("PATCH", `/endpoints/${endpointId}`, {
    workersMin: autoscale.min_workers,
    workersMax: autoscale.max_workers,
    idleTimeout: autoscale.idle_timeout_s,
  });
}

// ── Delete ──────────────────────────────────────────────────────────

export async function deleteServerlessEndpoint(endpointId: string): Promise<void> {
  try {
    await RunPodClient.rest("DELETE", `/endpoints/${endpointId}`);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") {
      return; // already gone
    }
    throw err;
  }
}

// ── helpers ─────────────────────────────────────────────────────────

function parseStatus(s: string | undefined): ServerlessEndpoint["status"] {
  const upper = (s ?? "").toUpperCase();
  if (upper === "READY" || upper === "RUNNING" || upper === "ACTIVE") return "READY";
  if (upper === "PENDING" || upper === "INITIALIZING" || upper === "BUILDING") return "PENDING";
  if (upper === "DEGRADED" || upper === "ERROR") return "DEGRADED";
  return "UNKNOWN";
}
