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
  InitKubernetesClusterRequest,
  InitKubernetesClusterResult,
  UpdateKubernetesClusterRequest,
  ServiceResult,
} from "../types";

/**
 * Resolve user role for audit logs
 */
function resolveAuditUserRole(isAdmin?: boolean): "user" | "admin" {
  return isAdmin ? "admin" : "user";
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
    let clusterId: string | null = null;

    try {
      const totalNodes = Math.max(request.node_pool.count, 1);

      // Check billing
      const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } =
        await getRatesForKubernetes(request.plan_id, totalNodes);

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

      if (!request.isAdmin && project.owner !== request.owner_id) {
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
      clusterId = crypto.randomUUID();

      // Persist the cluster row immediately so GET /kubernetes/{id} cannot 404
      // between POST returning and the background worker completing provisioning.
      const dbCreateResult = await Clusters.create({
        cluster_id: clusterId,
        cluster_name: request.name,
        status: "creating",
        owner_id: request.owner_id,
        project_id: request.project_id,
        k8s_version: request.version,
      });

      if (!dbCreateResult.success) {
        return {
          success: false,
          error: dbCreateResult.error || "Failed to persist cluster record",
          errorCode: "CREATE_FAILED",
        };
      }

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
          serviceType: "kubernetes",
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
        const userRole = resolveAuditUserRole(request.isAdmin);

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
            status: "creating",
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
      await NotificationService.create({
        user_id: request.owner_id,
        type: "info",
        title: "Kubernetes Cluster Creation",
        message: `kubernetes cluster ${request.name} creation started...`,
        service_type: "kubernetes",
        service_id: clusterId,
        action: "created",
        metadata: { serviceName: request.name },
      });

      // Return the persisted DB record so the response shape is identical to GET /kubernetes/{id}
      const persistedCluster = dbCreateResult.data ?? await Clusters.get_by_id(clusterId);
      if (!persistedCluster) {
        return {
          success: false,
          error: "Failed to load persisted cluster record",
          errorCode: "CREATE_FAILED",
        };
      }
      return {
        success: true,
        clusterId,
        data: persistedCluster,
      };
    } catch (error) {
      const errorMessage = parseAxiosError(error);
      console.error("[K8s Create] Error:", errorMessage);
      if (clusterId) {
        try {
          await Clusters.update(clusterId, { status: "failed" });
        } catch (updateErr) {
          console.error("[K8s Create] Failed to mark cluster as failed:", updateErr);
        }
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: request.owner_id,
              type: "error",
              action: "failed",
              serviceType: "kubernetes",
              serviceName: request.name,
              serviceId: clusterId,
              error: errorMessage,
            })
          );
        } catch {
          // best-effort only
        }
      }
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

      // Verify ownership (skip for admins)
      if (!request.isAdmin && cluster.owner_id !== request.userId) {
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

        if (!request.isAdmin && project.owner !== request.userId) {
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

      // Re-read the cluster so the API response contains the full, up-to-date record
      const updatedCluster = await Clusters.get_by_id(request.clusterId);
      if (!updatedCluster) {
        return {
          success: false,
          error: "Failed to load updated cluster",
          errorCode: "UPDATE_FAILED",
        };
      }

      return {
        success: true,
        data: updatedCluster,
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

      // Verify ownership (skip for admins)
      if (!request.isAdmin && cluster.owner_id !== request.userId) {
        return {
          success: false,
          error: "You do not have permission to delete this cluster",
          errorCode: "FORBIDDEN",
        };
      }

      const clusterName = cluster.cluster_name || "Unknown";
      const projectId = cluster.project_id ?? null;
      const dropletDeletionErrors: string[] = [];

      // Close billing first (proration + cleanup)
      try {
        await Billing.close_active_service("kubernetes", {
          userId: cluster.owner_id,
          serviceId: request.clusterId,
          failOnInsufficient: false,
        });
      } catch (billErr) {
        console.warn(`[deleteCluster] Billing close failed:`, billErr);
        // proceed with deletion regardless
      }

      // Delete individual droplets from DigitalOcean
      const clusterRecord = cluster as Record<string, unknown>;
      const controlPlane = clusterRecord.control_plane as Record<string, unknown> | null | undefined;
      const workers = clusterRecord.workers as Array<Record<string, unknown>> | null | undefined;

      if (controlPlane?.droplet_id) {
        try {
          await axios.delete(
            `https://api.digitalocean.com/v2/droplets/${controlPlane.droplet_id}`,
            { headers: getDigitalOceanHeaders() }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          dropletDeletionErrors.push(`Control plane: ${msg}`);
        }
      }

      if (Array.isArray(workers)) {
        for (const worker of workers) {
          if (worker?.droplet_id) {
            try {
              await axios.delete(
                `https://api.digitalocean.com/v2/droplets/${worker.droplet_id}`,
                { headers: getDigitalOceanHeaders() }
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              dropletDeletionErrors.push(`Worker ${worker.droplet_id}: ${msg}`);
            }
          }
        }
      }

      // Mark as deleted in database (soft delete)
      await Clusters.update(request.clusterId, { status: "deleted" });

      // Project activity log
      if (projectId) {
        const logText =
          dropletDeletionErrors.length > 0
            ? `Kubernetes cluster '${clusterName}' deleted (with droplet deletion warnings: ${dropletDeletionErrors.join(", ")})`
            : `Kubernetes cluster '${clusterName}' deleted`;
        await Projects.add_log({
          project_id: projectId,
          event: "Trash2",
          text: logText,
        });
      }

      // Audit log
      if (req) {
        const auditContext = getAuditContext(req);
        const userRole = resolveAuditUserRole(request.isAdmin);

        await AuditLogService.create({
          user_id: request.userId,
          user_role: userRole,
          action: "delete",
          service_type: "kubernetes",
          service_id: request.clusterId,
          service_name: clusterName,
          before_state: cluster,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
          metadata: {
            project_id: projectId,
            droplet_warnings: dropletDeletionErrors.length > 0 ? dropletDeletionErrors : undefined,
          },
        });
      }

      // Notification
      await NotificationService.create(
        createServiceNotification({
          userId: request.userId,
          type: "success",
          action: "deleted",
          serviceType: "kubernetes",
          serviceName: clusterName,
          serviceId: cluster.cluster_id,
        })
      );

      return {
        success: true,
        clusterId: cluster.cluster_id,
        droplet_warnings: dropletDeletionErrors.length > 0 ? dropletDeletionErrors : undefined,
      };
    } catch (error) {
      const errorMessage = parseAxiosError(error);
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: request.userId,
            type: "error",
            action: "deleted",
            serviceType: "kubernetes",
            serviceName: "Kubernetes Cluster",
            error: errorMessage,
          })
        );
      } catch {
        // ignore notification failure
      }
      return {
        success: false,
        error: errorMessage,
        errorCode: "DELETE_FAILED",
      };
    }
  },

  /**
   * Initialize a Kubernetes cluster record (pending state, no droplets yet).
   * Droplet provisioning begins separately from the cluster page.
   */
  async initCluster(
    request: InitKubernetesClusterRequest,
    req?: NextRequest
  ): Promise<InitKubernetesClusterResult> {
    try {
      // Verify project ownership
      const project = await Projects.get_by_id(request.projectId);
      if (!project) {
        return { success: false, error: "Project not found", errorCode: "NOT_FOUND" };
      }

      if (!request.isAdmin && project.owner !== request.ownerId) {
        return {
          success: false,
          error: "Project does not belong to selected user",
          errorCode: "FORBIDDEN",
        };
      }

      const clusterId = crypto.randomUUID();
      const nodeNames = makeNodeKeys(request.nodeCount, request.name);
      const ramInMb = request.resources.ram * 1024;

      const createResult = await Clusters.create({
        cluster_id: clusterId,
        cluster_name: request.name,
        owner_id: request.ownerId,
        project_id: request.projectId,
        status: "pending",
        create_droplet: false,
        create_status: false,
        connect_status: false,
        verify_status: false,
        k8s_version: request.version,
        node_config: {
          cpu: request.resources.cpu,
          ram: ramInMb,
          storage: request.resources.storage,
          provision_config: {
            region: request.region,
            size: request.size,
            version: request.version,
            node_count: request.nodeCount,
            node_names: nodeNames,
            plan_id: request.planId,
          },
        },
      });

      if (!createResult.success) {
        return {
          success: false,
          error: createResult.error || "Failed to initialize cluster",
          errorCode: "CREATE_FAILED",
        };
      }

      // Audit log
      if (req) {
        const auditContext = getAuditContext(req);
        const userRole = resolveAuditUserRole(request.isAdmin);

        await AuditLogService.create({
          user_id: request.actorUserId ?? request.ownerId,
          user_role: userRole,
          user_email: request.userEmail,
          action: "create",
          service_type: "kubernetes",
          service_id: clusterId,
          service_name: request.name,
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
          metadata: { project_id: request.projectId, status: "pending" },
        });
      }

      // Notification
      await NotificationService.create(
        createServiceNotification({
          userId: request.ownerId,
          type: "info",
          action: "created",
          serviceType: "kubernetes",
          serviceName: request.name,
          serviceId: clusterId,
        })
      );

      return { success: true, clusterId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initialize cluster",
        errorCode: "INIT_FAILED",
      };
    }
  },
};
