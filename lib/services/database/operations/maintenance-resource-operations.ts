import axios from "axios";

import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";

import { getDigitalOceanHeaders, parseAxiosError } from "../helpers";

export const maintenanceResourceOperations = {
  async updateMaintenanceWindow(
    clusterId: string,
    day: string,
    hour: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/maintenance`,
        { day, hour },
        { headers: getDigitalOceanHeaders() }
      );

      if (response.status !== 204) {
        return { success: false, error: "Failed to update maintenance window" };
      }

      await Database_Clusters.update_maintenance_window(clusterId, { day, hour });

      const clusterData = await Database_Clusters.read(clusterId);
      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Settings",
          text: `Maintenance window updated: ${day} at ${hour}`,
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
              metadata: { updateType: "maintenance", day, hour },
            })
          );
        } catch (notifErr) {
          console.error("[updateMaintenanceWindow] Failed to create notification:", notifErr);
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

  async readMaintenanceWindow(
    clusterId: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const supabaseResult = await Database_Clusters.read(clusterId);
      if (!supabaseResult.success || !supabaseResult.data) {
        return { success: false, error: "Database cluster not found" };
      }

      if (supabaseResult.data.window) {
        return { success: true, data: supabaseResult.data.window };
      }

      if (supabaseResult.data.status !== "online") {
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
        console.error("[readMaintenanceWindow] DigitalOcean API error:", doError);
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
