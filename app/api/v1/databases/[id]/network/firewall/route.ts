// GET /api/v1/databases/[id]/network/firewall - list firewall rules
// POST /api/v1/databases/[id]/network/firewall - add firewall rule
import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { updateNetworkSchema } from "@/lib/validation/database";

export const GET = withV1Auth("databases:network:firewall:list", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "access");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  const result = await DatabaseService.readNetworkRules(clusterId, auth.userId);
  if (!result.success) {
    return v1DatabaseServiceError(result, "INTERNAL_ERROR", "Failed to fetch firewall rules");
  }

  const rules = Array.isArray(result.data) ? result.data : [];
  return v1Ok({ data: rules });
});

export const POST = withV1Auth("databases:network:firewall:add", async (req, auth, context) => {
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

  const validation = updateNetworkSchema.safeParse({
    ...body,
    id: clusterId,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.addFirewallRule(
    clusterId,
    validation.data.ip_address,
    auth.userId,
    req
  );

  if (!result.success) {
    return v1DatabaseServiceError(result, "UPDATE_FAILED", "Failed to add firewall rule");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      rules: result.rules ?? [],
      updated: true,
    },
  });
});
