/**
 * RunPod REST wrapper — inlined here (not imported from lib/services/runpod)
 * because this package ships independently to its own image and can't reach
 * the Next.js workspace at build time.
 *
 * Keep the GPU SKU mapping in sync with lib/inference/finetune-runpod.ts.
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

// Per-GPU container disk size (GB). Bigger GPUs train bigger bases that need
// more room for weights + checkpoints + dataset cache.
const CONTAINER_DISK_GB: Record<string, number> = {
  A40: 100,
  L40S: 100,
  "RTX-6000-Ada": 100,
  "A100-40GB": 200,
  "A100-80GB": 300,
  "H100-80GB": 400,
};

export type PodStatus =
  | "PROVISIONING"
  | "RUNNING"
  | "EXITED"
  | "TERMINATED"
  | "UNKNOWN";

export interface ProvisionInput {
  jobId: string;
  baseModelId: string;
  method: "lora" | "qlora" | "full";
  datasetUrl: string;
  hyperparams: Record<string, unknown>;
  gpuSku: string;
  outputR2Prefix: string;
  webhookUrl: string;
  heartbeatUrl: string;
  webhookSecret: string;
  r2: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
  };
  hfToken: string | null;
  imageUri: string;
}

export interface ProvisionResult {
  podId: string;
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
  runtime?: { uptimeInSeconds?: number };
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

  async createPod(input: ProvisionInput): Promise<ProvisionResult> {
    const gpuTypeId = GPU_SKU_TO_RUNPOD_TYPE[input.gpuSku];
    if (!gpuTypeId) {
      throw new Error(
        `Unknown GPU SKU "${input.gpuSku}". Known: ${Object.keys(GPU_SKU_TO_RUNPOD_TYPE).join(", ")}`
      );
    }

    const body = {
      name: `ahura-ft-${input.jobId.slice(0, 8)}`,
      imageName: input.imageUri,
      gpuTypeIds: [gpuTypeId],
      gpuCount: 1,
      cloudType: "SECURE",
      containerDiskInGb: CONTAINER_DISK_GB[input.gpuSku] ?? 100,
      volumeInGb: 100,
      volumeMountPath: "/workspace/cache",
      env: buildPodEnv(input),
      ports: [] as string[],
      supportPublicIp: false,
    };

    const resp = await this.withRetry(() =>
      axios.post<RunPodPodResponse>(`${this.baseUrl}/pods`, body, {
        headers: this.headers,
        timeout: DEFAULT_TIMEOUT_MS,
      })
    );

    return {
      podId: resp.data.id,
      gpuTypeId,
      hourlyCostUsd: resp.data.costPerHr ?? null,
    };
  }

  async getPodStatus(podId: string): Promise<PodStatus> {
    try {
      const resp = await this.withRetry(() =>
        axios.get<RunPodPodStatusResponse>(`${this.baseUrl}/pods/${podId}`, {
          headers: this.headers,
          timeout: DEFAULT_TIMEOUT_MS,
        })
      );
      const ds = (resp.data.desiredStatus ?? "").toUpperCase();
      if (ds === "RUNNING") return "RUNNING";
      if (ds === "EXITED" || ds === "STOPPED") return "EXITED";
      if (ds === "TERMINATED") return "TERMINATED";
      if (ds === "PROVISIONING" || ds === "CREATED" || ds === "STARTING")
        return "PROVISIONING";
      return "UNKNOWN";
    } catch (err) {
      if (isNotFound(err)) return "TERMINATED";
      throw err;
    }
  }

  async terminatePod(podId: string): Promise<void> {
    try {
      await this.withRetry(() =>
        axios.delete(`${this.baseUrl}/pods/${podId}`, {
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
        const delay = Math.max(0, base + jitter);
        logger.warn(
          { attempt, delay, err: errString(err) },
          "RunPod call failed — retrying"
        );
        await sleep(delay);
        attempt += 1;
      }
    }
    throw lastErr ?? new Error("RunPod retries exhausted");
  }
}

function buildPodEnv(input: ProvisionInput): Record<string, string> {
  const env: Record<string, string> = {
    JOB_ID: input.jobId,
    BASE_MODEL: input.baseModelId,
    METHOD: input.method,
    DATASET_URL: input.datasetUrl,
    HYPERPARAMS_JSON: JSON.stringify(input.hyperparams),
    OUTPUT_R2_PREFIX: input.outputR2Prefix,
    WEBHOOK_URL: input.webhookUrl,
    HEARTBEAT_URL: input.heartbeatUrl,
    WEBHOOK_SECRET: input.webhookSecret,
    R2_ACCESS_KEY_ID: input.r2.accessKeyId,
    R2_SECRET_ACCESS_KEY: input.r2.secretAccessKey,
    R2_ENDPOINT: input.r2.endpoint,
  };
  if (input.hfToken) env.HF_TOKEN = input.hfToken;
  return env;
}

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const ax = err as AxiosError;
  const status = ax.response?.status;
  if (status === undefined) return true; // network / timeout
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
