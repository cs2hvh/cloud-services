import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotency";
import { resolveAuthEmail } from "@/lib/api-auth";
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { serializeGpuVolumeForV1, v1GpuServiceError } from "@/lib/api/v1-gpu-helpers";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
  RunPodService,
  type CreateNetworkVolumeRequest,
} from "@/lib/services/runpod-service";
import { gpuV1VolumeCreateSchema } from "@/lib/validation/gpu";

export const GET = withV1Auth("gpu:volumes:list", async (_req, auth) => {
  const result = await RunPodService.listUserVolumes(auth.userId);
  if (!result.success) {
    return v1GpuServiceError(result, "INTERNAL_ERROR", "Failed to list network volumes");
  }

  const volumes = (result.data ?? []).map(serializeGpuVolumeForV1);
  return v1Ok({ data: volumes, meta: { total: volumes.length } });
});

export const POST = withV1Auth("gpu:volumes:create", async (req, auth) => {
  const parsed = gpuV1VolumeCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return v1TransformValidationError(parsed.error);

  const idempotencyKey = getIdempotencyKey(req.headers);
  let complete: ((data: unknown) => Promise<void>) | null = null;
  let abort: (() => Promise<void>) | null = null;
  if (idempotencyKey) {
    const idempotency = await checkIdempotency(
      `v1:gpu-vol-create:${auth.userId}:${idempotencyKey}`
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
    prefix: "rl:gpu-vol-create",
    limit: 5,
    windowMs: 3_600_000,
  });
  if (!provisionLimit.allowed) {
    if (abort) await abort().catch(() => {});
    const response = v1Error(
      "RATE_LIMIT_EXCEEDED",
      429,
      "Too many volume creations. Try again later.",
      { retry_after: provisionLimit.retryAfterSec }
    );
    response.headers.set("Retry-After", String(provisionLimit.retryAfterSec));
    return response;
  }

  const body = parsed.data;
  const createRequest: CreateNetworkVolumeRequest = {
    ownerId: auth.userId,
    ownerEmail: await resolveAuthEmail(auth),
    name: body.name,
    sizeGb: body.size_gb,
    dataCenterId: body.data_center_id,
  };

  const result = await RunPodService.createVolume(createRequest);
  if (!result.success || !result.data) {
    if (abort && result.errorCode !== "TIMEOUT") await abort().catch(() => {});
    return v1GpuServiceError(result, "CREATE_FAILED", "Failed to create network volume");
  }

  const data = serializeGpuVolumeForV1(result.data);
  if (complete) await complete(data).catch(() => {});
  return v1Ok({ data }, 201);
});
