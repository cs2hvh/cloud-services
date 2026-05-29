import { createServiceClient } from "@/lib/supabase/server";
import type { GraceServiceTable } from "@/lib/billing/grace/constants";
import { DatabaseService } from "@/lib/services/database-service";
import { KubernetesService } from "@/lib/services/kubernetes-service";
import { ObjectStorageService } from "@/lib/services/object-storage-service";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { SpectrumService } from "@/lib/services/spectrum-service";
import { destroyServer } from "@/lib/services/compute/server-lifecycle";

type ServiceDeletionOutcome = {
  success: boolean;
  message?: string;
  alreadyDeleted?: boolean;
  metadata?: Record<string, unknown>;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

async function resolveDatabaseProviderClusterId(params: {
  billingServiceId: string;
}): Promise<{ clusterId: string | null; ownerId: string | null }> {
  const supabase = await createServiceClient();

  const byInternalId = await supabase
    .from("database_cluster")
    .select("id, cluster_id, owner_id")
    .eq("id", params.billingServiceId)
    .maybeSingle();

  if (byInternalId.data) {
    return {
      clusterId: byInternalId.data.cluster_id ?? null,
      ownerId: byInternalId.data.owner_id ?? null,
    };
  }

  const byProviderId = await supabase
    .from("database_cluster")
    .select("id, cluster_id, owner_id")
    .eq("cluster_id", params.billingServiceId)
    .maybeSingle();

  if (byProviderId.data) {
    return {
      clusterId: byProviderId.data.cluster_id ?? null,
      ownerId: byProviderId.data.owner_id ?? null,
    };
  }

  return { clusterId: null, ownerId: null };
}

async function resolveSpectrumProviderId(params: {
  billingServiceId: string;
}): Promise<{ spectrumId: string | null; ownerId: string | null }> {
  const supabase = await createServiceClient();

  const byInternalId = await supabase
    .from("spectrum_apps")
    .select("id, spectrum_id, owner_id")
    .eq("id", params.billingServiceId)
    .maybeSingle();

  if (byInternalId.data) {
    return {
      spectrumId: byInternalId.data.spectrum_id ?? null,
      ownerId: byInternalId.data.owner_id ?? null,
    };
  }

  const byProviderId = await supabase
    .from("spectrum_apps")
    .select("id, spectrum_id, owner_id")
    .eq("spectrum_id", params.billingServiceId)
    .maybeSingle();

  if (byProviderId.data) {
    return {
      spectrumId: byProviderId.data.spectrum_id ?? null,
      ownerId: byProviderId.data.owner_id ?? null,
    };
  }

  return { spectrumId: null, ownerId: null };
}

async function fetchUserEmail(userId: string): Promise<string | undefined> {
  try {
    const supabase = await createServiceClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data?.user?.email ?? undefined;
  } catch {
    return undefined;
  }
}

export async function executeGraceDeletion(params: {
  serviceTable: GraceServiceTable;
  serviceId: string;
  userId: string;
}): Promise<ServiceDeletionOutcome> {
  try {
    switch (params.serviceTable) {
      case "active_kubernetes": {
        const result = await KubernetesService.deleteCluster(
          {
            clusterId: params.serviceId,
            userId: params.userId,
            isAdmin: true,
          },
          undefined
        );

        if (!result.success && result.errorCode !== "NOT_FOUND") {
          return { success: false, message: result.error ?? "Kubernetes deletion failed" };
        }

        return {
          success: true,
          alreadyDeleted: !result.success && result.errorCode === "NOT_FOUND",
          message: result.success ? "Kubernetes cluster deleted" : "Kubernetes cluster already deleted",
          metadata: result.droplet_warnings
            ? { droplet_warnings: result.droplet_warnings }
            : undefined,
        };
      }

      case "active_database": {
        const resolved = await resolveDatabaseProviderClusterId({
          billingServiceId: params.serviceId,
        });
        if (!resolved.clusterId) {
          return { success: true, alreadyDeleted: true, message: "Database cluster already deleted" };
        }

        const ownerId = resolved.ownerId ?? params.userId;
        const ownerEmail = await fetchUserEmail(ownerId);

        const result = await DatabaseService.deleteCluster(
          {
            clusterId: resolved.clusterId,
            userId: ownerId,
            force: true,
          },
          undefined,
          ownerEmail
        );

        if (!result.success && result.errorCode !== "NOT_FOUND") {
          return { success: false, message: result.error ?? "Database deletion failed" };
        }

        return {
          success: true,
          alreadyDeleted: !result.success && result.errorCode === "NOT_FOUND",
          message: result.success ? "Database cluster deleted" : "Database cluster already deleted",
        };
      }

      case "active_objectspace": {
        const result = await ObjectStorageService.deleteBucket({
          bucket_id: params.serviceId,
          user_id: params.userId,
          is_admin: true,
          force: true,
        });
        return {
          success: true,
          message: result.bucket_name
            ? `Object storage bucket "${result.bucket_name}" deleted`
            : "Object storage bucket deleted",
        };
      }

      case "active_spectrum": {
        const resolved = await resolveSpectrumProviderId({
          billingServiceId: params.serviceId,
        });
        if (!resolved.spectrumId) {
          return { success: true, alreadyDeleted: true, message: "Spectrum app already deleted" };
        }

        await SpectrumService.deleteApp({
          appId: resolved.spectrumId,
          userId: resolved.ownerId ?? params.userId,
          isAdmin: true,
        });

        return { success: true, message: "Spectrum app deleted" };
      }

      case "active_platform_apps": {
        const result = await PlatformAppService.deleteApp({
          appId: params.serviceId,
          userId: params.userId,
          isAdmin: true,
        });

        return {
          success: true,
          message: result.warning
            ? `Platform app deleted with warning: ${result.warning}`
            : "Platform app deleted",
          metadata: result.warning ? { warning: result.warning } : undefined,
        };
      }

      case "active_inference_vector": {
        // service_id is the vector collection id. Deleting the collection
        // cascades to its rows (vector_rows FK ON DELETE CASCADE).
        const supabase = await createServiceClient();
        const { error, count } = await supabase
          .schema("inference")
          .from("vector_collections")
          .delete({ count: "exact" })
          .eq("id", params.serviceId);

        if (error) {
          return { success: false, message: `Vector collection deletion failed: ${error.message}` };
        }
        return {
          success: true,
          alreadyDeleted: !count,
          message: count ? "Vector collection deleted" : "Vector collection already deleted",
        };
      }

      case "active_compute": {
        // service_id is servers.billing_service_id. Resolve the server and
        // tear it down (Proxmox + billing close + DB delete) via the shared
        // helper used by the user-initiated delete.
        const supabase = await createServiceClient();
        const { data: srv } = await supabase
          .from("servers")
          .select("id")
          .eq("billing_service_id", params.serviceId)
          .maybeSingle();
        if (!srv) {
          return { success: true, alreadyDeleted: true, message: "Server already deleted" };
        }
        const result = await destroyServer(Number(srv.id));
        if (!result.success) {
          return { success: false, message: result.message ?? "Server deletion failed" };
        }
        return {
          success: true,
          alreadyDeleted: result.alreadyGone,
          message: "Server deleted",
        };
      }

      default:
        return { success: false, message: `Unsupported service table: ${params.serviceTable}` };
    }
  } catch (error) {
    const message = toErrorMessage(error);
    const lowered = message.toLowerCase();
    if (lowered.includes("not found")) {
      return { success: true, alreadyDeleted: true, message };
    }
    return { success: false, message };
  }
}
