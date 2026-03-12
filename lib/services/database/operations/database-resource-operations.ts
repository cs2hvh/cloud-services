import axios from "axios";
import { NextRequest } from "next/server";

import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import type { DatabaseInstance } from "@/lib/supabase/types";

import {
  getDigitalOceanHeaders,
  getLogicalDatabaseEngineError,
  parseAxiosError,
  supportsLogicalDatabases,
} from "../helpers";
import type {
  CreateDatabaseRequest,
  DeleteDatabaseRequest,
  InternalListDatabasesRequest,
  InternalRetrieveDatabaseRequest,
  ListDatabasesRequest,
  ListDatabasesResult,
  RetrieveDatabaseRequest,
} from "../types";

async function listDatabasesFromProvider(
  clusterId: string,
  unknownErrorFallback: string
): Promise<ListDatabasesResult> {
  try {
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${clusterId}/dbs`,
      { headers: getDigitalOceanHeaders() }
    );

    if (response.status !== 200) {
      return { success: false, error: "Failed to fetch databases from DigitalOcean" };
    }

    const databases = response.data.dbs as DatabaseInstance[];
    const formattedDbs = databases.map((db: DatabaseInstance) => ({
      id: db.name,
      name: db.name,
      created_at: new Date().toISOString(),
    }));

    const syncResult = await Database_Clusters.update_dbs(clusterId, formattedDbs);
    if (!syncResult.success) {
      return {
        success: true,
        data: databases,
        warning: syncResult.error,
      };
    }

    return {
      success: true,
      data: databases,
    };
  } catch (err: unknown) {
    const axiosError = parseAxiosError(err);
    return {
      success: false,
      error:
        axiosError?.response?.data?.message ||
        (err instanceof Error ? err.message : unknownErrorFallback),
    };
  }
}

async function retrieveDatabaseFromProvider(
  clusterId: string,
  name: string,
  unknownErrorFallback: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${clusterId}/dbs/${name}`,
      { headers: getDigitalOceanHeaders() }
    );

    if (response.status !== 200) {
      return { success: false, error: "Failed to retrieve database" };
    }

    const retrievedDatabase = response.data?.db as DatabaseInstance | undefined;
    if (retrievedDatabase?.name === name) {
      return { success: true, data: retrievedDatabase };
    }

    const listResponse = await axios.get(
      `https://api.digitalocean.com/v2/databases/${clusterId}/dbs`,
      { headers: getDigitalOceanHeaders() }
    );
    if (listResponse.status !== 200) {
      return { success: false, error: "Failed to retrieve database" };
    }

    const databases = Array.isArray(listResponse.data?.dbs)
      ? (listResponse.data.dbs as DatabaseInstance[])
      : [];
    const matched = databases.find((db) => db.name === name);
    if (!matched) {
      return { success: false, error: `database ${name} was not found` };
    }

    return { success: true, data: matched };
  } catch (err: unknown) {
    const axiosError = parseAxiosError(err);
    return {
      success: false,
      error:
        axiosError?.response?.data?.message ||
        (err instanceof Error ? err.message : unknownErrorFallback),
    };
  }
}

export const databaseResourceOperations = {
  async createDatabase(
    request: CreateDatabaseRequest,
    req?: NextRequest,
    userEmail?: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const clusterResult = await Database_Clusters.read(request.clusterId);
      if (!clusterResult.success || !clusterResult.data) {
        return { success: false, error: "Database cluster not found" };
      }

      if (clusterResult.data.owner_id !== request.userId) {
        return {
          success: false,
          error: "You are not authorized to create databases in this cluster",
        };
      }

      if (!supportsLogicalDatabases(clusterResult.data.engine)) {
        return {
          success: false,
          error: getLogicalDatabaseEngineError(clusterResult.data.engine),
        };
      }

      const response = await axios.post(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/dbs`,
        { name: request.name },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 201) {
        return { success: false, error: "Failed to create database in DigitalOcean" };
      }

      const database = response.data.db;
      const dbData = {
        id: database.name,
        name: database.name,
        created_at: new Date().toISOString(),
      };

      const supabaseResult = await Database_Clusters.add_db(request.clusterId, dbData);
      if (!supabaseResult.success) {
        return {
          success: false,
          error: "Database created in DigitalOcean but failed to sync with database",
        };
      }

      if (clusterResult.data.project_id) {
        await Projects.add_log({
          project_id: clusterResult.data.project_id,
          event: "Database",
          text: `Database '${request.name}' created in cluster`,
        });
      }

      if (req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterResult.data.owner_id,
            user_role: "user",
            user_email: userEmail,
            action: "create",
            service_type: "database",
            service_id: request.clusterId,
            service_name: clusterResult.data.name,
            after_state: { database_name: request.name },
            metadata: { operation: "database_created" },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[createDatabase] Failed to create audit log:", auditErr);
        }
      }

      try {
        await NotificationService.create(
          createServiceNotification({
            userId: clusterResult.data.owner_id,
            type: "info",
            action: "updated",
            serviceType: "database",
            serviceName: clusterResult.data.name,
            serviceId: request.clusterId,
            metadata: { updateType: "database_created", dbName: request.name },
          })
        );
      } catch (notifErr) {
        console.error("[createDatabase] Failed to create notification:", notifErr);
      }

      return { success: true, data: database };
    } catch (err: unknown) {
      if (err instanceof Error && "response" in err) {
        const axiosError = parseAxiosError(err);
        const message = axiosError?.response?.data?.message;
        const status = axiosError?.response?.status;
        if (status === 409) {
          return { success: false, error: message ?? "Database already exists" };
        }
        return { success: false, error: message ?? "Invalid request" };
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
      };
    }
  },

  async deleteDatabase(
    request: DeleteDatabaseRequest
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const clusterResult = await Database_Clusters.read(request.clusterId);
      if (!clusterResult.success || !clusterResult.data) {
        return { success: false, error: "Database cluster not found" };
      }

      if (!supportsLogicalDatabases(clusterResult.data.engine)) {
        return {
          success: false,
          error: getLogicalDatabaseEngineError(clusterResult.data.engine),
        };
      }

      const response = await axios.delete(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/dbs/${request.dbName}`,
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 204) {
        return { success: false, error: "Failed to delete database from DigitalOcean" };
      }

      const supabaseResult = await Database_Clusters.remove_db(request.clusterId, request.dbName);
      if (!supabaseResult.success) {
        return {
          success: false,
          error: "Database deleted from DigitalOcean but failed to sync with database",
        };
      }

      const clusterData = await Database_Clusters.read(request.clusterId);
      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Trash2",
          text: `Database '${request.dbName}' deleted from cluster`,
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
              metadata: { updateType: "database_deleted", dbName: request.dbName },
            })
          );
        } catch (notifErr) {
          console.error("[deleteDatabase] Failed to create notification:", notifErr);
        }
      }

      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && "response" in err) {
        const axiosError = parseAxiosError(err);
        return {
          success: false,
          error: axiosError?.response?.data?.message ?? "Invalid request",
        };
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
      };
    }
  },

  async listDatabases(request: ListDatabasesRequest): Promise<ListDatabasesResult> {
    try {
      const clusterResult = await Database_Clusters.read(request.clusterId);
      if (!clusterResult.success || !clusterResult.data) {
        return { success: false, error: "Database cluster not found" };
      }

      if (!supportsLogicalDatabases(clusterResult.data.engine)) {
        return {
          success: false,
          error: getLogicalDatabaseEngineError(clusterResult.data.engine),
        };
      }

      return listDatabasesFromProvider(request.clusterId, "Unknown error occurred");
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

  // Compatibility method for legacy internal routes that historically called
  // DigitalOcean directly without cluster engine/precheck gates.
  async listDatabasesInternal(
    request: InternalListDatabasesRequest
  ): Promise<ListDatabasesResult> {
    return listDatabasesFromProvider(request.clusterId, "Invalid request");
  },

  async retrieveDatabase(
    request: RetrieveDatabaseRequest
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const clusterResult = await Database_Clusters.read(request.clusterId);
      if (!clusterResult.success || !clusterResult.data) {
        return { success: false, error: "Database cluster not found" };
      }

      if (!supportsLogicalDatabases(clusterResult.data.engine)) {
        return {
          success: false,
          error: getLogicalDatabaseEngineError(clusterResult.data.engine),
        };
      }

      return retrieveDatabaseFromProvider(
        request.clusterId,
        request.name,
        "Unknown error occurred"
      );
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

  // Compatibility method for legacy internal routes that historically called
  // DigitalOcean directly without cluster engine/precheck gates.
  async retrieveDatabaseInternal(
    request: InternalRetrieveDatabaseRequest
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return retrieveDatabaseFromProvider(request.clusterId, request.name, "Invalid request");
  },
};
