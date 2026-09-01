import axios from "axios";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import { NextRequest } from "next/server";

import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { Billing } from "@/lib/supabase/queries/billing";
import { getRatesForDatabaseBySlug } from "@/config/pricing";

import { getDigitalOceanHeaders, parseAxiosError } from "../helpers";
import type {
  ReadMigrationStatusRequest,
  ReadMigrationStatusResult,
  UpsizeStorageRequest,
} from "../types";
import { resolveOwnedCluster } from "./cluster-access";
import { sendDatabaseAlertEmail, resolveUserEmail } from "./database-alert-email";

export const scalingResourceOperations = {
  async updateStorage(
    clusterId: string,
    requestedSize: string = "db-s-2vcpu-4gb",
    userId: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    try {
      const access = await resolveOwnedCluster(clusterId, userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          errorCode: access.errorCode,
        };
      }
      const clusterData = access.cluster;

      const resizePayload: { size: string; num_nodes: number; storage_size_mib?: number } = {
        size: requestedSize,
        num_nodes: Number(clusterData.num_nodes) || 1,
      };

      if (
        typeof clusterData.storage_size_mib === "number" &&
        clusterData.storage_size_mib > 0
      ) {
        resizePayload.storage_size_mib = clusterData.storage_size_mib;
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
            num_nodes: Number(clusterData.num_nodes) || 1,
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
          errorCode: "PROVIDER_API_ERROR",
        };
      }

      await Database_Clusters.update_storage(clusterId, requestedSize);

      // Update billing rate to match the new plan so future cron charges are correct
      try {
        const { hourlyRate } = await getRatesForDatabaseBySlug(requestedSize);
        if (hourlyRate > 0) {
          await Billing.update_active_database_rate({
            serviceId: clusterId,
            newHourlyRate: hourlyRate,
          });
        }
      } catch (billingRateErr) {
        console.error("[updateStorage] Failed to update billing hourly rate:", billingRateErr);
      }

      try {
        await AuditLogService.create({
          user_id: userId,
          user_role: "user",
          action: "update",
          service_type: "database",
          service_id: clusterId,
          service_name: String(clusterData.name),
          before_state: { size: clusterData.size },
          after_state: { size: requestedSize },
          metadata: { update_type: "tier_resize" },
        });
      } catch (auditErr) {
        console.error("[updateStorage] Failed to create audit log:", auditErr);
      }

      if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
        await Projects.add_log({
          project_id: clusterData.project_id,
          event: "Settings",
          text: `Database storage tier upgraded to: ${requestedSize}`,
        });
      }

      try {
        await NotificationService.create(
          createServiceNotification({
            userId: String(clusterData.owner_id),
            type: "info",
            action: "updated",
            serviceType: "database",
            serviceName: String(clusterData.name),
            serviceId: clusterId,
            metadata: { updateType: "storage", newSize: requestedSize },
          })
        );
      } catch (notifErr) {
        console.error("[updateStorage] Failed to create notification:", notifErr);
      }

      try {
        const recipient = await resolveUserEmail(String(clusterData.owner_id));
        await sendDatabaseAlertEmail({
          userEmail: recipient,
          serviceName: String(clusterData.name),
          alertTitle: "Database plan changed",
          summary: `The plan for your database cluster "${clusterData.name}" was changed to "${requestedSize}".`,
          severity: "info",
          metadata: {
            Operation: "Change database plan",
            Cluster: String(clusterData.name),
            "Previous plan": String(clusterData.size),
            "New plan": requestedSize,
          },
        });
      } catch (emailErr) {
        console.error("[updateStorage] Failed to send email:", emailErr);
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
          errorCode: "PROVIDER_API_ERROR",
        };
      }

      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "UNKNOWN_ERROR",
      };
    }
  },

  // Compatibility method for legacy internal route that used a fixed payload
  // for provider resize while storing requested size in Supabase.
  async updateStorageInternal(
    clusterId: string,
    requestedSize: string,
    userId: string
  ): Promise<{ success: boolean; error?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(clusterId, userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          statusCode: access.statusCode,
        };
      }

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

        // Update billing rate to match the new plan
        try {
          const { hourlyRate } = await getRatesForDatabaseBySlug(requestedSize);
          if (hourlyRate > 0) {
            await Billing.update_active_database_rate({
              serviceId: clusterId,
              newHourlyRate: hourlyRate,
            });
          }
        } catch (billingRateErr) {
          console.error("[updateStorageInternal] Failed to update billing hourly rate:", billingRateErr);
        }

        const clusterData = access.cluster;

        try {
          await AuditLogService.create({
            user_id: userId,
            user_role: "user",
            action: "update",
            service_type: "database",
            service_id: clusterId,
            service_name: String(clusterData.name),
            before_state: { size: clusterData.size },
            after_state: { size: requestedSize },
            metadata: { update_type: "tier_resize" },
          });
        } catch (auditErr) {
          console.error("[updateStorageInternal] Failed to create audit log:", auditErr);
        }

        if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
          await Projects.add_log({
            project_id: clusterData.project_id,
            event: "Settings",
            text: `Database storage tier upgraded to: ${requestedSize}`,
          });
        }

        try {
          await NotificationService.create(
            createServiceNotification({
              userId: String(clusterData.owner_id),
              type: "info",
              action: "updated",
              serviceType: "database",
              serviceName: String(clusterData.name),
              serviceId: clusterId,
              metadata: { updateType: "storage", newSize: requestedSize },
            })
          );
        } catch (notifErr) {
          console.error("[updateStorageInternal] Failed to create notification:", notifErr);
        }

        try {
          const recipient = await resolveUserEmail(String(clusterData.owner_id));
          await sendDatabaseAlertEmail({
            userEmail: recipient,
            serviceName: String(clusterData.name),
            alertTitle: "Database plan changed",
            summary: `The plan for your database cluster "${clusterData.name}" was changed to "${requestedSize}".`,
            severity: "info",
            metadata: {
              Operation: "Change database plan",
              Cluster: String(clusterData.name),
              "Previous plan": String(clusterData.size),
              "New plan": requestedSize,
            },
          });
        } catch (emailErr) {
          console.error("[updateStorageInternal] Failed to send email:", emailErr);
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
          error: GENERIC_SERVICE_ERROR,
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
    userId: string,
    status: string = "migrating",
    req?: NextRequest
  ): Promise<{ success: boolean; error?: string; errorCode?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(clusterId, userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          errorCode: access.errorCode,
          statusCode: access.statusCode,
        };
      }
      const clusterData = access.cluster;

      if (clusterData.engine === "mongodb") {
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
          errorCode: "PROVIDER_API_ERROR",
          statusCode: response.status,
        };
      }

      const supabaseUpdate = await Database_Clusters.update_region(clusterId, region, status);
      if (!supabaseUpdate.success) {
        console.error("[updateRegion] Failed to update Supabase:", supabaseUpdate.error);
      }

      if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
        await Projects.add_log({
          project_id: clusterData.project_id,
          event: "Globe",
          text: `Database cluster migrating to region: ${region}`,
        });
      }

      if (req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: String(clusterData.owner_id),
            user_role: "user",
            action: "update",
            service_type: "database",
            service_id: clusterId,
            service_name: String(clusterData.name),
            before_state: { region: clusterData.region },
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

      try {
        await NotificationService.create({
          user_id: String(clusterData.owner_id),
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

      try {
        const recipient = await resolveUserEmail(String(clusterData.owner_id));
        await sendDatabaseAlertEmail({
          userEmail: recipient,
          serviceName: String(clusterData.name),
          alertTitle: "Database migration started",
          summary: `Your database cluster "${clusterData.name}" is migrating to the region "${region}". We'll let you know once the migration is complete.`,
          severity: "info",
          metadata: {
            Operation: "Migrate database region",
            Cluster: String(clusterData.name),
            "Previous region": String(clusterData.region),
            "New region": region,
          },
        });
      } catch (emailErr) {
        console.error("[updateRegion] Failed to send email:", emailErr);
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
          errorCode: "PROVIDER_API_ERROR",
          statusCode: axiosError?.response?.status || 500,
        };
      }

      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "UNKNOWN_ERROR",
        statusCode: 500,
      };
    }
  },

  async readMigrationStatus(request: ReadMigrationStatusRequest): Promise<ReadMigrationStatusResult> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "access");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          errorCode: access.errorCode,
          statusCode: access.statusCode,
        };
      }

      const response = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}`,
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 200) {
        return {
          success: false,
          error: "Failed to fetch database cluster",
          errorCode: "UNKNOWN_ERROR",
          statusCode: response.status,
        };
      }

      const cluster = response.data.database;
      const migrationComplete = cluster.region === request.targetRegion && cluster.status === "online";

      if (migrationComplete) {
        await Database_Clusters.update_region(request.clusterId, request.targetRegion, "online");

        if (access.cluster.status !== "online") {
          try {
            await NotificationService.create(
              createServiceNotification({
                userId: String(access.cluster.owner_id),
                type: "success",
                action: "migrated",
                serviceType: "database",
                serviceName: String(access.cluster.name),
                serviceId: request.clusterId,
                metadata: {
                  updateType: "region",
                  newRegion: request.targetRegion,
                },
              })
            );
          } catch (notifErr) {
            console.error("[readMigrationStatus] Failed to create notification:", notifErr);
          }

          try {
            const recipient = await resolveUserEmail(String(access.cluster.owner_id));
            await sendDatabaseAlertEmail({
              userEmail: recipient,
              serviceName: String(access.cluster.name),
              alertTitle: "Database migration completed",
              summary: `Your database cluster "${access.cluster.name}" has finished migrating to the region "${request.targetRegion}" and is now online.`,
              severity: "info",
              metadata: {
                Operation: "Migrate database region",
                Cluster: String(access.cluster.name),
                Region: request.targetRegion,
              },
            });
          } catch (emailErr) {
            console.error("[readMigrationStatus] Failed to send email:", emailErr);
          }
        }
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
        errorCode: axiosError?.response?.status === 404 ? "NOT_FOUND" : "UNKNOWN_ERROR",
        statusCode: axiosError?.response?.status ?? 500,
      };
    }
  },

  async upsizeStorage(
    request: UpsizeStorageRequest,
    req?: NextRequest
  ): Promise<{ success: boolean; error?: string; errorCode?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          errorCode: access.errorCode,
          statusCode: access.statusCode,
        };
      }
      const clusterData = access.cluster;

      const currentSize = String(clusterData.size || "");
      const currentStorageMib =
        typeof clusterData.storage_size_mib === "number" ? clusterData.storage_size_mib : 0;
      const engine = String(clusterData.engine || "pg");

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
          num_nodes: Number(clusterData.num_nodes) || 1,
          storage_size_mib: request.storageSizeMib,
        },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 202 && response.status !== 204) {
        return {
          success: false,
          error: "Failed to upsize database storage",
          errorCode: "PROVIDER_API_ERROR",
          statusCode: response.status,
        };
      }

      await Database_Clusters.update_storage_size(request.clusterId, request.storageSizeMib);

      if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
        await Projects.add_log({
          project_id: clusterData.project_id,
          event: "Settings",
          text: `Database storage upsized to: ${(request.storageSizeMib / 1024).toFixed(0)} GiB`,
        });
      }

      if (req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: String(clusterData.owner_id),
            user_role: "user",
            action: "update",
            service_type: "database",
            service_id: request.clusterId,
            service_name: String(clusterData.name),
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
            userId: String(clusterData.owner_id),
            type: "info",
            action: "updated",
            serviceType: "database",
            serviceName: String(clusterData.name),
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

      try {
        const recipient = await resolveUserEmail(String(clusterData.owner_id));
        await sendDatabaseAlertEmail({
          userEmail: recipient,
          serviceName: String(clusterData.name),
          alertTitle: "Database storage upsized",
          summary: `The storage for your database cluster "${clusterData.name}" was increased to ${(request.storageSizeMib / 1024).toFixed(0)} GiB.`,
          severity: "info",
          metadata: {
            Operation: "Upsize database storage",
            Cluster: String(clusterData.name),
            "Previous storage": `${(currentStorageMib / 1024).toFixed(0)} GiB`,
            "New storage": `${(request.storageSizeMib / 1024).toFixed(0)} GiB`,
          },
        });
      } catch (emailErr) {
        console.error("[upsizeStorage] Failed to send email:", emailErr);
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
          errorCode: "PROVIDER_API_ERROR",
          statusCode: axiosError?.response?.status || 500,
        };
      }
      if (err instanceof Error) {
        return {
          success: false,
          error: GENERIC_SERVICE_ERROR,
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
