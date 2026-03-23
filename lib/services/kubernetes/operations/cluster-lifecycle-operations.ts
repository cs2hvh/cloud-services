/**
 * Kubernetes Cluster Operations - Lifecycle
 */

import axios from "axios";
import { NextRequest } from "next/server";

import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { Encryption, generateStrongPassword } from "@/config/functions";
import { getRatesForKubernetes } from "@/config/pricing";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Billing } from "@/lib/supabase/queries/billing";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Projects } from "@/lib/supabase/queries/projects";

import {
  getDigitalOceanHeaders,
  parseAxiosError,
  // redactClusterSecrets,
} from "../helpers";
import type {
  CreateKubernetesClusterRequest,
  CreateKubernetesClusterResult,
  DeleteKubernetesClusterRequest,
  DeleteKubernetesClusterResult,
  UpdateKubernetesClusterRequest,
  ServiceResult,
} from "../types";

/**
 * Resolve user role for audit logs
 */
async function resolveAuditUserRole(): Promise<"user" | "admin"> {
  // For now, default to "user" - can be extended based on your auth logic
  return "user";
}

/**
 * Generate node names for the cluster
 */
function makeNodeKeys(workers: number, clusterName: string): string[] {
  const nodeNames: string[] = [];
  for (let i = 0; i <= workers; i++) {
    const uuid = crypto.randomUUID();
    if (i === 0) {
      nodeNames.push(`${clusterName}-${uuid}-cp-1`);
    } else {
      nodeNames.push(`${clusterName}-${uuid}-wp-${i}`);
    }
  }
  return nodeNames;
}

/**
 * Sleep utility
 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const clusterLifecycleOperations = {
  /**
   * Create a new Kubernetes cluster
   * This follows the same flow as the dashboard:
   * 1. Create droplets on DigitalOcean
   * 2. Wait for droplets to be active
   * 3. Collect node information
   * 4. Provision Kubernetes on the nodes
   */
  async createCluster(
    request: CreateKubernetesClusterRequest,
    req?: NextRequest
  ): Promise<CreateKubernetesClusterResult> {
    try {
      // Check billing
      const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } =
        await getRatesForKubernetes(request.plan_id);

      const balCheck = await ensureBalance(request.owner_id, INITIAL_COST);
      if (!balCheck.ok) {
        return {
          success: false,
          error: "Insufficient credits",
          errorCode: "INSUFFICIENT_BALANCE",
        };
      }

      // Verify project ownership
      const project = await Projects.get_by_id(request.project_id);
      if (!project) {
        return {
          success: false,
          error: "Project not found",
          errorCode: "NOT_FOUND",
        };
      }

      if (project.owner !== request.owner_id) {
        return {
          success: false,
          error: "You do not have permission to create clusters in this project",
          errorCode: "FORBIDDEN",
        };
      }

      // Step 1: Generate node names
      const nodeNames = makeNodeKeys(request.node_pool.count - 1, request.name);
      console.log("[K8s Create] Node names generated:", nodeNames);

      // Step 2: Create droplets on DigitalOcean
      const vmPassword = generateStrongPassword();
      const dropletPayload = {
        names: nodeNames,
        region: request.region,
        size: request.node_pool.size,
        image: "ubuntu-25-04-x64",
        backups: false,
        ipv6: true,
        monitoring: true,
        tags: ["env:prod", "web", "ssh-allowed"],
        user_data: `#cloud-config\npassword: ${vmPassword}!\nchpasswd:\n  list: |\n    root:${vmPassword}\n  expire: false\nssh_pwauth: true`,
      };

      console.log("[K8s Create] Creating droplets...");
      const dropletResponse = await axios.post(
        "https://api.digitalocean.com/v2/droplets",
        dropletPayload,
        { headers: getDigitalOceanHeaders() }
      );

      if (dropletResponse.status !== 202) {
        return {
          success: false,
          error: "Failed to create droplets on DigitalOcean",
          errorCode: "DIGITALOCEAN_API_ERROR",
        };
      }

      // Encrypt password
      const encryptionKey = process.env.ENCRYPTION_KEY!;
      const hashedPassword = Encryption.encrypt(vmPassword, encryptionKey);

      // Step 3: Wait for droplets to be active and collect node information
      const nodes: Array<{
        host: string;
        role: "control-plane" | "worker";
        hostname: string;
        cpu: number;
        memory_mb: number;
        storage: number;
        private_ip?: string;
        droplet_id?: number;
      }> = [];
      const ips: string[] = [];

      const actions = dropletResponse.data.links?.actions || [];
      console.log(`[K8s Create] Waiting for ${actions.length} droplets to become active...`);

      for (let counter = 0; counter < actions.length; counter++) {
        const actionId = actions[counter].id;
        
        // Poll droplet status until completed
        let actionStatus = "in-progress";
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max (60 * 5 seconds)

        while (actionStatus !== "completed" && attempts < maxAttempts) {
          await sleep(5000); // Wait 5 seconds between checks
          
          try {
            const statusCheck = await axios.get(
              `https://api.digitalocean.com/v2/actions/${actionId}`,
              { headers: getDigitalOceanHeaders() }
            );

            actionStatus = statusCheck.data.action.status;
            
            if (actionStatus === "completed") {
              // Get droplet details
              const dropletId = statusCheck.data.action.resource_id;
              const dropletDetails = await axios.get(
                `https://api.digitalocean.com/v2/droplets/${dropletId}`,
                { headers: getDigitalOceanHeaders() }
              );

              const droplet = dropletDetails.data.droplet;
              const publicIp = droplet.networks.v4.find(
                (net: { type: string; ip_address: string }) => net.type === "public"
              )?.ip_address;
              
              const privateIp = droplet.networks.v4.find(
                (net: { type: string; ip_address: string }) => net.type === "private"
              )?.ip_address;

              if (!publicIp) {
                throw new Error(`No public IP found for droplet ${dropletId}`);
              }

              nodes.push({
                host: publicIp,
                role: counter === 0 ? "control-plane" : "worker",
                hostname: droplet.name,
                cpu: droplet.vcpus,
                memory_mb: droplet.memory,
                storage: droplet.disk,
                private_ip: privateIp,
                droplet_id: droplet.id,
              });

              ips.push(publicIp);
              console.log(`[K8s Create] Node ${counter + 1}/${actions.length} ready: ${publicIp}`);
              break;
            }
          } catch (err) {
            console.warn(`[K8s Create] Error checking droplet status (attempt ${attempts + 1}):`, err);
          }

          attempts++;
        }

        if (actionStatus !== "completed") {
          return {
            success: false,
            error: `Timeout waiting for droplet ${counter + 1} to become active`,
            errorCode: "DROPLET_TIMEOUT",
          };
        }
      }

      // Step 4: Wait for SSH to be ready (give nodes time to boot)
      console.log("[K8s Create] Waiting 120 seconds for SSH to be ready...");
      await sleep(120000);

      // Step 5: Create the Kubernetes cluster by calling the existing provision endpoint
      const clusterId = crypto.randomUUID();
      const clusterPayload = {
        provider: "existing",
        cluster: {
          name: request.name,
          location: request.region,
          pod_cidr: "10.244.0.0/16",
          k8s_minor: request.version,
        },
        auth: {
          method: "password",
          user: "root",
          password: hashedPassword,
        },
        nodes,
        ips,
        ownerId: request.owner_id,
        projectId: request.project_id,
        planId: request.plan_id,
      };

      console.log("[K8s Create] Provisioning Kubernetes cluster...");
      
      // Use internal cluster creation logic
      const provisionQueue = (await import("@/lib/queue")).provisionQueue;
      const job = await provisionQueue.add("provision", {
        clusterId,
        ...clusterPayload,
        decryptedPassword: vmPassword,
        role: "user",
      });

      // Add activity log
      if (request.project_id) {
        await Projects.add_log(
          {
            project_id: request.project_id,
            event: "Kubernetes Create",
            text: `Kubernetes cluster '${request.name}' creation started`,
          },
          "user"
        );
      }

      // Post-provision billing
      try {
        await postProvisionBilling({
          userId: request.owner_id,
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
          serviceId: clusterId,
          addActive: Billing.add_active_kubernetes,
        });
      } catch (billingErr) {
        const billingMessage =
          billingErr instanceof Error ? billingErr.message : String(billingErr);
        return {
          success: false,
          error: `Post-provision billing failed: ${billingMessage}`,
          errorCode: "POST_PROVISION_BILLING_FAILED",
        };
      }

      // Audit log
      if (req) {
        const auditContext = getAuditContext(req);
        const userRole = await resolveAuditUserRole();

        await AuditLogService.create({
          user_id: request.owner_id,
          user_role: userRole,
          user_email: request.user_email,
          action: "create",
          service_type: "kubernetes",
          service_id: clusterId,
          service_name: request.name,
          after_state: {
            cluster_id: clusterId,
            provider: "existing",
            cluster_name: request.name,
            location: request.region,
            k8s_minor: request.version,
            pod_cidr: "10.244.0.0/16",
            nodes,
            project_id: request.project_id,
            status: "QUEUED",
          },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
          metadata: {
            job_id: job.id,
            initial_cost: INITIAL_COST,
            hourly_rate: HOURLY_RATE,
            node_count: nodes.length,
            droplet_ids: nodes.map(n => n.droplet_id).filter(Boolean),
          },
        });
      }

      // Notification
      await NotificationService.create(
        createServiceNotification({
          userId: request.owner_id,
          type: "success",
          action: "created",
          serviceType: "kubernetes",
          serviceName: request.name,
          serviceId: clusterId,
        })
      );

      return {
        success: true,
        clusterId: clusterId,
        data: {
          cluster_id: clusterId,
          cluster_name: request.name,
          status: "QUEUED",
          k8s_version: request.version,
          region: request.region,
          project_id: request.project_id,
          owner_id: request.owner_id,
          node_config: {
            size: request.node_pool.size,
            count: request.node_pool.count,
            region: request.region,
          },
          nodes: nodes.map(n => ({
            host: n.host,
            role: n.role,
            hostname: n.hostname,
          })),
        },
      };
    } catch (error) {
      const errorMessage = parseAxiosError(error);
      console.error("[K8s Create] Error:", errorMessage);
      return {
        success: false,
        error: errorMessage,
        errorCode: "CREATE_FAILED",
      };
    }
  },

  /**
   * Update Kubernetes cluster (e.g., node pool size/count or project)
   */
  async updateCluster(
    request: UpdateKubernetesClusterRequest
  ): Promise<ServiceResult> {
    try {
      const cluster = await Clusters.get_by_id(request.clusterId);

      if (!cluster) {
        return {
          success: false,
          error: "Cluster not found",
          errorCode: "NOT_FOUND",
        };
      }

      // Verify ownership
      if (cluster.owner_id !== request.userId) {
        return {
          success: false,
          error: "You do not have permission to update this cluster",
          errorCode: "FORBIDDEN",
        };
      }

      // Update project association if needed
      if (request.project_id && request.project_id !== cluster.project_id) {
        const project = await Projects.get_by_id(request.project_id);
        if (!project) {
          return {
            success: false,
            error: "Target project not found",
            errorCode: "NOT_FOUND",
          };
        }

        if (project.owner !== request.userId) {
          return {
            success: false,
            error: "You do not have permission to move cluster to this project",
            errorCode: "FORBIDDEN",
          };
        }

        await Clusters.update(request.clusterId, { project_id: request.project_id });
      }

      // If node pool changes requested, update via DigitalOcean API
      if (request.node_pool) {
        // This would require getting the node pool ID and updating it
        // For now, returning success for project update only
        console.log("Node pool updates not yet implemented");
      }

      return {
        success: true,
        data: { id: request.clusterId, updated: true },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update cluster",
        errorCode: "UPDATE_FAILED",
      };
    }
  },

  /**
   * Delete a Kubernetes cluster
   */
  async deleteCluster(
    request: DeleteKubernetesClusterRequest,
    req?: NextRequest
  ): Promise<DeleteKubernetesClusterResult> {
    try {
      const cluster = await Clusters.get_by_id(request.clusterId);

      if (!cluster) {
        return {
          success: false,
          error: "Cluster not found",
          errorCode: "NOT_FOUND",
        };
      }

      // Verify ownership
      if (cluster.owner_id !== request.userId) {
        return {
          success: false,
          error: "You do not have permission to delete this cluster",
          errorCode: "FORBIDDEN",
        };
      }

      // Delete via DigitalOcean API
      try {
        await axios.delete(
          `https://api.digitalocean.com/v2/kubernetes/clusters/${cluster.cluster_id}`,
          {
            headers: getDigitalOceanHeaders(),
          }
        );
      } catch (err) {
        // Continue even if DO deletion fails (cluster might already be gone)
        console.warn("DigitalOcean cluster deletion warning:", err);
      }

      // Mark as deleted in database
      await Clusters.update(request.clusterId, { status: "deleted" });

      // Stop billing - use service_id which should be the database record ID
      const dbId = typeof cluster === 'object' && cluster !== null && 'id' in cluster 
        ? (cluster as any).id 
        : cluster.cluster_id;
      try {
        await Billing.remove_active_kubernetes(dbId);
      } catch (billingErr) {
        console.error("Failed to stop billing:", billingErr);
      }

      // Audit log
      if (req) {
        const auditContext = getAuditContext(req);
        const userRole = await resolveAuditUserRole();

        await AuditLogService.create({
          user_id: request.userId,
          user_role: userRole,
          action: "delete",
          service_type: "kubernetes",
          service_id: dbId,
          service_name: cluster.cluster_name,
          before_state: cluster,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
        });
      }

      // Notification
      await NotificationService.create(
        createServiceNotification({
          userId: request.userId,
          type: "info",
          action: "deleted",
          serviceType: "kubernetes",
          serviceName: cluster.cluster_name,
          serviceId: cluster.cluster_id,
        })
      );

      return {
        success: true,
        clusterId: cluster.cluster_id,
      };
    } catch (error) {
      const errorMessage = parseAxiosError(error);
      return {
        success: false,
        error: errorMessage,
        errorCode: "DELETE_FAILED",
      };
    }
  },
};
