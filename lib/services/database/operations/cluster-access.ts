import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";

type OwnedClusterResult =
  | {
      success: true;
      cluster: Record<string, unknown>;
    }
  | {
      success: false;
      error: string;
      errorCode: "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_ERROR";
      statusCode: 403 | 404 | 500;
    };

export async function resolveOwnedCluster(
  clusterId: string,
  userId: string,
  action: "access" | "modify" | "delete"
): Promise<OwnedClusterResult> {
  try {
    const clusterResult = await Database_Clusters.read(clusterId);
    if (!clusterResult.success || !clusterResult.data) {
      const errorText =
        typeof clusterResult.error === "string" ? clusterResult.error : "Failed to read database cluster";
      const notFound = errorText.toLowerCase().includes("not found");
      return {
        success: false,
        error: notFound ? "Database cluster not found" : errorText,
        errorCode: notFound ? "NOT_FOUND" : "INTERNAL_ERROR",
        statusCode: notFound ? 404 : 500,
      };
    }

    if (clusterResult.data.status === "deleted") {
      return {
        success: false,
        error: "Database cluster not found",
        errorCode: "NOT_FOUND",
        statusCode: 404,
      };
    }

    if (clusterResult.data.owner_id !== userId) {
      const actionLabel =
        action === "access"
          ? "access this database cluster"
          : action === "modify"
            ? "modify this database cluster"
            : "delete this database cluster";

      return {
        success: false,
        error: `You are not authorized to ${actionLabel}`,
        errorCode: "FORBIDDEN",
        statusCode: 403,
      };
    }

    return {
      success: true,
      cluster: clusterResult.data as Record<string, unknown>,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown error occurred",
      errorCode: "INTERNAL_ERROR",
      statusCode: 500,
    };
  }
}
