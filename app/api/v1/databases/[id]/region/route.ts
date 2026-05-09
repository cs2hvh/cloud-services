// GET /api/v1/databases/[id]/region - list available migration regions
// PUT /api/v1/databases/[id]/region - migrate database cluster region
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { migrateRegionSchema } from "@/lib/validation/database";
import { VALID_DATABASE_REGIONS } from "@/lib/validation/constants";

export const GET = withV1Auth("databases:region:list", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "access");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  return v1Ok({
    data: {
      cluster_id: clusterId,
      available_regions: [...VALID_DATABASE_REGIONS],
    },
  });
});

export const PUT = withV1Auth("databases:region:migrate", async (req, auth, context) => {
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

  const validation = migrateRegionSchema.safeParse({
    ...body,
    database_id: clusterId,
  });

  if (!validation.success) {
    const hasRegionValidationIssue = validation.error.issues.some(
      (issue) => issue.path.join(".") === "region"
    );
    if (hasRegionValidationIssue) {
      return v1Error("VALIDATION_ERROR", 400, "Invalid region. Use one of the available regions.", {
        field: "region",
        available_regions: [...VALID_DATABASE_REGIONS],
      });
    }
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.updateRegion(
    clusterId,
    validation.data.region,
    auth.userId,
    "migrating",
    req
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "UPDATE_FAILED", "Failed to start region migration");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      region: validation.data.region,
      status: "migrating",
      migration_started: true,
    },
  });
});
