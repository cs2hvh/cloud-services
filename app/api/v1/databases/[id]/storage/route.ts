// PUT /api/v1/databases/[id]/storage — resize database cluster tier
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { updateStorageSchema } from "@/lib/validation/database";

export const PUT = withV1Auth("databases:storage:update", async (req, auth, context) => {
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

  const validation = updateStorageSchema.safeParse({
    ...body,
    database_id: clusterId,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.updateStorage(clusterId, validation.data.size, auth.userId);
  if (!result.success) {
    return v1DatabaseServiceError(
      result,
      "UPDATE_FAILED",
      "Failed to update database storage tier"
    );
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      size: validation.data.size,
      updated: true,
    },
  });
});
