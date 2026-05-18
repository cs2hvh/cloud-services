import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { v1Forbidden, v1NotFound } from "@/lib/api/v1-errors";
import { getAuditContext } from "@/lib/audit/context";
import { KubernetesService } from "@/lib/services/kubernetes-service";
import { Clusters } from "@/lib/supabase/queries/clusters";

export const DELETE = withV1Auth("kubernetes:worker:delete", async (req, auth, context) => {
  const { id: clusterId, error: clusterIdError } = await v1ExtractId(context);
  if (clusterIdError) return clusterIdError;

  const rawParams = await context.params;
  const dropletIdRaw = Array.isArray(rawParams.dropletId)
    ? rawParams.dropletId[0]
    : rawParams.dropletId;
  const dropletId = typeof dropletIdRaw === "string" ? dropletIdRaw.trim() : "";
  if (!/^\d+$/.test(dropletId)) {
    return v1Error("INVALID_ID", 400, "Invalid dropletId format", { field: "dropletId" });
  }

  const cluster = await Clusters.get_by_id(clusterId);
  if (!cluster || cluster.status === "deleted") {
    return v1NotFound("cluster");
  }

  if (cluster.owner_id !== auth.userId) {
    return v1Forbidden("cluster", "modify");
  }

  const result = await KubernetesService.removeNode({
    clusterId,
    dropletId,
    userId: auth.userId,
    userEmail: auth.kind === "session" ? auth.email : undefined,
    auditContext: getAuditContext(req),
  });

  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") {
      return v1NotFound("worker node");
    }
    if (result.errorCode === "FORBIDDEN") {
      return v1Forbidden("cluster", "modify");
    }
    return v1Error(result.errorCode || "DELETE_FAILED", 500, result.error || "Failed to delete worker node");
  }

  return v1Ok({
    data: {
      cluster_id: clusterId,
      droplet_id: dropletId,
      deleted: true,
      workers: result.workers ?? [],
    },
  });
});
