// DELETE /api/v1/databases/[id]/users/[username] — delete a database user
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ExtractStringParam,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";

export const DELETE = withV1Auth("databases:users:delete", async (req, auth, context) => {
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

  const result = await DatabaseService.deleteDatabaseUser(
    {
      clusterId: id,
      username: usernameParam.value,
      userId: auth.userId,
      userEmail: auth.kind === "session" ? auth.email : undefined,
    },
    req
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "DELETE_FAILED", "Failed to delete database user");
  }

  return v1Ok({
    data: {
      cluster_id: id,
      username: usernameParam.value,
      deleted: true,
    },
  });
});
