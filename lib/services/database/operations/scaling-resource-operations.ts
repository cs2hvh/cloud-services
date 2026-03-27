import axios from "axios";
import { NextRequest } from "next/server";

import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";

import { getDigitalOceanHeaders, parseAxiosError } from "../helpers";
import type {
  ReadMigrationStatusRequest,
  ReadMigrationStatusResult,
  UpsizeStorageRequest,
} from "../types";

export const scalingResourceOperations = {
  async updateStorage(
    clusterId: string,
    requestedSize: string = "db-s-2vcpu-4gb"
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    try {
      const clusterData = await Database_Clusters.read(clusterId);
      if (!clusterData.success || !clusterData.data) {
        return { success: false, error: "Database cluster not found", errorCode: "NOT_FOUND" };
      }

      const resizePayload: { size: string; num_nodes: number; storage_size_mib?: number } = {
        size: requestedSize,
        num_nodes: clusterData.data.num_nodes || 1,
      };

      if (
        typeof clusterData.data.storage_size_mib === "number" &&
        clusterData.data.storage_size_mib > 0
      ) {
        resizePayload.storage_size_mib = clusterData.data.storage_size_mib;
      }

      let response;
      try {
        response = await axios.put(
          `https://api.digitalocean.com/v2/databases/${clusterId}/resize`,
          resizePayload,
          { headers: getDigitalOceanHeaders() }
        );
      } catch (firstErr) {
        const firstAxiosError = parseAxiosError(firstErr);
        const firstStatus = firstAxiosError?.response?.status;

        // Some target tiers require provider-managed storage defaults.
        // Retry once without explicit storage_size_mib when provider rejects the first payload.
        if (
          (firstStatus === 400 || firstStatus === 422) &&
          typeof resizePayload.storage_size_mib === "number"
        ) {
          const fallbackPayload = {
            size: requestedSize,
            num_nodes: clusterData.data.num_nodes || 1,
          };
          response = await axios.put(
            `https://api.digitalocean.com/v2/databases/${clusterId}/resize`,
            fallbackPayload,
            { headers: getDigitalOceanHeaders() }
          );
        } else {
          throw firstErr;
        }
      }

      if (response.status !== 202 && response.status !== 204) {
        return {
          success: false,
          error: "Failed to resize database cluster",
          errorCode: "DIGITALOCEAN_API_ERROR",
        };
      }

      await Database_Clusters.update_storage(clusterId, requestedSize);

      if (clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Settings",
          text: `Database storage tier upgraded to: ${requestedSize}`,
        });
      }

      try {
        await NotificationService.create(
          createServiceNotification({
            userId: clusterData.data.owner_id,
            type: "info",
            action: "updated",
            serviceType: "database",
            serviceName: clusterData.data.name,
            serviceId: clusterId,
            metadata: { updateType: "storage", newSize: requestedSize },
          })
        );
      } catch (notifErr) {
        console.error("[updateStorage] Failed to create notification:", notifErr);
      }

      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && "response" in err) {
        const axiosError = parseAxiosError(err);
        const status = axiosError?.response?.status;
        if (status === 404) {
          return {
            success: false,
            error:
              axiosError?.response?.data?.message ||
              (err instanceof Error ? err.message : "Unknown error occurred"),
            errorCode: "NOT_FOUND",
          };
        }
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          errorCode: "DIGITALOCEAN_API_ERROR",
        };
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
        errorCode: "UNKNOWN_ERROR",
      };
    }
  },

  // Compatibility method for legacy internal route that used a fixed payload
  // for provider resize while storing requested size in Supabase.
  async updateStorageInternal(
    clusterId: string,
    requestedSize: string
  ): Promise<{ success: boolean; error?: string; statusCode?: number }> {
    try {
      const payload = {
        size: "db-s-2vcpu-4gb",
        num_nodes: 1,
        storage_size_mib: 75680,
      };

      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/resize`,
        payload,
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status === 202 || response.status === 204) {
        const supabaseUpdate = await Database_Clusters.update_storage(clusterId, requestedSize);
        if (!supabaseUpdate.success) {
          console.error("[updateStorageInternal] Failed to update Supabase:", supabaseUpdate.error);
        }

        const clusterData = await Database_Clusters.read(clusterId);
        if (clusterData.success && clusterData.data.project_id) {
          await Projects.add_log({
            project_id: clusterData.data.project_id,
            event: "Settings",
            text: `Database storage tier upgraded to: ${requestedSize}`,
          });
        }

        if (clusterData.success) {
          try {
            await NotificationService.create(
              createServiceNotification({
                userId: clusterData.data.owner_id,
                type: "info",
                action: "updated",
                serviceType: "database",
                serviceName: clusterData.data.name,
                serviceId: clusterId,
                metadata: { updateType: "storage", newSize: requestedSize },
              })
            );
          } catch (notifErr) {
            console.error("[updateStorageInternal] Failed to create notification:", notifErr);
          }
        }

        return { success: true, statusCode: 200 };
      }

      return {
        success: false,
        error: "Failed to upgrade database storage tier",
        statusCode: response.status,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return {
          success: false,
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to upgrade database storage tier",
          statusCode: err.response?.status || 500,
        };
      }

      if (err instanceof Error) {
        return {
          success: false,
          error: err.message || "Failed to upgrade database storage tier",
          statusCode: 500,
        };
      }

      return {
        success: false,
        error: "An unexpected error occurred",
        statusCode: 500,
      };
    }
  },

  async updateRegion(
    clusterId: string,
    region: string,
    status: string = "migrating",
    req?: NextRequest
  ): Promise<{ success: boolean; error?: string; errorCode?: string; statusCode?: number }> {
    try {
      const clusterData = await Database_Clusters.read(clusterId);
      if (!clusterData.success || !clusterData.data) {
        return {
          success: false,
          error: "Database cluster not found",
          errorCode: "NOT_FOUND",
          statusCode: 404,
        };
      }

      if (clusterData.data.engine === "mongodb") {
        return {
          success: false,
          error: "Region migration is not supported for MongoDB clusters",
          errorCode: "UNSUPPORTED_OPERATION",
          statusCode: 422,
        };
      }

      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/migrate`,
        { region },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 202) {
        return {
          success: false,
          error: "Failed to migrate database cluster",
          errorCode: "DIGITALOCEAN_API_ERROR",
          statusCode: response.status,
        };
      }

      const supabaseUpdate = await Database_Clusters.update_region(clusterId, region, status);
      if (!supabaseUpdate.success) {
        console.error("[updateRegion] Failed to update Supabase:", supabaseUpdate.error);
      }

      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Globe",
          text: `Database cluster migrating to region: ${region}`,
        });
      }

      if (clusterData.success && req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterData.data.owner_id,
            user_role: "user",
            action: "update",
            service_type: "database",
            service_id: clusterId,
            service_name: clusterData.data.name,
            before_state: { region: clusterData.data.region },
            after_state: { region, status: "migrating" },
            metadata: { update_type: "region_migration" },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[updateRegion] Failed to create audit log:", auditErr);
        }
      }

      if (clusterData.success) {
        try {
          await NotificationService.create({
            user_id: clusterData.data.owner_id,
            type: "info",
            title: "Database Migration",
            message: `Database migration started...`,
            service_type: "database",
            service_id: clusterId,
            action: "migrated",
            metadata: { updateType: "region", newRegion: region },
          });
        } catch (notifErr) {
          console.error("[updateRegion] Failed to create notification:", notifErr);
        }
      }

      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && "response" in err) {
        const axiosError = parseAxiosError(err);
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          errorCode: "DIGITALOCEAN_API_ERROR",
          statusCode: axiosError?.response?.status || 500,
        };
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
        errorCode: "UNKNOWN_ERROR",
        statusCode: 500,
      };
    }
  },

  async readMigrationStatus(request: ReadMigrationStatusRequest): Promise<ReadMigrationStatusResult> {
    try {
      const response = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}`,
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 200) {
        return { success: false, error: "Failed to fetch database cluster" };
      }

      const cluster = response.data.database;
      const migrationComplete = cluster.region === request.targetRegion && cluster.status === "online";

      if (migrationComplete) {
        await Database_Clusters.update_region(request.clusterId, request.targetRegion, "online");
      }

      return {
        success: true,
        data: {
          migration_complete: migrationComplete,
          current_region: cluster.region,
          current_status: cluster.status,
          target_region: request.targetRegion,
        },
      };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      return {
        success: false,
        error:
          axiosError?.response?.data?.message ||
          (err instanceof Error ? err.message : "Unknown error occurred"),
      };
    }
  },

  async upsizeStorage(
    request: UpsizeStorageRequest,
    req?: NextRequest
  ): Promise<{ success: boolean; error?: string; errorCode?: string; statusCode?: number }> {
    try {
      const clusterData = await Database_Clusters.read(request.clusterId);
      if (!clusterData.success || !clusterData.data) {
        return {
          success: false,
          error: "Database cluster not found",
          errorCode: "NOT_FOUND",
          statusCode: 404,
        };
      }

      const currentSize = clusterData.data.size;
      const currentStorageMib = clusterData.data.storage_size_mib || 0;
      const engine = clusterData.data.engine || "pg";

      if (engine === "mongodb") {
        return {
          success: false,
          error: "Storage upsize is not supported for MongoDB clusters",
          errorCode: "UNSUPPORTED_OPERATION",
          statusCode: 422,
        };
      }

      if (request.storageSizeMib <= currentStorageMib) {
        return {
          success: false,
          error: "New storage size must be greater than current storage size",
          errorCode: "INVALID_PARAMETER",
          statusCode: 400,
        };
      }

      const STORAGE_LIMITS: Record<string, Record<string, { minGiB: number; maxGiB: number }>> = {
        pg: {
          "1gb": { minGiB: 10, maxGiB: 30 },
          "2gb": { minGiB: 30, maxGiB: 60 },
          "4gb": { minGiB: 60, maxGiB: 120 },
          "8gb": { minGiB: 140, maxGiB: 280 },
          "16gb": { minGiB: 290, maxGiB: 580 },
        },
        mysql: {
          "1gb": { minGiB: 10, maxGiB: 30 },
          "2gb": { minGiB: 30, maxGiB: 60 },
          "4gb": { minGiB: 60, maxGiB: 120 },
          "8gb": { minGiB: 140, maxGiB: 280 },
          "16gb": { minGiB: 290, maxGiB: 580 },
        },
        mongodb: {
          "1gb": { minGiB: 15, maxGiB: 25 },
          "2gb": { minGiB: 34, maxGiB: 54 },
          "32gb": { minGiB: 504, maxGiB: 1014 },
        },
      };

      const ramMatch = currentSize.match(/(\d+)gb/i);
      const ram = ramMatch ? `${ramMatch[1]}gb` : "4gb";
      const limits = STORAGE_LIMITS[engine]?.[ram];

      if (limits && request.storageSizeMib > limits.maxGiB * 1024) {
        return {
          success: false,
          error: `Storage size cannot exceed ${limits.maxGiB} GiB for ${engine} with ${ram} RAM`,
          errorCode: "INVALID_PARAMETER",
          statusCode: 400,
        };
      }

      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/resize`,
        {
          size: currentSize,
          num_nodes: clusterData.data.num_nodes || 1,
          storage_size_mib: request.storageSizeMib,
        },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 202 && response.status !== 204) {
        return {
          success: false,
          error: "Failed to upsize database storage",
          errorCode: "DIGITALOCEAN_API_ERROR",
          statusCode: response.status,
        };
      }

      await Database_Clusters.update_storage_size(request.clusterId, request.storageSizeMib);

      if (clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Settings",
          text: `Database storage upsized to: ${(request.storageSizeMib / 1024).toFixed(0)} GiB`,
        });
      }

      if (req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterData.data.owner_id,
            user_role: "user",
            action: "update",
            service_type: "database",
            service_id: request.clusterId,
            service_name: clusterData.data.name,
            before_state: { storage_size_mib: currentStorageMib },
            after_state: { storage_size_mib: request.storageSizeMib },
            metadata: {
              update_type: "storage_upsize",
              old_storage_gib: (currentStorageMib / 1024).toFixed(0),
              new_storage_gib: (request.storageSizeMib / 1024).toFixed(0),
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[upsizeStorage] Failed to create audit log:", auditErr);
        }
      }

      try {
        await NotificationService.create(
          createServiceNotification({
            userId: clusterData.data.owner_id,
            type: "info",
            action: "updated",
            serviceType: "database",
            serviceName: clusterData.data.name,
            serviceId: request.clusterId,
            metadata: {
              updateType: "storage_upsize",
              newStorageGiB: (request.storageSizeMib / 1024).toFixed(0),
            },
          })
        );
      } catch (notifErr) {
        console.error("[upsizeStorage] Failed to create notification:", notifErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      const status = axiosError?.response?.status;
      if (status === 404) {
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          errorCode: "NOT_FOUND",
          statusCode: 404,
        };
      }
      if (axiosError) {
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          errorCode: "DIGITALOCEAN_API_ERROR",
          statusCode: axiosError?.response?.status || 500,
        };
      }
      if (err instanceof Error) {
        return {
          success: false,
          error: err.message,
          errorCode: "UNKNOWN_ERROR",
          statusCode: 500,
        };
      }
      return {
        success: false,
        error: "Unknown error occurred",
        errorCode: "UNKNOWN_ERROR",
        statusCode: 500,
      };
    }
  },
};
