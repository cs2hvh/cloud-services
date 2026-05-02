// GET /api/v1/databases/[id]/maintenance - read maintenance window
// PUT /api/v1/databases/[id]/maintenance - update maintenance window
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { updateMaintenanceSchema } from "@/lib/validation/database";

export const GET = withV1Auth("databases:maintenance:get", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "access");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  const result = await DatabaseService.readMaintenanceWindow(clusterId, auth.userId);
  if (!result.success) {
    return v1DatabaseServiceError(result, "INTERNAL_ERROR", "Failed to fetch maintenance window");
  }

  return v1Ok({
    data: result.data ?? null,
  });
});

export const PUT = withV1Auth("databases:maintenance:update", async (req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "modify");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = updateMaintenanceSchema.safeParse({
    ...body,
    database_id: clusterId,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.updateMaintenanceWindow(
    clusterId,
    validation.data.day,
    validation.data.hour,
    auth.userId
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "UPDATE_FAILED", "Failed to update maintenance window");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      window: {
        day: validation.data.day,
        hour: validation.data.hour,
      },
      updated: true,
    },
  });
});
