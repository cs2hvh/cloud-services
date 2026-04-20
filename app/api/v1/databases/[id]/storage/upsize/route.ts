// PUT /api/v1/databases/[id]/storage/upsize — upsize disk storage for a database cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { upsizeStorageSchema } from "@/lib/validation/database";

export const PUT = withV1Auth("databases:storage:upsize", async (req, auth, context) => {
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

  const validation = upsizeStorageSchema.safeParse({
    ...body,
    database_id: clusterId,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.upsizeStorage(
    {
      clusterId,
      storageSizeMib: validation.data.storage_size_mib,
      userId: auth.userId,
    },
    req
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "UPDATE_FAILED", "Failed to upsize database storage");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      storage_size_mib: validation.data.storage_size_mib,
      updated: true,
    },
  });
});
