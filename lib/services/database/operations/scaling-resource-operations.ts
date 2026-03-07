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
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/resize`,
        {
          size: "db-s-2vcpu-4gb",
          num_nodes: 1,
          storage_size_mib: 75680,
        },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 202 && response.status !== 204) {
        return { success: false, error: "Failed to resize database cluster" };
      }

      await Database_Clusters.update_storage(clusterId, requestedSize);

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
          console.error("[updateStorage] Failed to create notification:", notifErr);
        }
      }

      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && "response" in err) {
        const axiosError = parseAxiosError(err);
        return {
          success: false,
          error: axiosError?.response?.data?.message || err.message,
        };
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
      };
    }
  },

  async updateRegion(
    clusterId: string,
    region: string,
    status: string = "migrating",
    req?: NextRequest
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/migrate`,
        { region },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 202) {
        return { success: false, error: "Failed to migrate database cluster" };
      }

      const supabaseUpdate = await Database_Clusters.update_region(clusterId, region, status);
      if (!supabaseUpdate.success) {
        console.error("[updateRegion] Failed to update Supabase:", supabaseUpdate.error);
      }

      const clusterData = await Database_Clusters.read(clusterId);
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
          await NotificationService.create(
            createServiceNotification({
              userId: clusterData.data.owner_id,
              type: "info",
              action: "migrated",
              serviceType: "database",
              serviceName: clusterData.data.name,
              serviceId: clusterId,
              metadata: { updateType: "region", newRegion: region },
            })
          );
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
          error: axiosError?.response?.data?.message || err.message,
        };
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
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
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const clusterData = await Database_Clusters.read(request.clusterId);
      if (!clusterData.success || !clusterData.data) {
        return { success: false, error: "Database cluster not found" };
      }

      const currentSize = clusterData.data.size;
      const currentStorageMib = clusterData.data.storage_size_mib || 0;
      const engine = clusterData.data.engine || "pg";

      if (request.storageSizeMib <= currentStorageMib) {
        return {
          success: false,
          error: "New storage size must be greater than current storage size",
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
        };
      }

      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/resize`,
        {
          size: currentSize,
          num_nodes: 1,
          storage_size_mib: request.storageSizeMib,
        },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 202 && response.status !== 204) {
        return { success: false, error: "Failed to upsize database storage" };
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
      return {
        success: false,
        error:
          axiosError?.response?.data?.message ||
          (err instanceof Error ? err.message : "Unknown error occurred"),
      };
    }
  },
};
