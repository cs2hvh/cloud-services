// GET /api/v1/databases/[id] — get a database cluster by ID
// DELETE /api/v1/databases/[id] — delete a database cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ParseBooleanQuery,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";

export const GET = withV1Auth("databases:get", async (req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "access");
  if (ownership.error) {
    return ownership.error;
  }

  const rawCheckStatus = req.nextUrl.searchParams.get("check_status");
  const checkStatus = v1ParseBooleanQuery(rawCheckStatus);
  if (rawCheckStatus !== null && checkStatus === undefined) {
    return v1Error(
      "INVALID_PARAMETER",
      400,
      "Invalid check_status value. Use true or false.",
      { field: "check_status" }
    );
  }

  const result = await DatabaseService.getCluster({
    clusterId: id,
    userId: auth.userId,
    checkStatus,
  });

  if (!result.success) {
    return v1DatabaseServiceError(result, "INTERNAL_ERROR", "Failed to fetch database cluster");
  }

  return v1Ok({ data: result.data });
});

export const DELETE = withV1Auth("databases:delete", async (req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "delete");
  if (ownership.error) {
    return ownership.error;
  }

  let force = req.nextUrl.searchParams.get("force") === "true";

  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json()) as { force?: unknown };
      if (typeof body.force === "boolean") {
        force = body.force;
      }
    }
  } catch {
    // Ignore JSON parse errors for optional body on DELETE
  }

  const result = await DatabaseService.deleteCluster(
    {
      clusterId: id,
      userId: auth.userId,
      force,
    },
    req,
    auth.kind === "session" ? auth.email : undefined
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "DELETE_FAILED", "Failed to delete database cluster");
  }

  return v1Ok({
    data: {
      id,
      deleted: true,
    },
  });
});
