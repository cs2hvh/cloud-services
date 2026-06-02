/**
 * Kubernetes Cluster Operations - Lifecycle
 */

import axios from "axios";
import { NextRequest } from "next/server";

import {
  ensureBalance,
  postProvisionBilling,
  reserveProvision,
  settleProvision,
  releaseProvision,
  type ProvisionReservation,
} from "@/config/billing-flow";
import { Encryption, generateStrongPassword } from "@/config/functions";
import { getRatesForKubernetes, getRatesForKubernetesExisting } from "@/config/pricing";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { sendServiceAlertEmail, resolveUserEmail } from "@/lib/services/shared/service-alert-email";

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
  AddKubernetesNodeRequest,
  AddKubernetesNodeResult,
  RemoveKubernetesNodeRequest,
  RemoveKubernetesNodeResult,
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
// Node names must not exceed 20 characters (DigitalOcean / Kubernetes hostname limit).
// Format: {name8}-{uuid4}-cp (16 chars) or {name8}-{uuid4}-w{i} (up to 18 chars for i<100)
function makeNodeKeys(workers: number, clusterName: string): string[] {
  const MAX_PREFIX = 8; // safe prefix length to fit within 20 chars for any reasonable worker count
  const namePrefix = clusterName.slice(0, MAX_PREFIX).replace(/[^a-z0-9]/gi, "-").toLowerCase().replace(/-+$/, "");
  const nodeNames: string[] = [];
  for (let i = 0; i <= workers; i++) {
    const shortId = crypto.randomUUID().replace(/-/g, "").slice(0, 4);
    const name = i === 0
      ? `${namePrefix}-${shortId}-cp`
      : `${namePrefix}-${shortId}-w${i}`;
    if (name.length > 20) {
      throw new Error(`Generated node name "${name}" exceeds 20 characters`);
    }
    nodeNames.push(name);
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
    let INITIAL_COST = 0;
    let HOURLY_RATE = 0;
    let settled = false;
    let reservation: ProvisionReservation | undefined;

    try {
      const totalNodes = Math.max(request.node_pool.count, 1);

      if (!request.skipBilling) {
        // Check billing
        const rates = await getRatesForKubernetes(request.plan_id!, totalNodes);
        INITIAL_COST = rates.initialCost;
        HOURLY_RATE = rates.hourlyRate;

        // Atomically reserve (setup + 1h) BEFORE provisioning so concurrent
        // creates can't all pass a stale read and spawn an unbilled fleet.
        const reservationResult = await reserveProvision({
          userId: request.owner_id,
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
        });
        reservation = reservationResult.reservation;
        if (!reservationResult.ok) {
          return {
            success: false,
            error: "Insufficient credits",
            errorCode: "INSUFFICIENT_BALANCE",
          };
        }

        // Verify project ownership
        const project = await Projects.get_by_id(request.project_id!);
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
        // Use an LTS image slug that is broadly available across regions.
        image: "ubuntu-24-04-x64",
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
      // Build control_plane and workers from the nodes array (already populated with droplet_id)
      // This ensures delete works immediately — no orphaned droplets if admin deletes during provisioning
      const cpNode = nodes.find(n => n.role === "control-plane");
      const workerNodes = nodes.filter(n => n.role === "worker");

      const dbCreateResult = await Clusters.create({
        cluster_id: clusterId,
        cluster_name: request.name,
        status: "creating",
        owner_id: request.owner_id,
        ...(request.project_id ? { project_id: request.project_id } : {}),
        k8s_version: request.version,
        node_config: {
          cpu: nodes[0].cpu,
          ram: nodes[0].memory_mb,
          storage: nodes[0].storage,
          ...(request.skipBilling ? { provision_config: { type: "internal" } } : {}),
        },
        control_plane: cpNode ? { public_ip: cpNode.host, private_ip: cpNode.private_ip, droplet_id: cpNode.droplet_id } : null,
        workers: workerNodes.map(w => ({ public_ip: w.host, private_ip: w.private_ip, droplet_id: w.droplet_id })),
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
        ...(request.skipBilling ? { clusterType: "internal" } : {}),
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

      // Post-provision billing (skipped for admin internal clusters)
      if (!request.skipBilling) {
        try {
          await settleProvision({
            reservation: reservation!,
            initialCost: INITIAL_COST,
            hourlyRate: HOURLY_RATE,
            serviceId: clusterId,
            serviceType: "kubernetes",
            addActive: Billing.add_active_kubernetes,
          });
          settled = true;
        } catch (billingErr) {
          const billingMessage =
            billingErr instanceof Error ? billingErr.message : String(billingErr);
          return {
            success: false,
            error: `Post-provision billing failed: ${billingMessage}`,
            errorCode: "POST_PROVISION_BILLING_FAILED",
          };
        }
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

      // Notification (skipped for admin internal clusters)
      if (!request.skipBilling) {
        await NotificationService.create({
          user_id: request.owner_id,
          type: "info",
          title: "Kubernetes Cluster Creation",
          message: "Kubernetes Cluster Creation started.",
          service_type: "kubernetes",
          service_id: clusterId,
          action: "created",
          metadata: { serviceName: request.name },
        });

        try {
          const recipient =
            request.user_email || (await resolveUserEmail(request.owner_id));
          await sendServiceAlertEmail({
            serviceType: "kubernetes",
            userEmail: recipient,
            serviceName: request.name,
            alertTitle: "Kubernetes cluster creation started",
            summary: `Your Kubernetes cluster "${request.name}" is being provisioned. We'll let you know once all nodes are ready and the cluster is online.`,
            severity: "info",
            metadata: {
              Operation: "Create Kubernetes cluster",
              Cluster: request.name,
              Region: request.region,
              "Kubernetes version": request.version,
              Nodes: request.node_pool.count,
            },
          });
        } catch (emailErr) {
          console.error("[K8s Create] Failed to send email:", emailErr);
        }
      }

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
    } finally {
      // Any non-settle exit (insufficient balance, provision failure, throw)
      // refunds the reservation exactly once. No-op once settled or when billing
      // was skipped (admin internal clusters → reservation undefined).
      if (!settled) {
        await releaseProvision(reservation);
      }
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

      try {
        const recipient = await resolveUserEmail(String(cluster.owner_id));
        await sendServiceAlertEmail({
          serviceType: "kubernetes",
          userEmail: recipient,
          serviceName: String(cluster.cluster_name),
          alertTitle: "Kubernetes cluster updated",
          summary: `The configuration of your Kubernetes cluster "${cluster.cluster_name}" was updated.`,
          severity: "info",
          metadata: {
            Operation: "Update Kubernetes cluster",
            Cluster: String(cluster.cluster_name),
          },
        });
      } catch (emailErr) {
        console.error("[K8s Update] Failed to send email:", emailErr);
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
      const clusterStatus = cluster.status as string | undefined;
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

      // Refund setup charge if cluster never reached "ready" (provision failure)
      if (clusterStatus && clusterStatus !== "ready" && clusterStatus !== "deleted") {
        const nodeConfig = (cluster as Record<string, unknown>).node_config as Record<string, unknown> | undefined;
        const provisionConfig = nodeConfig?.provision_config as Record<string, unknown> | undefined;
        const planId = provisionConfig?.plan_id as string | undefined;

        if (planId) {
          try {
            const { initialCost } = await getRatesForKubernetes(planId, 1);
            if (initialCost > 0) {
              const refundResult = await Billing.topup(cluster.owner_id, initialCost);
              await Billing.save_transaction({
                userId: cluster.owner_id,
                amount: initialCost,
                status: "completed",
                type: "refund",
                balanceAfter: refundResult.credit_balance,
                serviceId: request.clusterId,
                serviceType: "kubernetes",
                description: `Refund for kubernetes setup charge (cluster never provisioned)`,
              });
              console.log(`[deleteCluster] Refunded setup charge $${initialCost} for failed cluster ${request.clusterId}`);
            }
          } catch (refundErr) {
            console.warn(`[deleteCluster] Setup charge refund failed:`, refundErr);
          }
        }
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

      try {
        const recipient = await resolveUserEmail(String(cluster.owner_id));
        await sendServiceAlertEmail({
          serviceType: "kubernetes",
          userEmail: recipient,
          serviceName: clusterName,
          alertTitle: "Kubernetes cluster deleted",
          summary: `Your Kubernetes cluster "${clusterName}" was deleted successfully along with its nodes.`,
          severity: "warning",
          metadata: {
            Operation: "Delete Kubernetes cluster",
            Cluster: clusterName,
          },
        });
      } catch (emailErr) {
        console.error("[K8s Delete] Failed to send email:", emailErr);
      }

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
      // Early balance check so users with insufficient funds are rejected
      // before a cluster record is created
      const { initialCost } = await getRatesForKubernetes(
        request.planId,
        Math.max(request.nodeCount, 1)
      );
      const balCheck = await ensureBalance(request.ownerId, initialCost);
      if (!balCheck.ok) {
        return {
          success: false,
          error: "Insufficient credits",
          errorCode: "INSUFFICIENT_BALANCE",
        };
      }

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
      await NotificationService.create({
        user_id: request.ownerId,
        type: "info",
        title: "Kubernetes Cluster Creation",
        message: "Kubernetes Cluster Creation started.",
        service_type: "kubernetes",
        service_id: clusterId,
        action: "created",
        metadata: { serviceName: request.name },
      });

      try {
        const recipient =
          request.userEmail || (await resolveUserEmail(request.ownerId));
        await sendServiceAlertEmail({
          serviceType: "kubernetes",
          userEmail: recipient,
          serviceName: request.name,
          alertTitle: "Kubernetes cluster creation started",
          summary: `Your Kubernetes cluster "${request.name}" has been initialized and provisioning will begin shortly. We'll let you know once it is online.`,
          severity: "info",
          metadata: {
            Operation: "Create Kubernetes cluster",
            Cluster: request.name,
            Region: request.region,
            "Kubernetes version": request.version,
            Nodes: request.nodeCount,
          },
        });
      } catch (emailErr) {
        console.error("[K8s Init] Failed to send email:", emailErr);
      }

      return { success: true, clusterId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initialize cluster",
        errorCode: "INIT_FAILED",
      };
    }
  },

  /**
   * Add a node (DigitalOcean droplet) to an existing cluster.
   * Handles balance check, DigitalOcean API call, and billing rate update.
   */
  async addNode(request: AddKubernetesNodeRequest): Promise<AddKubernetesNodeResult> {
    const { clusterId, planId, userId, userEmail, deferBillingUntilReady = false, dropletPayload, initialCost, expectedNodeCount, auditContext } = request;

    // Resolve cost and hourly rate upfront from plan pricing
    let resolvedInitialCost: number;
    let resolvedHourlyRate: number;

    if (planId) {
      const rates = await getRatesForKubernetesExisting(planId, expectedNodeCount ?? 1);
      resolvedInitialCost = typeof initialCost === "number" ? initialCost : rates.initialCost;
      resolvedHourlyRate = rates.hourlyRate;
    } else {
      resolvedInitialCost = typeof initialCost === "number" ? initialCost : 5.0;
      resolvedHourlyRate = 0.01; // safe minimum fallback
    }

    // Pre-flight balance check
    const hasBalance = await Billing.has_balance(userId, resolvedInitialCost);
    if (!hasBalance) {
      const balance = await Billing.get_balance(userId);
      return {
        success: false,
        error: "Insufficient credits to start this cluster.",
        errorCode: "INSUFFICIENT_BALANCE",
        data: { balance, required: resolvedInitialCost },
      };
    }

    // Generate VM credentials
    const vmPassword = generateStrongPassword();

    // Whitelist only the fields DigitalOcean accepts for droplet creation
    const {
      names, region, size, image, ssh_keys, backups, ipv6,
      monitoring, private_networking, volumes, tags, vpc_uuid, with_droplet_agent,
    } = dropletPayload as Record<string, unknown>;
    const doPayload = {
      names, region, size, image, ssh_keys, backups, ipv6,
      monitoring, private_networking, volumes, tags, vpc_uuid, with_droplet_agent,
      user_data: `#cloud-config\npassword: ${vmPassword}!\nchpasswd:\n  list: |\n    root:${vmPassword}\n  expire: false\nssh_pwauth: true`,
    };

    console.log("[addNode] DO payload:", JSON.stringify({ ...doPayload, user_data: "[redacted]" }));

    // Create droplet on DigitalOcean
    let response;
    try {
      response = await axios.post(
        "https://api.digitalocean.com/v2/droplets",
        doPayload,
        { headers: getDigitalOceanHeaders() }
      );
    } catch (doErr: unknown) {
      const doRes = (doErr as { response?: { data?: unknown; status?: number } })?.response;
      console.error("[addNode] DigitalOcean API error:", doRes?.status, JSON.stringify(doRes?.data));
      return { success: false, error: `API error: ${doRes?.status} ${JSON.stringify(doRes?.data)}`, errorCode: "DO_ERROR" };
    }

    if (response.status !== 202) {
      console.error("[addNode] Unexpected DO status:", response.status, JSON.stringify(response.data));
      return { success: false, error: "DigitalOcean droplet creation failed", errorCode: "DO_ERROR" };
    }

    const vmPasswordEncrypted = Encryption.encrypt(vmPassword, process.env.ENCRYPTION_KEY!);
    if (!deferBillingUntilReady) {
      // Extract droplet ID for cleanup if billing fails
      const createdDroplet = response.data?.droplet as Record<string, unknown> | undefined;
      const dropletId = createdDroplet?.id as string | number | undefined;

      // Deduct the cost upfront and register active kubernetes billing
      try {
        await postProvisionBilling({
          userId,
          initialCost: resolvedInitialCost,
          hourlyRate: resolvedHourlyRate,
          serviceId: clusterId,
          serviceType: "kubernetes",
          addActive: Billing.add_active_kubernetes,
        });
        console.log(`[KubernetesService.addNode] Billing registered: initial=${resolvedInitialCost}, hourly=${resolvedHourlyRate}/hr for ${expectedNodeCount ?? "?"} nodes`);
      } catch (billingErr) {
        // Billing failed, clean up droplet from DigitalOcean to prevent orphaned resource
        if (dropletId) {
          try {
            await axios.delete(
              `https://api.digitalocean.com/v2/droplets/${dropletId}`,
              { headers: getDigitalOceanHeaders() }
            );
            console.error(`[KubernetesService.addNode] Cleaned up droplet ${dropletId} after billing failure`);
          } catch (cleanupErr) {
            console.error(`[KubernetesService.addNode] Failed to clean up droplet ${dropletId} after billing failure:`, cleanupErr);
            // Continue with error reporting below
          }
        }
        const errorMsg = billingErr instanceof Error ? billingErr.message : String(billingErr);
        console.error("[KubernetesService.addNode] Failed to register billing:", errorMsg);
        return {
          success: false,
          error: `Failed to register billing after droplet creation: ${errorMsg}. Droplet has been cleaned up.`,
          errorCode: "BILLING_FAILED",
        };
      }
    } else {
      console.log(`[KubernetesService.addNode] Billing deferred until cluster is ready for ${clusterId}`);
    }

    // Audit log (non-fatal)
    try {
      await AuditLogService.create({
        user_id: userId,
        user_role: "user",
        user_email: userEmail ?? undefined,
        action: "create",
        service_type: "kubernetes",
        service_id: clusterId,
        after_state: { droplet: response.data?.droplet },
        metadata: { operation: "node_addition", nodes_added: 1 },
        ip_address: auditContext?.ipAddress,
        user_agent: auditContext?.userAgent,
        request_id: auditContext?.requestId,
      });
    } catch (auditErr) {
      console.error("[KubernetesService.addNode] Failed to create audit log:", auditErr);
    }

    try {
      const recipient = userEmail || (await resolveUserEmail(userId));
      await sendServiceAlertEmail({
        serviceType: "kubernetes",
        userEmail: recipient ?? undefined,
        serviceName: "Kubernetes cluster",
        alertTitle: "Kubernetes node added",
        summary: `A new worker node is being added to your Kubernetes cluster. It will join the cluster once provisioning completes.`,
        severity: "info",
        metadata: {
          Operation: "Add Kubernetes node",
          "Nodes added": 1,
        },
      });
    } catch (emailErr) {
      console.error("[KubernetesService.addNode] Failed to send email:", emailErr);
    }

    return { success: true, dropletData: response.data, vmPassword: vmPasswordEncrypted };
  },

  /**
   * Remove a worker node from an existing cluster.
   * Updates the cluster workers list and billing rate.
   */
  async removeNode(request: RemoveKubernetesNodeRequest): Promise<RemoveKubernetesNodeResult> {
    const { clusterId, dropletId, userId, userEmail, auditContext } = request;
    const db = await createServiceClient();

    // Fetch current cluster state
    const { data, error } = await db
      .from("clusters")
      .select("workers, cluster_name, project_id, node_config, owner_id")
      .eq("cluster_id", clusterId)
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Cluster not found", errorCode: "NOT_FOUND" };
    }

    // Ownership check
    if (data.owner_id !== userId) {
      return { success: false, error: "You do not have permission to modify this cluster", errorCode: "FORBIDDEN" };
    }

    const workersBefore = (data.workers ?? []) as Array<{ droplet_id: string } & Record<string, unknown>>;
    const filtered = workersBefore.filter(
      (w) => String(w.droplet_id) !== String(dropletId)
    );

    // Verify the node actually existed in the workers array
    if (filtered.length === workersBefore.length) {
      return { success: false, error: `Worker node with droplet_id ${dropletId} not found in cluster`, errorCode: "NOT_FOUND" };
    }

    // Delete droplet from DigitalOcean first
    try {
      await axios.delete(
        `https://api.digitalocean.com/v2/droplets/${dropletId}`,
        { headers: getDigitalOceanHeaders() }
      );
      console.log(`[KubernetesService.removeNode] ✅ Droplet ${dropletId} deleted from DigitalOcean`);
    } catch (doErr: unknown) {
      const doRes = (doErr as { response?: { status?: number } })?.response;
      // 404 means already deleted — that's fine
      if (doRes?.status !== 404) {
        console.error("[KubernetesService.removeNode] Failed to delete droplet from DO:", doErr);
        return { success: false, error: `Failed to delete droplet from DigitalOcean`, errorCode: "DO_ERROR" };
      }
      console.log(`[KubernetesService.removeNode] Droplet ${dropletId} already deleted (404)`);
    }

    // Persist updated workers list
    const { error: updErr } = await db
      .from("clusters")
      .update({ workers: filtered })
      .eq("cluster_id", clusterId)
      .single();

    if (updErr) {
      return { success: false, error: updErr.message, errorCode: "UPDATE_FAILED" };
    }

    // Activity log
    if (data.project_id) {
      await Projects.add_log({
        project_id: data.project_id as string,
        event: "Server",
        text: `Worker node removed from Kubernetes cluster '${data.cluster_name}'`,
      });
    }

    // Update billing rate to reflect reduced node count (non-fatal)
    try {
      const nodeConfig = data.node_config as Record<string, unknown> | null;
      const provisionConfig = nodeConfig?.provision_config as Record<string, unknown> | null;
      const planId = provisionConfig?.plan_id as string | undefined;
      if (planId) {
        // filtered = workers only, +1 for control plane
        const newNodeCount = Math.max(filtered.length + 1, 1);
        const { hourlyRate: newHourlyRate } = await getRatesForKubernetesExisting(planId, newNodeCount);
        await Billing.update_active_kubernetes_rate({ serviceId: clusterId, newHourlyRate });
        console.log(`[KubernetesService.removeNode] ✅ Billing rate updated to ${newHourlyRate}/hr for ${newNodeCount} nodes`);
      } else {
        console.warn("[KubernetesService.removeNode] plan_id not found in node_config.provision_config; skipping billing rate update");
      }
    } catch (billingErr) {
      console.error("[KubernetesService.removeNode] Failed to update billing rate (non-fatal):", billingErr);
    }

    // Audit log (non-fatal)
    try {
      await AuditLogService.create({
        user_id: userId,
        user_role: "user",
        user_email: userEmail ?? undefined,
        action: "delete",
        service_type: "kubernetes",
        service_id: clusterId,
        service_name: data.cluster_name as string | undefined,
        before_state: { workers: workersBefore },
        after_state: { workers: filtered },
        metadata: { operation: "node_deletion", droplet_id: dropletId, nodes_removed: 1 },
        ip_address: auditContext?.ipAddress,
        user_agent: auditContext?.userAgent,
        request_id: auditContext?.requestId,
      });
    } catch (auditErr) {
      console.error("[KubernetesService.removeNode] Failed to create audit log:", auditErr);
    }

    try {
      const recipient = userEmail || (await resolveUserEmail(userId));
      await sendServiceAlertEmail({
        serviceType: "kubernetes",
        userEmail: recipient ?? undefined,
        serviceName: String(data.cluster_name),
        alertTitle: "Kubernetes node removed",
        summary: `A worker node was removed from your Kubernetes cluster "${data.cluster_name}".`,
        severity: "warning",
        metadata: {
          Operation: "Remove Kubernetes node",
          Cluster: String(data.cluster_name),
          "Nodes removed": 1,
        },
      });
    } catch (emailErr) {
      console.error("[KubernetesService.removeNode] Failed to send email:", emailErr);
    }

    return {
      success: true,
      workers: filtered as Array<Record<string, unknown>>,
      data: { workers: filtered, clusterName: data.cluster_name },
    };
  },
};
