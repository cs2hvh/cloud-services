/**
 * Kubernetes Cluster Operations - Read
 */

import { Clusters } from "@/lib/supabase/queries/clusters";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import type {
  GetKubernetesClusterRequest,
  GetKubernetesClusterResult,
  ListKubernetesClustersByOwnerResult,
} from "../types";
import { redactClusterSecrets } from "../helpers";

export const clusterReadOperations = {
  /**
   * Get a single Kubernetes cluster by ID
   */
  async getCluster(
    request: GetKubernetesClusterRequest
  ): Promise<GetKubernetesClusterResult> {
    try {
      const cluster = await Clusters.get_by_id(request.clusterId);

      if (!cluster) {
        return {
          success: false,
          error: "Cluster not found",
          errorCode: "NOT_FOUND",
        };
      }

      // Keep old route behavior: deleted clusters are treated as not found.
      if (cluster.status === "deleted") {
        return {
          success: false,
          error: "Cluster not found",
          errorCode: "NOT_FOUND",
        };
      }

      // Verify ownership (skip for admins)
      if (!request.isAdmin && cluster.owner_id !== request.userId) {
        return {
          success: false,
          error: "You do not have permission to access this cluster",
          errorCode: "FORBIDDEN",
        };
      }

      const redactedCluster = redactClusterSecrets(cluster as Record<string, unknown>);

      return {
        success: true,
        data: redactedCluster,
      };
    } catch (error) {
      console.error("[K8s:clusterRead] failed:", error);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "INTERNAL_ERROR",
      };
    }
  },

  /**
   * Read all clusters owned by a user
   */
  async readAllOwner(
    userId: string
  ): Promise<ListKubernetesClustersByOwnerResult> {
    try {
      const clusters = await Clusters.get_by_user_id(userId);

      if (!clusters) {
        return {
          success: true,
          data: [],
        };
      }

      const redactedClusters = clusters.map((cluster) =>
        redactClusterSecrets(cluster as Record<string, unknown>)
      );

      return {
        success: true,
        data: redactedClusters,
      };
    } catch (error) {
      console.error("[K8s:clusterRead] failed:", error);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "INTERNAL_ERROR",
      };
    }
  },
};
