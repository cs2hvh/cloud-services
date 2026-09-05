import axios from "axios";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import { NextRequest } from "next/server";

import { ConnectionPasswordUpdater, Encryption } from "@/config/functions";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import type { Database_Connection, DatabaseUser, EncryptedData } from "@/lib/supabase/types";

import { getDigitalOceanHeaders, isEncrypted, parseAxiosError } from "../helpers";
import type {
  CreateDatabaseUserRequest,
  DeleteDatabaseUserRequest,
  ListDatabaseUsersRequest,
  ListDatabaseUsersResult,
  ResetDatabaseUserPasswordRequest,
} from "../types";
import { sendDatabaseAlertEmail, resolveUserEmail } from "./database-alert-email";
import { resolveOwnedCluster } from "./cluster-access";
import { providerSegment } from "./provider-path";

function decryptStoredPassword(
  value: unknown,
  encryptionKey: string
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (isEncrypted(value)) {
    return Encryption.decrypt(value, encryptionKey);
  }

  return undefined;
}

export const userResourceOperations = {
  async createDatabaseUser(
    request: CreateDatabaseUserRequest,
    req?: NextRequest,
    userEmail?: string
  ): Promise<{ success: boolean; data?: unknown; error?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "modify");
      if (!access.success) {
        return { success: false, error: access.error, statusCode: access.statusCode };
      }

      const response = await axios.post(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/users`,
        { name: request.name },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 201) {
        return { success: false, error: "Failed to create user in the database provider" };
      }

      const user = response.data.user;
      const encryptionKey = process.env.ENCRYPTION_KEY!;
      const encryptedPassword = user.password
        ? Encryption.encrypt(user.password, encryptionKey)
        : undefined;

      const userData = {
        id: user.name,
        name: user.name,
        role: user.role || "normal",
        password: encryptedPassword,
        created_at: new Date().toISOString(),
      };

      const supabaseResult = await Database_Clusters.add_user(request.clusterId, userData as DatabaseUser);
      if (!supabaseResult.success) {
        return {
          success: false,
          error: "User created in the database provider but failed to sync with database",
        };
      }

      const clusterData = await Database_Clusters.read(request.clusterId);
      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "UserPlus",
          text: `Database user '${request.name}' created`,
        });
      }

      if (clusterData.success && req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterData.data.owner_id,
            user_role: "user",
            user_email: userEmail,
            action: "create",
            service_type: "database",
            service_id: request.clusterId,
            service_name: clusterData.data.name,
            after_state: { user_name: request.name, role: user.role },
            metadata: { operation: "user_created" },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[createDatabaseUser] Failed to create audit log:", auditErr);
        }
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
              metadata: { updateType: "user_created", userName: request.name },
            })
          );
        } catch (notifErr) {
          console.error("[createDatabaseUser] Failed to create notification:", notifErr);
        }

        try {
          const recipient =
            userEmail || (await resolveUserEmail(String(clusterData.data.owner_id)));
          await sendDatabaseAlertEmail({
            userEmail: recipient,
            serviceName: String(clusterData.data.name),
            alertTitle: "Database user created",
            summary: `A new database user "${request.name}" was created on your cluster "${clusterData.data.name}".`,
            severity: "info",
            metadata: {
              Operation: "Create database user",
              "Database user": request.name,
              Cluster: String(clusterData.data.name),
            },
          });
        } catch (emailErr) {
          console.error("[createDatabaseUser] Failed to send email:", emailErr);
        }
      }

      return { success: true, data: user };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        return {
          success: false,
          error: axiosError?.response?.data?.message ?? "Invalid request",
          statusCode: axiosError.response.status,
        };
      }

      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        statusCode: 500,
      };
    }
  },

  async listDatabaseUsers(request: ListDatabaseUsersRequest): Promise<ListDatabaseUsersResult> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "access");
      if (!access.success) {
        return { success: false, error: access.error, statusCode: access.statusCode };
      }

      const response = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/users`,
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 200) {
        return { success: false, error: "Failed to fetch users from the database provider" };
      }

      const users = response.data.users as DatabaseUser[];
      const encryptionKey = process.env.ENCRYPTION_KEY!;

      const existingUsersResult = await Database_Clusters.get_users(request.clusterId);
      const existingUsers =
        existingUsersResult.success && Array.isArray(existingUsersResult.data)
          ? existingUsersResult.data
          : [];

      const existingUsersByName = new Map<string, { password?: unknown; created_at?: string }>();
      existingUsers.forEach((u: { name: string; password?: unknown; created_at?: string }) => {
        existingUsersByName.set(u.name, u);
      });

      const formattedUsers = users.map((user: { name: string; role?: string; password?: string }) => {
        const existingUser = existingUsersByName.get(user.name);
        const resolvedPassword =
          user.password || decryptStoredPassword(existingUser?.password, encryptionKey);

        return {
          id: user.name,
          name: user.name,
          role: user.role || "normal",
          password: resolvedPassword,
          created_at: existingUser?.created_at,
        };
      });

      const usersForSync = formattedUsers.map((user) => ({
        ...user,
        password: (user.password ? Encryption.encrypt(user.password, encryptionKey) : undefined) as unknown as string | undefined,
      }));

      const syncResult = await Database_Clusters.update_users(request.clusterId, usersForSync);
      if (!syncResult.success) {
        return {
          success: true,
          data: formattedUsers,
          warning: syncResult.error,
        };
      }

      return {
        success: true,
        data: formattedUsers,
      };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          statusCode: axiosError.response.status,
        };
      }

      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        statusCode: 500,
      };
    }
  },

  async deleteDatabaseUser(
    request: DeleteDatabaseUserRequest,
    req?: NextRequest
  ): Promise<{ success: boolean; error?: string; statusCode?: number }> {
    if (request.username.toLowerCase() === "doadmin") {
      return { success: false, error: "cannot delete admin user", statusCode: 400 };
    }

    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "modify");
      if (!access.success) {
        return { success: false, error: access.error, statusCode: access.statusCode };
      }

      const response = await axios.delete(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/users/${providerSegment(request.username, "username")}`,
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 204) {
        return { success: false, error: "Failed to delete user from the database provider" };
      }

      const supabaseResult = await Database_Clusters.remove_user(request.clusterId, request.username);
      if (!supabaseResult.success) {
        return {
          success: false,
          error: "User deleted from the database provider but failed to sync with database",
        };
      }

      const clusterData = await Database_Clusters.read(request.clusterId);
      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "UserMinus",
          text: `Database user '${request.username}' deleted`,
        });
      }

      if (clusterData.success && req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterData.data.owner_id,
            user_role: "user",
            user_email: request.userEmail,
            action: "delete",
            service_type: "database",
            service_id: request.clusterId,
            service_name: clusterData.data.name,
            before_state: { user_name: request.username },
            metadata: { operation: "user_deleted" },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[deleteDatabaseUser] Failed to create audit log:", auditErr);
        }
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
              metadata: { updateType: "user_deleted", userName: request.username },
            })
          );
        } catch (notifErr) {
          console.error("[deleteDatabaseUser] Failed to create notification:", notifErr);
        }

        try {
          const recipient =
            request.userEmail || (await resolveUserEmail(String(clusterData.data.owner_id)));
          await sendDatabaseAlertEmail({
            userEmail: recipient,
            serviceName: String(clusterData.data.name),
            alertTitle: "Database user deleted",
            summary: `The database user "${request.username}" was deleted from your cluster "${clusterData.data.name}".`,
            severity: "warning",
            metadata: {
              Operation: "Delete database user",
              "Database user": request.username,
              Cluster: String(clusterData.data.name),
            },
          });
        } catch (emailErr) {
          console.error("[deleteDatabaseUser] Failed to send email:", emailErr);
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        const apiMessage = String(
          axiosError?.response?.data?.message ?? "Invalid request"
        );
        const loweredMessage = apiMessage.toLowerCase();
        if (
          loweredMessage.includes("doadmin") ||
          (loweredMessage.includes("admin") &&
            (loweredMessage.includes("delete") || loweredMessage.includes("remove")))
        ) {
          return {
            success: false,
            error: "cannot delete admin user",
            statusCode: 400,
          };
        }

        return {
          success: false,
          error: apiMessage,
          statusCode: axiosError.response.status,
        };
      }

      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        statusCode: 500,
      };
    }
  },

  async resetDatabaseUserPassword(
    request: ResetDatabaseUserPasswordRequest,
    req?: NextRequest,
    userEmail?: string
  ): Promise<{ success: boolean; data?: unknown; error?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "modify");
      if (!access.success) {
        return { success: false, error: access.error, statusCode: access.statusCode };
      }

      const response = await axios.post(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/users/${providerSegment(request.username, "username")}/reset_auth`,
        {},
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 200) {
        return { success: false, error: "Failed to reset password in the database provider" };
      }

      const user = response.data.user;
      const encryptionKey = process.env.ENCRYPTION_KEY!;

      const usersResult = await Database_Clusters.get_users(request.clusterId);
      if (usersResult.success && Array.isArray(usersResult.data)) {
        const updatedUsers = usersResult.data.map((u: DatabaseUser) => {
          if (u.name === request.username) {
            const updatedUser: DatabaseUser = { ...u };
            if (user.password) {
              updatedUser.password = Encryption.encrypt(user.password, encryptionKey) as unknown as string;
            }
            return updatedUser;
          }
          return u;
        });
        await Database_Clusters.update_users(request.clusterId, updatedUsers);
      }

      const clusterResult = await Database_Clusters.read(request.clusterId);
      if (user.password) {
        if (clusterResult.success && clusterResult.data) {
          const cluster = clusterResult.data;
          const connectionUser = cluster.public_connection?.user;

          if (connectionUser === request.username) {
            const updatedPublicConnection = { ...cluster.public_connection };
            const updatedPrivateConnection = { ...cluster.private_connection };

            if (updatedPublicConnection.uri) {
              const newUri = ConnectionPasswordUpdater.updateEncryptedUri(
                updatedPublicConnection.uri as EncryptedData,
                request.username,
                user.password,
                encryptionKey
              );
              if (newUri) {
                updatedPublicConnection.uri = newUri;
              }
            }
            if (updatedPublicConnection.password) {
              updatedPublicConnection.password = Encryption.encrypt(user.password, encryptionKey);
            }

            if (updatedPrivateConnection.uri) {
              const newUri = ConnectionPasswordUpdater.updateEncryptedUri(
                updatedPrivateConnection.uri as EncryptedData,
                request.username,
                user.password,
                encryptionKey
              );
              if (newUri) {
                updatedPrivateConnection.uri = newUri;
              }
            }
            if (updatedPrivateConnection.password) {
              updatedPrivateConnection.password = Encryption.encrypt(user.password, encryptionKey);
            }

            await Database_Clusters.update_connections(
              request.clusterId,
              updatedPublicConnection as Database_Connection,
              updatedPrivateConnection as Database_Connection
            );
          }
        }
      }

      if (clusterResult.success && clusterResult.data.project_id) {
        await Projects.add_log({
          project_id: clusterResult.data.project_id,
          event: "RefreshCw",
          text: `Database user '${request.username}' password reset`,
        });
      }

      if (clusterResult.success && req) {
        try {
          const auditContext = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterResult.data.owner_id,
            user_role: "user",
            user_email: userEmail,
            action: "update",
            service_type: "database",
            service_id: request.clusterId,
            service_name: clusterResult.data.name,
            after_state: { user_name: request.username },
            metadata: { operation: "user_password_reset" },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[resetDatabaseUserPassword] Failed to create audit log:", auditErr);
        }
      }

      if (clusterResult.success) {
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: clusterResult.data.owner_id,
              type: "warning",
              action: "updated",
              serviceType: "database",
              serviceName: clusterResult.data.name,
              serviceId: request.clusterId,
              metadata: { updateType: "user_password_reset", userName: request.username },
            })
          );
        } catch (notifErr) {
          console.error("[resetDatabaseUserPassword] Failed to create notification:", notifErr);
        }

        try {
          await sendDatabaseAlertEmail({
            userEmail,
            serviceName: String(clusterResult.data.name),
            alertTitle: "Database user password reset",
            summary: `The password for database user "${request.username}" was reset on cluster "${clusterResult.data.name}".`,
            severity: "warning",
            metadata: {
              Operation: "Reset database user password",
              "Database user": request.username,
              Cluster: String(clusterResult.data.name),
            },
          });
        } catch (emailErr) {
          console.error("[resetDatabaseUserPassword] Failed to send email:", emailErr);
        }
      }

      return { success: true, data: user };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          statusCode: axiosError.response.status,
        };
      }

      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        statusCode: 500,
      };
    }
  },
};
