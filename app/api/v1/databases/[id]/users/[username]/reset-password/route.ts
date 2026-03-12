// POST /api/v1/databases/[id]/users/[username]/reset-password — reset a database user password
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
  v1ExtractStringParam,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";

export const POST = withV1Auth("databases:users:reset-password", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const usernameParam = await v1ExtractStringParam(context, "username", "username");
  if (usernameParam.error) {
    return usernameParam.error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "modify");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  const result = await DatabaseService.resetDatabaseUserPassword({
    clusterId,
    username: usernameParam.value,
    userId: auth.userId,
  });

  if (!result.success) {
    return v1DatabaseServiceError(result, "UPDATE_FAILED", "Failed to reset database user password");
  }

  return v1Ok({ data: result.data });
});
