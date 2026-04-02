// GET /api/v1/kubernetes/{id} — get a kubernetes cluster
// PATCH /api/v1/kubernetes/{id} — update a kubernetes cluster
// DELETE /api/v1/kubernetes/{id} — delete a kubernetes cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError, v1ExtractId } from "@/lib/api/v1-helpers";
import { v1NotFound, v1Forbidden } from "@/lib/api/v1-errors";
import { KubernetesService } from "@/lib/services/kubernetes-service";
import { updateKubernetesClusterSchema } from "@/lib/validation/kubernetes";
import { serializeClusterForV1 } from "@/lib/services/kubernetes/helpers";

export const GET = withV1Auth("kubernetes:read", async (_req, auth, context) => {
  const { id: clusterId, error: idError } = await v1ExtractId(context);
  if (idError) return idError;

  const result = await KubernetesService.getCluster({
    clusterId: clusterId!,
    userId: auth.userId,
  });

  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") return v1NotFound("cluster");
    if (result.errorCode === "FORBIDDEN") return v1Forbidden("cluster", "access");
    return v1Error("INTERNAL_ERROR", 500, result.error || "Failed to fetch Kubernetes cluster");
  }

  return v1Ok({
    data: serializeClusterForV1(result.data as Record<string, unknown>),
  });
});

export const PATCH = withV1Auth("kubernetes:update", async (req, auth, context) => {
  const { id: clusterId, error: idError } = await v1ExtractId(context);
  if (idError) return idError;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = updateKubernetesClusterSchema.safeParse(body);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await KubernetesService.updateCluster({
    clusterId: clusterId!,
    userId: auth.userId,
    ...validation.data,
  });

  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") return v1NotFound("cluster");
    if (result.errorCode === "FORBIDDEN") return v1Forbidden("cluster", "modify");
    return v1Error("UPDATE_FAILED", 500, result.error || "Failed to update Kubernetes cluster");
  }

  return v1Ok({
    data: serializeClusterForV1(result.data as Record<string, unknown>),
  });
});

export const DELETE = withV1Auth("kubernetes:delete", async (req, auth, context) => {
  const { id: clusterId, error: idError } = await v1ExtractId(context);
  if (idError) return idError;

  const result = await KubernetesService.deleteCluster(
    {
      clusterId: clusterId!,
      userId: auth.userId,
    },
    req
  );

  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") return v1NotFound("cluster");
    if (result.errorCode === "FORBIDDEN") return v1Forbidden("cluster", "delete");
    return v1Error("DELETE_FAILED", 500, result.error || "Failed to delete Kubernetes cluster");
  }

  return v1Ok({
    data: {
      id: clusterId,
      deleted: true,
    },
  });
});
