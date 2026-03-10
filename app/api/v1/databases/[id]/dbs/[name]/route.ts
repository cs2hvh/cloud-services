// GET /api/v1/databases/[id]/dbs/[name] — get a single database
// DELETE /api/v1/databases/[id]/dbs/[name] — delete a single database
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
  v1ExtractStringParam,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";

export const GET = withV1Auth("databases:dbs:get", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const nameParam = await v1ExtractStringParam(context, "name", "database name");
  if (nameParam.error) {
    return nameParam.error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "access");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  const result = await DatabaseService.retrieveDatabase({
    clusterId,
    name: nameParam.value,
  });

  if (!result.success) {
    return v1DatabaseServiceError(result, "INTERNAL_ERROR", "Failed to fetch database");
  }

  return v1Ok({ data: result.data });
});

export const DELETE = withV1Auth("databases:dbs:delete", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const nameParam = await v1ExtractStringParam(context, "name", "database name");
  if (nameParam.error) {
    return nameParam.error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "modify");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  const result = await DatabaseService.deleteDatabase({
    clusterId,
    dbName: nameParam.value,
    userId: auth.userId,
  });

  if (!result.success) {
    return v1DatabaseServiceError(result, "DELETE_FAILED", "Failed to delete database");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      name: nameParam.value,
      deleted: true,
    },
  });
});
