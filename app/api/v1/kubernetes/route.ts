// GET /api/v1/kubernetes — list all kubernetes clusters owned by authenticated user
// POST /api/v1/kubernetes — create a new kubernetes cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { v1NotFound, v1Forbidden } from "@/lib/api/v1-errors";
import { KubernetesService } from "@/lib/services/kubernetes-service";
import { ProjectService } from "@/lib/services/project-service";
import { createKubernetesClusterSchema } from "@/lib/validation/kubernetes";
import { serializeClusterForV1 } from "@/lib/services/kubernetes/helpers";

export const GET = withV1Auth("kubernetes:list", async (_req, auth) => {
  const result = await KubernetesService.readAllOwner(auth.userId);

  if (!result.success) {
    return v1Error("INTERNAL_ERROR", 500, result.error || "Failed to fetch Kubernetes clusters");
  }

  const clusters = Array.isArray(result.data) ? result.data : [];
  const serialized = clusters.map((c) => serializeClusterForV1(c as Record<string, unknown>));

  return v1Ok({
    data: serialized,
    meta: {
      total: serialized.length,
    },
  });
});

export const POST = withV1Auth("kubernetes:create", async (req, auth) => {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = createKubernetesClusterSchema.safeParse({
    ...body,
    owner_id: auth.userId,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const ownership = await ProjectService.ensureProjectOwnedByUser({
    projectId: validation.data.project_id,
    userId: auth.userId,
  });

  if (!ownership.success && ownership.errorCode === "NOT_FOUND") {
    return v1NotFound("project");
  }

  if (!ownership.success && ownership.errorCode === "FORBIDDEN") {
    return v1Forbidden("project", "access");
  }

  if (!ownership.success) {
    return v1Error("INTERNAL_ERROR", 500, ownership.error || "Failed to validate project ownership");
  }

  const result = await KubernetesService.createCluster(
    {
      ...validation.data,
      owner_id: auth.userId,
      // NOTE: user_email is undefined for API key auth — audit log will record the auth type via request context
      user_email: auth.kind === "session" ? auth.email : undefined,
    },
    req
  );

  if (!result.success) {
    if (result.errorCode === "INSUFFICIENT_BALANCE") {
      return v1Error("INSUFFICIENT_BALANCE", 402, result.error || "Insufficient credits");
    }
    if (result.errorCode === "NOT_FOUND") return v1NotFound("project");
    if (result.errorCode === "FORBIDDEN") return v1Forbidden("project", "access");
    return v1Error(result.errorCode || "CREATE_FAILED", 500, result.error || "Failed to create Kubernetes cluster");
  }

  const clusterData =
    result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  clusterData.cluster_id = result.clusterId ?? clusterData.cluster_id;
  const serialized = serializeClusterForV1(clusterData);

  return v1Ok(
    {
      data: serialized,
    },
    201
  );
});
