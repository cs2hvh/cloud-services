// GET /api/v1/kubernetes/{id} — get a kubernetes cluster
// PATCH /api/v1/kubernetes/{id} — update a kubernetes cluster
// DELETE /api/v1/kubernetes/{id} — delete a kubernetes cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { KubernetesService } from "@/lib/services/kubernetes-service";
import { updateKubernetesClusterSchema } from "@/lib/validation/kubernetes";
// import { redactClusterSecrets } from "@/lib/services/kubernetes/helpers";

export const GET = withV1Auth("kubernetes:read", async (req, auth, { params }) => {
  const { id: clusterId } = await params;

  if (!clusterId || typeof clusterId !== "string") {
    return v1Error("VALIDATION_ERROR", 400, "Invalid cluster ID");
  }

  const result = await KubernetesService.getCluster({
    clusterId,
    userId: auth.userId,
  });

  if (!result.success) {
    const status =
      result.errorCode === "NOT_FOUND"
        ? 404
        : result.errorCode === "FORBIDDEN"
          ? 403
          : 500;
    return v1Error(
      result.errorCode || "INTERNAL_ERROR",
      status,
      result.error || "Failed to fetch Kubernetes cluster"
    );
  }

  return v1Ok({
    data: result.data,
  });
});

export const PATCH = withV1Auth("kubernetes:update", async (req, auth, { params }) => {
  const { id: clusterId } = await params;

  if (!clusterId || typeof clusterId !== "string") {
    return v1Error("VALIDATION_ERROR", 400, "Invalid cluster ID");
  }

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
    clusterId,
    userId: auth.userId,
    ...validation.data,
  });

  if (!result.success) {
    const status =
      result.errorCode === "NOT_FOUND"
        ? 404
        : result.errorCode === "FORBIDDEN"
          ? 403
          : 500;
    return v1Error(
      result.errorCode || "UPDATE_FAILED",
      status,
      result.error || "Failed to update Kubernetes cluster"
    );
  }

  return v1Ok({
    data: result.data,
  });
});

export const DELETE = withV1Auth("kubernetes:delete", async (req, auth, { params }) => {
  const { id: clusterId } = await params;

  if (!clusterId || typeof clusterId !== "string") {
    return v1Error("VALIDATION_ERROR", 400, "Invalid cluster ID");
  }

  const result = await KubernetesService.deleteCluster(
    {
      clusterId,
      userId: auth.userId,
    },
    req
  );

  if (!result.success) {
    const status =
      result.errorCode === "NOT_FOUND"
        ? 404
        : result.errorCode === "FORBIDDEN"
          ? 403
          : 500;
    return v1Error(
      result.errorCode || "DELETE_FAILED",
      status,
      result.error || "Failed to delete Kubernetes cluster"
    );
  }

  return v1Ok({
    data: {
      id: clusterId,
      cluster_id: result.clusterId,
      deleted: true,
    },
  });
});
