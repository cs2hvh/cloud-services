// DELETE /api/v1/databases/[id]/network/firewall/[ruleUuid] - delete firewall rule
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import {
  v1DatabaseServiceError,
  v1EnsureOwnedDatabaseCluster,
  v1ExtractDatabaseId,
  v1ExtractStringParam,
  v1ResolveDatabaseClusterId,
} from "@/lib/api/v1-database-helpers";
import { DatabaseService } from "@/lib/services/database-service";
import { deleteNetworkSchema } from "@/lib/validation/database";

export const DELETE = withV1Auth("databases:network:firewall:delete", async (_req, auth, context) => {
  const { id, error } = await v1ExtractDatabaseId(context);
  if (error) {
    return error;
  }

  const ruleParam = await v1ExtractStringParam(context, "ruleUuid", "firewall rule uuid");
  if (ruleParam.error) {
    return ruleParam.error;
  }

  const ownership = await v1EnsureOwnedDatabaseCluster(id, auth.userId, "modify");
  if (ownership.error) {
    return ownership.error;
  }
  const clusterId = v1ResolveDatabaseClusterId(ownership.cluster, id);

  const validation = deleteNetworkSchema.safeParse({
    id: clusterId,
    rule_uuid: ruleParam.value,
  });

  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const result = await DatabaseService.deleteFirewallRule({
    clusterId,
    ruleUuid: validation.data.rule_uuid,
    userId: auth.userId,
  });

  if (!result.success) {
    return v1DatabaseServiceError(result, "DELETE_FAILED", "Failed to delete firewall rule");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      rule_uuid: validation.data.rule_uuid,
      deleted: true,
      warning: result.warning,
    },
  });
});
