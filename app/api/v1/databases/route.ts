// GET /api/v1/databases — list all database clusters owned by authenticated user
// POST /api/v1/databases — create a new database cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { v1DatabaseServiceError } from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { redactClusterSecrets } from "@/lib/services/database/helpers";
import { ProjectService } from "@/lib/services/project-service";
import { createDatabaseSchema, validateEngineVersion } from "@/lib/validation/database";

export const GET = withV1Auth("databases:list", async (_req, auth) => {
  const result = await DatabaseService.readAllOwner(auth.userId);

  if (!result.success) {
    return v1Error("INTERNAL_ERROR", 500, result.error || "Failed to fetch database clusters");
  }

  const clusters = Array.isArray(result.data) ? result.data : [];

  return v1Ok({
    data: clusters,
    meta: {
      total: clusters.length,
    },
  });
});

export const POST = withV1Auth("databases:create", async (req, auth) => {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = createDatabaseSchema.safeParse({
    ...body,
    owner_id: auth.userId,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  if (!validateEngineVersion(validation.data.engine, validation.data.version)) {
    return v1Error(
      "VALIDATION_ERROR",
      400,
      `Version ${validation.data.version} is not valid for engine ${validation.data.engine}`,
      { field: "version" }
    );
  }

  const ownership = await ProjectService.ensureProjectOwnedByUser({
    projectId: validation.data.project_id,
    userId: auth.userId,
  });

  if (!ownership.success && ownership.errorCode === "NOT_FOUND") {
    return v1Error("NOT_FOUND", 404, "Project not found");
  }

  if (!ownership.success && ownership.errorCode === "FORBIDDEN") {
    return v1Error(
      "FORBIDDEN",
      403,
      "You do not have permission to create a database cluster in this project"
    );
  }

  if (!ownership.success) {
    return v1Error("INTERNAL_ERROR", 500, ownership.error || "Failed to validate project ownership");
  }

  const result = await DatabaseService.createCluster(
    {
      ...validation.data,
      owner_id: auth.userId,
      user_email: auth.kind === "session" ? auth.email : undefined,
    },
    req
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "CREATE_FAILED", "Failed to create database cluster");
  }

  const clusterData =
    result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const redactedClusterData = redactClusterSecrets(clusterData);

  return v1Ok(
    {
      data: {
        ...redactedClusterData,
        cluster_id: result.clusterId ?? redactedClusterData.cluster_id,
        connection: null,
      },
    },
    201
  );
});
