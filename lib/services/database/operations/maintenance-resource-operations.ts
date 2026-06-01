import axios from "axios";

import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";

import { getDigitalOceanHeaders, parseAxiosError } from "../helpers";
import { resolveOwnedCluster } from "./cluster-access";
import { sendDatabaseAlertEmail, resolveUserEmail } from "./database-alert-email";

export const maintenanceResourceOperations = {
  async updateMaintenanceWindow(
    clusterId: string,
    day: string,
    hour: string,
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

      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/maintenance`,
        { day, hour },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 204) {
        return {
          success: false,
          error: "Failed to update maintenance window",
          statusCode: response.status,
        };
      }

      await Database_Clusters.update_maintenance_window(clusterId, { day, hour });

      const clusterData = access.cluster;
      if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
        await Projects.add_log({
          project_id: clusterData.project_id,
          event: "Settings",
          text: `Maintenance window updated: ${day} at ${hour}`,
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
            metadata: { updateType: "maintenance", day, hour },
          })
        );
      } catch (notifErr) {
        console.error("[updateMaintenanceWindow] Failed to create notification:", notifErr);
      }

      try {
        const recipient = await resolveUserEmail(String(clusterData.owner_id));
        await sendDatabaseAlertEmail({
          userEmail: recipient,
          serviceName: String(clusterData.name),
          alertTitle: "Maintenance window updated",
          summary: `The maintenance window for your database cluster "${clusterData.name}" was updated to ${day} at ${hour}.`,
          severity: "info",
          metadata: {
            Operation: "Update maintenance window",
            Cluster: String(clusterData.name),
            Day: day,
            Hour: hour,
          },
        });
      } catch (emailErr) {
        console.error("[updateMaintenanceWindow] Failed to send email:", emailErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        return {
          success: false,
          error:
            axiosError?.response?.data?.message ||
            (err instanceof Error ? err.message : "Unknown error occurred"),
          statusCode: axiosError?.response?.status || 500,
        };
      }

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

  async readMaintenanceWindow(
    clusterId: string,
    userId: string
  ): Promise<{ success: boolean; data?: unknown; error?: string; statusCode?: number }> {
    try {
      const access = await resolveOwnedCluster(clusterId, userId, "access");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          statusCode: access.statusCode,
        };
      }
      const supabaseResult = access.cluster;

      if (supabaseResult.window) {
        return { success: true, data: supabaseResult.window };
      }

      if (supabaseResult.status !== "online") {
        return { success: true, data: null };
      }

      try {
        const response = await axios.get(`https://api.digitalocean.com/v2/databases/${clusterId}`, {
          headers: getDigitalOceanHeaders(),
        });

        if (response.status !== 200) {
          return { success: true, data: null };
        }

        return { success: true, data: response.data.database?.maintenance_window || null };
      } catch (doError) {
        console.error("[readMaintenanceWindow] the database provider API error:", doError);
        return { success: true, data: null };
      }
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred",
      };
    }
  },
};
