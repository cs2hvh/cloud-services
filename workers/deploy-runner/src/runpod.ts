/**
 * RunPod Serverless wrapper. Inlined for the same packaging reason as the
 * ft-runner — this worker ships to its own container and can't reach the
 * Next.js workspace at build time.
 *
 * Mirror of lib/inference/deploy-runpod.ts. If you change one, change the
 * other or extract them into a shared @ahura/runpod package.
 */
import axios, { type AxiosError } from "axios";
import type { RunnerEnv } from "./env.js";
import { logger } from "./logger.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export const GPU_SKU_TO_RUNPOD_TYPE: Record<string, string> = {
  A40: "NVIDIA A40",
  L40S: "NVIDIA L40S",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
  "A100-40GB": "NVIDIA A100-PCIE-40GB",
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
};

const DEFAULT_CONTAINER_DISK_GB = 50;

export interface AutoscaleConfig {
  min_workers: number;
  max_workers: number;
  idle_timeout_s: number;
}

export interface CreateEndpointInput {
  name: string;
  imageUri: string;
  gpuSku: string;
  autoscale: AutoscaleConfig;
  env: Record<string, string>;
  port?: number;
}

export interface ServerlessEndpoint {
  id: string;
  status: "PENDING" | "READY" | "DEGRADED" | "UNKNOWN";
  workersMin: number;
  workersMax: number;
  url: string;
}

interface RunPodEndpointResponse {
  id: string;
  name?: string;
  templateId?: string;
  workersMin?: number;
  workersMax?: number;
  idleTimeout?: number;
  status?: string;
  url?: string;
}

interface RunPodTemplateResponse {
  id: string;
}

export class RunPod {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(env: RunnerEnv) {
    this.baseUrl = env.runpodRestUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${env.runpodApiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createEndpoint(input: CreateEndpointInput): Promise<ServerlessEndpoint> {
    // gpu_sku now carries the verbatim RunPod gpuTypeId (gpu_catalog.runpod_gpu_id),
    // so pass it through directly. Legacy rows hold a short SKU — map those.
    const gpuTypeId = GPU_SKU_TO_RUNPOD_TYPE[input.gpuSku] ?? input.gpuSku;
    if (!gpuTypeId) {
      throw new Error("Deployment is missing a GPU type");
    }

    const envArray = Object.entries({
      ...input.env,
      ...(input.port ? { HTTP_PORT: String(input.port) } : {}),
    }).map(([key, value]) => ({ key, value }));

    // Template first
    const template = await this.withRetry(() =>
      axios.post<RunPodTemplateResponse>(
        `${this.baseUrl}/templates`,
        {
          name: `${input.name}-tmpl`,
          imageName: input.imageUri,
          containerDiskInGb: DEFAULT_CONTAINER_DISK_GB,
          env: envArray,
          isServerless: true,
        },
        { headers: this.headers, timeout: DEFAULT_TIMEOUT_MS }
      )
    );

    // Endpoint second
    const endpoint = await this.withRetry(() =>
      axios.post<RunPodEndpointResponse>(
        `${this.baseUrl}/endpoints`,
        {
          name: input.name,
          templateId: template.data.id,
          gpuTypeIds: [gpuTypeId],
          gpuCount: 1,
          workersMin: input.autoscale.min_workers,
          workersMax: input.autoscale.max_workers,
          idleTimeout: input.autoscale.idle_timeout_s,
          scalerType: "QUEUE_DELAY",
          scalerValue: 4,
          flashboot: true,
        },
        { headers: this.headers, timeout: DEFAULT_TIMEOUT_MS }
      )
    );

    return {
      id: endpoint.data.id,
      status: parseStatus(endpoint.data.status),
      workersMin: endpoint.data.workersMin ?? input.autoscale.min_workers,
      workersMax: endpoint.data.workersMax ?? input.autoscale.max_workers,
      url: endpoint.data.url ?? `https://api.runpod.ai/v2/${endpoint.data.id}`,
    };
  }

  async getEndpoint(endpointId: string): Promise<ServerlessEndpoint | null> {
    try {
      const resp = await this.withRetry(() =>
        axios.get<RunPodEndpointResponse>(`${this.baseUrl}/endpoints/${endpointId}`, {
          headers: this.headers,
          timeout: DEFAULT_TIMEOUT_MS,
        })
      );
      return {
        id: resp.data.id,
        status: parseStatus(resp.data.status),
        workersMin: resp.data.workersMin ?? 0,
        workersMax: resp.data.workersMax ?? 0,
        url: resp.data.url ?? `https://api.runpod.ai/v2/${endpointId}`,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async scaleEndpoint(endpointId: string, autoscale: AutoscaleConfig): Promise<void> {
    await this.withRetry(() =>
      axios.patch(
        `${this.baseUrl}/endpoints/${endpointId}`,
        {
          workersMin: autoscale.min_workers,
          workersMax: autoscale.max_workers,
          idleTimeout: autoscale.idle_timeout_s,
        },
        { headers: this.headers, timeout: DEFAULT_TIMEOUT_MS }
      )
    );
  }

  async deleteEndpoint(endpointId: string): Promise<void> {
    try {
      await this.withRetry(() =>
        axios.delete(`${this.baseUrl}/endpoints/${endpointId}`, {
          headers: this.headers,
          timeout: DEFAULT_TIMEOUT_MS,
        })
      );
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt < MAX_RETRIES) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err)) throw err;
        const base = 500 * Math.pow(3, attempt);
        const jitter = base * (Math.random() * 0.5 - 0.25);
        logger.warn(
          { attempt, err: errString(err) },
          "RunPod call failed — retrying"
        );
        await sleep(Math.max(0, base + jitter));
        attempt += 1;
      }
    }
    throw lastErr ?? new Error("RunPod retries exhausted");
  }
}

function parseStatus(s: string | undefined): ServerlessEndpoint["status"] {
  const upper = (s ?? "").toUpperCase();
  if (upper === "READY" || upper === "RUNNING" || upper === "ACTIVE") return "READY";
  if (upper === "PENDING" || upper === "INITIALIZING" || upper === "BUILDING") return "PENDING";
  if (upper === "DEGRADED" || upper === "ERROR") return "DEGRADED";
  return "UNKNOWN";
}

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const ax = err as AxiosError;
  const status = ax.response?.status;
  if (status === undefined) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

function errString(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return `${err.message} (status=${err.response?.status ?? "?"})`;
  }
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
