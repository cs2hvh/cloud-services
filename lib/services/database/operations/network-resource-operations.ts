import axios from "axios";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import { NextRequest } from "next/server";

import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import type { Rule } from "@/lib/supabase/types";

import { getDigitalOceanHeaders, parseAxiosError } from "../helpers";
import type { AddFirewallRuleResult, DeleteFirewallRuleRequest, DeleteFirewallRuleResult } from "../types";
import { resolveOwnedCluster } from "./cluster-access";
import { sendDatabaseAlertEmail, resolveUserEmail } from "./database-alert-email";

export const networkResourceOperations = {
  async addFirewallRule(
    clusterId: string,
    ipAddress: string,
    userId: string,
    req?: NextRequest
  ): Promise<AddFirewallRuleResult> {
    try {
      const access = await resolveOwnedCluster(clusterId, userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          statusCode: access.statusCode,
        };
      }

      const readExistingFirewall = await axios.get(
        `https://api.digitalocean.com/v2/databases/${clusterId}/firewall`,
        { headers: getDigitalOceanHeaders() }
      );

      if (readExistingFirewall.status !== 200) {
        return {
          success: false,
          error: "Failed to fetch existing firewall rules",
          statusCode: 500,
        };
      }

      const existingRules = readExistingFirewall.data?.rules || [];
      const ipExists = existingRules.some(
        (rule: Rule) => rule.type === "ip_addr" && rule.value === ipAddress
      );
      if (ipExists) {
        return {
          success: false,
          error: "This IP address already exists in the firewall rules",
          statusCode: 400,
        };
      }

      const updateFirewall = await axios.put(
        `https://api.digitalocean.com/v2/databases/${clusterId}/firewall`,
        { rules: [...existingRules, { type: "ip_addr", value: ipAddress }] },
        { headers: getDigitalOceanHeaders() }
      );

      if (updateFirewall.status !== 204) {
        return {
          success: false,
          error: "Failed to update firewall rules",
          statusCode: updateFirewall.status,
        };
      }

      const readFirewall = await axios.get(
        `https://api.digitalocean.com/v2/databases/${clusterId}/firewall`,
        { headers: getDigitalOceanHeaders() }
      );

      if (readFirewall.status !== 200) {
        return {
          success: false,
          error: "Firewall updated but failed to verify",
          statusCode: 500,
        };
      }

      const supabaseResult = await Database_Clusters.update_network_rules(clusterId, readFirewall.data?.rules);
      if (!supabaseResult.success) {
        return {
          success: false,
          error: "Firewall updated but failed to sync with database",
          statusCode: 500,
        };
      }

      const clusterData = access.cluster;
      if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
        await Projects.add_log({
          project_id: clusterData.project_id,
          event: "Shield",
          text: `Added firewall rule: ${ipAddress}`,
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
            before_state: { rules: existingRules },
            after_state: { rules: readFirewall.data?.rules },
            metadata: { operation: "firewall_rule_added", ip_address: ipAddress },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            request_id: auditContext.requestId,
          });
        } catch (auditErr) {
          console.error("[addFirewallRule] Failed to create audit log:", auditErr);
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
            serviceId: clusterId,
            metadata: { updateType: "firewall", ipAddress },
          })
        );
      } catch (notifErr) {
        console.error("[addFirewallRule] Failed to create notification:", notifErr);
      }

      try {
        const recipient = await resolveUserEmail(String(clusterData.owner_id));
        await sendDatabaseAlertEmail({
          userEmail: recipient,
          serviceName: String(clusterData.name),
          alertTitle: "Firewall rule added",
          summary: `A new trusted source (${ipAddress}) was added to the firewall of your database cluster "${clusterData.name}".`,
          severity: "info",
          metadata: {
            Operation: "Add firewall rule",
            Cluster: String(clusterData.name),
            "IP address": ipAddress,
          },
        });
      } catch (emailErr) {
        console.error("[addFirewallRule] Failed to send email:", emailErr);
      }

      return { success: true, rules: readFirewall.data?.rules };
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
          error: GENERIC_SERVICE_ERROR,
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

  async readNetworkRules(
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
      return { success: true, data: access.cluster.network_rules };
    } catch (err: unknown) {
      console.error("[DB:network] failed:", err);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        statusCode: 500,
      };
    }
  },

  async deleteFirewallRule(request: DeleteFirewallRuleRequest): Promise<DeleteFirewallRuleResult> {
    try {
      const access = await resolveOwnedCluster(request.clusterId, request.userId, "modify");
      if (!access.success) {
        return {
          success: false,
          error: access.error,
          statusCode: access.statusCode,
        };
      }

      const readFirewall = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/firewall`,
        { headers: getDigitalOceanHeaders() }
      );

      if (readFirewall.status !== 200) {
        return {
          success: false,
          error: "Failed to fetch current firewall rules",
          statusCode: readFirewall.status,
        };
      }

      const currentRules = (readFirewall.data?.rules || []) as Rule[];
      const remainingRules = currentRules.filter((rule) => rule.uuid !== request.ruleUuid);
      const deletedRule = currentRules.find((rule) => rule.uuid === request.ruleUuid);
      const deletedRuleValue = deletedRule?.value || "unknown IP";

      const updateFirewall = await axios.put(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/firewall`,
        { rules: remainingRules },
        { headers: getDigitalOceanHeaders() }
      );

      if (updateFirewall.status !== 204) {
        return {
          success: false,
          error: "Failed to delete firewall rule",
          statusCode: updateFirewall.status,
        };
      }

      const verifyFirewall = await axios.get(
        `https://api.digitalocean.com/v2/databases/${request.clusterId}/firewall`,
        { headers: getDigitalOceanHeaders() }
      );

      if (verifyFirewall.status !== 200) {
        return {
          success: false,
          error: "Firewall updated but failed to verify",
          statusCode: 500,
        };
      }

      const sync = await Database_Clusters.update_network_rules(request.clusterId, verifyFirewall.data?.rules);
      if (!sync.success) {
        return {
          success: true,
          warning: "IP address deleted from firewall, but failed to update database",
        };
      }

      const clusterData = access.cluster;
      if (typeof clusterData.project_id === "string" && clusterData.project_id.length > 0) {
        await Projects.add_log({
          project_id: clusterData.project_id,
          event: "Shield",
          text: `Removed firewall rule: ${deletedRuleValue}`,
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
            serviceId: request.clusterId,
            metadata: { updateType: "firewall_deleted", ipAddress: deletedRuleValue },
          })
        );
      } catch (notifErr) {
        console.error("[deleteFirewallRule] Failed to create notification:", notifErr);
      }

      try {
        const recipient = await resolveUserEmail(String(clusterData.owner_id));
        await sendDatabaseAlertEmail({
          userEmail: recipient,
          serviceName: String(clusterData.name),
          alertTitle: "Firewall rule removed",
          summary: `A trusted source (${deletedRuleValue}) was removed from the firewall of your database cluster "${clusterData.name}".`,
          severity: "warning",
          metadata: {
            Operation: "Remove firewall rule",
            Cluster: String(clusterData.name),
            "IP address": deletedRuleValue,
          },
        });
      } catch (emailErr) {
        console.error("[deleteFirewallRule] Failed to send email:", emailErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const axiosError = parseAxiosError(err);
      if (axiosError?.response) {
        return {
          success: false,
          error: axiosError?.response?.data?.message || "Unknown error occurred",
          statusCode: axiosError?.response?.status || 500,
        };
      }
      if (err instanceof Error) {
        return {
          success: false,
          error: GENERIC_SERVICE_ERROR,
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
};
