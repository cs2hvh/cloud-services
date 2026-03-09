// GET /api/v1/databases/[id]/users — list users in a cluster
// POST /api/v1/databases/[id]/users — create a user in a cluster
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { createDatabaseUserSchema } from "@/lib/validation/database";

export const GET = withV1Auth("databases:users:list", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "access");
  if (ownership.error) {
    return ownership.error;
  }

  const result = await DatabaseService.listDatabaseUsers({
    clusterId: id,
    userId: auth.userId,
  });

  if (!result.success) {
    return v1DatabaseServiceError(result, "INTERNAL_ERROR", "Failed to fetch database users");
  }

  const users = Array.isArray(result.data) ? result.data : [];

  return v1Ok({
    data: users,
    meta: {
      total: users.length,
      warning: result.warning,
    },
  });
});

export const POST = withV1Auth("databases:users:create", async (req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "modify");
  if (ownership.error) {
    return ownership.error;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = createDatabaseUserSchema.safeParse({
    ...body,
    cluster_id: id,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.createDatabaseUser(
    {
      clusterId: id,
      name: validation.data.name,
      userId: auth.userId,
    },
    req,
    auth.kind === "session" ? auth.email : undefined
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "CREATE_FAILED", "Failed to create database user");
  }

  return v1Ok({ data: result.data }, 201);
});
