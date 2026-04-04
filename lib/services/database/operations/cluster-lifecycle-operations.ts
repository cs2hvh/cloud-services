import axios from "axios";
import { NextRequest } from "next/server";

import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { Encryption } from "@/config/functions";
import { getRatesForDatabase } from "@/config/pricing";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";
import { Billing } from "@/lib/supabase/queries/billing";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import type { DatabaseUser } from "@/lib/supabase/types";

import {
  extractPasswordFromUri,
  getDigitalOceanHeaders,
  parseAxiosError,
  resolveAuditUserRole,
} from "../helpers";
import type {
  CreateDatabaseClusterRequest,
  CreateDatabaseClusterResult,
  DeleteDatabaseClusterRequest,
  DeleteDatabaseClusterResult,
  UpdateDatabaseClusterProjectRequest,
} from "../types";
import { sendDatabaseAlertEmail } from "./database-alert-email";
import { resolveOwnedCluster } from "./cluster-access";

export const clusterLifecycleOperations = {
  async createCluster(
    request: CreateDatabaseClusterRequest,
    req?: NextRequest
  ): Promise<CreateDatabaseClusterResult> {
    try {
      const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } =
        await getRatesForDatabase(request.plan_id);

      const balCheck = await ensureBalance(request.owner_id, INITIAL_COST);
      if (!balCheck.ok) {
        return {
          success: false,
          error: "Insufficient credits",
          errorCode: "INSUFFICIENT_BALANCE",
          balance: balCheck.balance,
          required: INITIAL_COST,
        };
      }

      const doPayload: Record<string, unknown> = {
        name: request.name,
        engine: request.engine,
        version: request.version,
        region: request.region,
        size: request.size,
        num_nodes: request.num_nodes || 1,
       // project_id: request.project_id,
        //owner_id: request.owner_id,
        //plan_id: request.plan_id,
      };
      if (typeof request.storage_size_mib === "number") {
        doPayload.storage_size_mib = request.storage_size_mib;
      }

      const database = await axios.post("https://api.digitalocean.com/v2/databases", doPayload, {
        headers: getDigitalOceanHeaders(),
      });

      if (database.status !== 201) {
        return {
          success: false,
          error: "Failed to create database cluster in DigitalOcean",
          errorCode: "DIGITALOCEAN_API_ERROR",
        };
      }

      const encryptionKey = process.env.ENCRYPTION_KEY!;
      const publicPassword =
        database.data.database.connection?.password ||
        extractPasswordFromUri(database.data.database.connection?.uri);
      const privatePassword =
        database.data.database.private_connection?.password ||
        extractPasswordFromUri(database.data.database.private_connection?.uri);

      const encryptedPublicPassword = publicPassword
        ? Encryption.encrypt(publicPassword, encryptionKey)
        : null;
      const encryptedPrivatePassword = privatePassword
        ? Encryption.encrypt(privatePassword, encryptionKey)
        : null;

      const encryptedUsers = database.data.database.users?.map((user: DatabaseUser) => ({
        ...user,
        password: user.password ? Encryption.encrypt(user.password, encryptionKey) : undefined,
      }));

      const sendData = {
        name: database.data.database.name,
        engine: database.data.database.engine,
        project_id: request.project_id,
        owner_id: request.owner_id,
        version: database.data.database.version,
        num_nodes: database.data.database.num_nodes,
        cluster_id: database.data.database.id,
        public_connection: {
          ...database.data.database.connection,
          password: encryptedPublicPassword,
        },
        private_connection: {
          ...database.data.database.private_connection,
          password: encryptedPrivatePassword,
        },
        status: database.data.database.status,
        password: database.data.database.password,
        size: database.data.database.size,
        region: database.data.database.region,
        window: database.data.database.maintenance_window,
        users: encryptedUsers || [],
        dbs: database.data.database.db_names || [],
        storage_size_mib: database.data.database.storage_size_mib,
      };

      const supabaseData = await Database_Clusters.create(sendData);
      if (!supabaseData.success) {
        return {
          success: false,
          error: "Failed to save database cluster to database",
          errorCode: "SUPABASE_INSERT_FAILED",
        };
      }

      const providerClusterId = database.data.database.id as string;
      const billingServiceId = (supabaseData.data?.id as string | undefined) ?? providerClusterId;
      try {
        await postProvisionBilling({
          userId: request.owner_id,
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
          serviceId: billingServiceId,
          addActive: Billing.add_active_database,
        });
      } catch (billingErr) {
        const billingMessage =
          billingErr instanceof Error
            ? billingErr.message
            : typeof billingErr === "string"
              ? billingErr
              : JSON.stringify(billingErr);
        return {
          success: false,
          error: `Post-provision billing failed: ${billingMessage}`,
          errorCode: "POST_PROVISION_BILLING_FAILED",
        };
      }

      if (req) {
        const auditContext = getAuditContext(req);
        const userRole = await resolveAuditUserRole();

        await AuditLogService.create({
          user_id: request.owner_id,
          user_role: userRole,
          user_email: request.user_email,
          action: "create",
          service_type: "database",
          service_id: billingServiceId,
          service_name: request.name,
          after_state: supabaseData.data,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
          metadata: {
            engine: request.engine,
            version: request.version,
            region: request.region,
            size: request.size,
          },
        });
      }

      await NotificationService.create({
        user_id: request.owner_id,
        type: "info",
        title: "Database Creation",
        message: `Database ${request.name} creation started...`,
        service_type: "database",
        service_id: providerClusterId,
        action: "created",
        metadata: { serviceName: request.name },
      });

      return {
        success: true,
        clusterId: providerClusterId,
        data: supabaseData.data,
        connection: {
          host: database.data.database.connection.host,
          port: database.data.database.connection.port,
          user: database.data.database.connection.user,
          password: database.data.database.connection.password,
          database: database.data.database.connection.database || "defaultdb",
          uri: database.data.database.connection.uri,
        },
      };
    } catch (err: unknown) {
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: request.owner_id,
            type: "error",
            action: "created",
            serviceType: "database",
            serviceName: "Database Cluster",
            error: err instanceof Error ? err.message : "Unknown error",
          })
        );
      } catch (notifErr) {
        console.error("Failed to create error notification:", notifErr);
      }

      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        const message = axiosError?.response?.data?.message;
        const status = axiosError?.response?.status;

        if (status === 500 || status === 429) {
          return {
            success: false,
            error: "Server busy. Please try again later.",
            errorCode: "SERVER_BUSY",
          };
        }

        return {
          success: false,
          error: message ?? "Invalid request",
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

  async updateClusterProject(
    request: UpdateDatabaseClusterProjectRequest,
    req?: NextRequest,
    userEmail?: string
  ): Promise<{ success: boolean; data?: unknown; error?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          statusCode: access.statusCode,
        };
      }

      const beforeState = {
        success: true as const,
        data: access.cluster,
      };
      const result = await Database_Clusters.update_project(request.clusterId, request.projectId);
      if (!result.success) {
        return { ...result, statusCode: 500 };
      }

      const clusterData = await Database_Clusters.read(request.clusterId);
      const projectData = await Projects.get_by_id(request.projectId);

      if (clusterData.success && projectData) {
        await Projects.add_log({
          project_id: request.projectId,
          event: "FolderKanban",
          text: `Database cluster '${clusterData.data.name}' moved to this project`,
        });
      }

      if (clusterData.success && req && beforeState.success) {
        const auditContext = getAuditContext(req);
        const userRole = await resolveAuditUserRole();
        await AuditLogService.create({
          user_id: request.userId,
          user_role: userRole,
          user_email: userEmail,
          action: "update",
          service_type: "database",
          service_id: request.clusterId,
          service_name: clusterData.data.name,
          before_state: beforeState.data,
          after_state: clusterData.data,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
          metadata: {
            update_type: "project",
            old_project_id: beforeState.data.project_id,
            new_project_id: request.projectId,
            project_name: projectData?.name,
          },
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
              serviceId: request.clusterId,
              metadata: { updateType: "project", projectName: projectData?.name },
            })
          );
        } catch (notifErr) {
          console.error("[updateClusterProject] Failed to create notification:", notifErr);
        }
      }

      return result;
    } catch (err: unknown) {
      if (err instanceof Error) {
        return {
          success: false,
          error: err.message,
          statusCode: 400,
        };
      }
      return {
        success: false,
        error: "Unknown error occurred",
        statusCode: 500,
      };
    }
  },

  async deleteCluster(
    request: DeleteDatabaseClusterRequest,
    req?: NextRequest,
    userEmail?: string
  ): Promise<DeleteDatabaseClusterResult> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "delete");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          errorCode: access.errorCode,
          statusCode: access.statusCode,
        };
      }

      const clusterData = access.cluster;
      const clusterName =
        typeof clusterData.name === "string" && clusterData.name.length > 0
          ? clusterData.name
          : "Unknown";
      const projectId = typeof clusterData.project_id === "string" ? clusterData.project_id : null;
      const clusterOwnerId =
        typeof clusterData.owner_id === "string" ? clusterData.owner_id : request.userId;
      const billingServiceId =
        typeof clusterData.id === "string" && clusterData.id.length > 0
          ? clusterData.id
          : request.clusterId;

      const integrationCheck = await DatabaseIntegrationService.canDeleteDatabase(request.clusterId);
      if (!integrationCheck.canDelete && !request.force) {
        return {
          success: false,
          error: "Cannot delete database with active integrations",
          errorCode: "DATABASE_HAS_ACTIVE_LINKS",
          linkedAppsCount: integrationCheck.linkedApps,
          linkedAppNames: integrationCheck.linkedAppNames,
        };
      }

      if (request.force && integrationCheck.linkedApps > 0) {
        await DatabaseIntegrationService.unlinkAllFromDatabase(request.clusterId, request.userId);
      }

      try {
        await Billing.close_active_service("database", {
          userId: request.userId,
          serviceId: billingServiceId,
          failOnInsufficient: false,
        });
      } catch (billErr) {
        console.warn("[deleteCluster] Billing close failed:", billErr);
      }

      await axios.delete(`https://api.digitalocean.com/v2/databases/${request.clusterId}`, {
        headers: getDigitalOceanHeaders(),
      });

      if (req) {
        const auditContext = getAuditContext(req);
        const userRole = await resolveAuditUserRole();
        await AuditLogService.create({
          user_id: request.userId,
          user_role: userRole,
          user_email: userEmail,
          action: "delete",
          service_type: "database",
          service_id: request.clusterId,
          service_name: clusterName,
          before_state: clusterData,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
          metadata: {
            project_id: projectId,
          },
        });
      }

      const supabaseDelete = await Database_Clusters.mark_as_deleted(request.clusterId);
      if (!supabaseDelete.success) {
        return {
          success: false,
          error: supabaseDelete.error || "Failed to delete from database",
          errorCode: "SUPABASE_DELETE_FAILED",
        };
      }

      if (projectId) {
        await Projects.add_log({
          project_id: projectId,
          event: "Trash2",
          text: `Database cluster '${clusterName}' deleted`,
        });
      }

      try {
        await NotificationService.create(
          createServiceNotification({
            userId: clusterOwnerId,
            type: "success",
            action: "deleted",
            serviceType: "database",
            serviceName: clusterName,
            serviceId: request.clusterId,
          })
        );
      } catch (notifErr) {
        console.error("[deleteCluster] Failed to create notification:", notifErr);
      }

      try {
        await sendDatabaseAlertEmail({
          userEmail,
          serviceName: clusterName,
          alertTitle: "Database cluster deleted",
          summary: `Database cluster "${clusterName}" was deleted successfully.`,
          severity: "warning",
          metadata: {
            Operation: "Delete database cluster",
            Cluster: clusterName,
          },
        });
      } catch (emailErr) {
        console.error("[deleteCluster] Failed to send email:", emailErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: request.userId,
            type: "error",
            action: "deleted",
            serviceType: "database",
            serviceName: "Database Cluster",
            error: err instanceof Error ? err.message : "Unknown error",
          })
        );
      } catch (notifErr) {
        console.error("Failed to create error notification:", notifErr);
      }

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
};
