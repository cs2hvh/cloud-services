import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotency";
import { resolveAuthEmail } from "@/lib/api-auth";
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import {
  serializeGpuPodSummaryForV1,
  v1GpuServiceError,
} from "@/lib/api/v1-gpu-helpers";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
  RunPodService,
  type CreatePodRequest,
} from "@/lib/services/runpod-service";
import { gpuV1PodCreateSchema } from "@/lib/validation/gpu";

export const GET = withV1Auth("gpu:pods:list", async (_req, auth) => {
  const result = await RunPodService.listUserPods(auth.userId);
  if (!result.success) {
    return v1GpuServiceError(result, "INTERNAL_ERROR", "Failed to list GPU pods");
  }

  const pods = (result.data ?? []).map(serializeGpuPodSummaryForV1);
  return v1Ok({ data: pods, meta: { total: pods.length } });
});

export const POST = withV1Auth("gpu:pods:create", async (req, auth) => {
  const parsed = gpuV1PodCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return v1TransformValidationError(parsed.error);

  const idempotencyKey = getIdempotencyKey(req.headers);
  let complete: ((data: unknown) => Promise<void>) | null = null;
  let abort: (() => Promise<void>) | null = null;
  if (idempotencyKey) {
    const idempotency = await checkIdempotency(
      `v1:gpu-create:${auth.userId}:${idempotencyKey}`
    );
    if (idempotency.status === "completed") {
      return v1Ok({ data: idempotency.data as Record<string, unknown> }, 201);
    }
    if (idempotency.status === "in-progress") {
      return v1Error("REQUEST_IN_PROGRESS", 409, "This request is already being processed", {
        retry_after: idempotency.retryAfter,
      });
    }
    if (!(await idempotency.reserve())) {
      return v1Error("DUPLICATE_REQUEST", 409, "Duplicate request detected");
    }
    complete = idempotency.complete;
    abort = idempotency.abort;
  }

  const provisionLimit = await limitByUser(auth.userId, {
    prefix: "rl:gpu-create",
    limit: 5,
    windowMs: 3_600_000,
  });
  if (!provisionLimit.allowed) {
    if (abort) await abort().catch(() => {});
    const response = v1Error(
      "RATE_LIMIT_EXCEEDED",
      429,
      "Too many GPU pods created recently. Try again later.",
      { retry_after: provisionLimit.retryAfterSec }
    );
    response.headers.set("Retry-After", String(provisionLimit.retryAfterSec));
    return response;
  }

  const body = parsed.data;

  const createRequest: CreatePodRequest = {
    ownerId: auth.userId,
    ownerEmail: await resolveAuthEmail(auth),
    name: body.name,
    gpuCatalogId: body.gpu_catalog_id,
    gpuCount: body.gpu_count,
    cloudType: "SECURE",
    interruptible: body.interruptible,
    imageName: body.image_name ?? "",
    templateId: body.template_id,
    containerDiskGb: body.container_disk_gb,
    volumeGb: body.volume_gb,
    dataCenterIds: body.data_center_ids,
    ports: body.ports,
    env: body.env,
    publicKey: body.public_key,
    rootPassword: body.root_password,
  };

  const result = await RunPodService.createPod(createRequest);
  if (!result.success || !result.data) {
    if (abort && result.errorCode !== "TIMEOUT") await abort().catch(() => {});
    return v1GpuServiceError(result, "CREATE_FAILED", "Failed to create GPU pod");
  }

  const data = {
    id: result.data.podId,
    name: result.data.name,
    status: result.data.status,
    public_ip: result.data.publicIp,
    port_mappings: result.data.portMappings,
    hourly_cost_usd: result.data.hourlyCostUsd,
    ssh_command: result.data.sshCommand,
  };
  if (complete) await complete(data).catch(() => {});
  return v1Ok({ data }, 201);
});
