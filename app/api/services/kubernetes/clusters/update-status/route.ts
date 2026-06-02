import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications";
import { Projects } from "@/lib/supabase/queries/projects";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { getRatesForKubernetesExisting } from "@/config/pricing";
import { postProvisionBilling } from "@/config/billing-flow";
import { Billing } from "@/lib/supabase/queries/billing";
import { requireAdmin } from "@/lib/supabase/auth";

async function activateKubernetesBillingOnReady(params: {
  clusterId: string;
  ownerId: string;
  nodeConfig?: unknown;
  workers?: unknown;
  controlPlane?: unknown;
}) {
  const supabase = await createServiceClient();

  const { data: activeRow, error: activeRowError } = await supabase
    .schema("billing")
    .from("active_kubernetes")
    .select("service_id")
    .eq("service_id", params.clusterId)
    .eq("status", "active")
    .maybeSingle();

  if (activeRowError) {
    throw new Error(`Failed to check active kubernetes billing: ${activeRowError.message}`);
  }

  if (activeRow?.service_id) {
    return { activated: false, alreadyActive: true };
  }

  const nodeConfig = (params.nodeConfig ?? null) as Record<string, unknown> | null;
  const provisionConfig = (nodeConfig?.provision_config ?? null) as Record<string, unknown> | null;
  const planId = typeof provisionConfig?.plan_id === "string" ? provisionConfig.plan_id : null;

  if (!planId) {
    throw new Error("Missing plan_id in cluster node configuration");
  }

  const workerCount = Array.isArray(params.workers) ? params.workers.length : 0;
  const hasControlPlane = Boolean(params.controlPlane);
  const configuredNodeCount =
    typeof provisionConfig?.node_count === "number" ? Number(provisionConfig.node_count) : null;

  const totalNodes = Math.max(
    hasControlPlane ? workerCount + 1 : workerCount,
    configuredNodeCount !== null ? configuredNodeCount + 1 : 1
  );

  const { initialCost, hourlyRate } = await getRatesForKubernetesExisting(planId, totalNodes);

  await postProvisionBilling({
    userId: params.ownerId,
    initialCost,
    hourlyRate,
    serviceId: params.clusterId,
    serviceType: "kubernetes",
    addActive: Billing.add_active_kubernetes,
  });

  return { activated: true, alreadyActive: false };
}

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { cluster_id, status, create_droplet } = body as {
      cluster_id?: string;
      status?: string;
      create_droplet?: boolean;
    };

    if (!cluster_id) {
      return NextResponse.json({ error: "cluster_id is required" }, { status: 400 });
    }

    const supabase = await createServiceClient();

    const { data: cluster, error: fetchError } = await supabase
      .from("clusters")
      .select("cluster_id, status, owner_id, create_droplet, project_id, cluster_name, node_config, workers, control_plane")
      .eq("cluster_id", cluster_id)
      .single();

    if (fetchError || !cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }

    // Ownership gate (M1): only the cluster owner — or an admin — may change its
    // status or trigger billing activation. This route is the owner's browser
    // lifecycle callback; without this, any authenticated user could POST a
    // victim's cluster_id with status="ready" to activate billing against the
    // victim (owner_id is read from the stored row) or drive arbitrary status
    // transitions on someone else's cluster.
    if (cluster.owner_id !== auth.user.id) {
      const adminCheck = await requireAdmin();
      if (!adminCheck.ok) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
    }

    if (status || typeof create_droplet === "boolean") {
      const updatePayload: Record<string, unknown> = {};
      if (status) updatePayload.status = status;
      if (typeof create_droplet === "boolean") {
        updatePayload.create_droplet = create_droplet;
      }

      const { error: updateError } = await supabase
        .from("clusters")
        .update(updatePayload)
        .eq("cluster_id", cluster_id);

      if (updateError) {
        console.error("[updateClusterStatus] Update failed:", updateError.message);
        return NextResponse.json({ error: "Failed to update cluster status" }, { status: 500 });
      }

      if (status === "ready" && cluster.status !== "ready") {
        const nodeConfig = cluster.node_config as Record<string, unknown> | null;
        const provisionConfig = (nodeConfig?.provision_config ?? null) as Record<string, unknown> | null;
        const isInternalCluster = provisionConfig?.type === "internal";

        if (!isInternalCluster) {
          try {
            const billingState = await activateKubernetesBillingOnReady({
              clusterId: cluster_id,
              ownerId: cluster.owner_id,
              nodeConfig: cluster.node_config,
              workers: cluster.workers,
              controlPlane: cluster.control_plane,
            });

            if (billingState.alreadyActive) {
              console.log(`[updateClusterStatus] Active kubernetes billing already exists for ${cluster_id}`);
            } else {
              console.log(`[updateClusterStatus] Kubernetes billing activated for ${cluster_id}`);
            }
          } catch (billingErr) {
            console.error("[updateClusterStatus] Failed to activate kubernetes billing:", billingErr);
          }

          if (cluster.project_id) {
            await Projects.add_log({
              project_id: cluster.project_id,
              event: "CheckCircle",
              text: `Kubernetes cluster '${cluster.cluster_name}' is ready`,
            });
            console.log("[updateClusterStatus] Activity log added for cluster ready");
          }

          try {
            await NotificationService.create({
              user_id: cluster.owner_id,
              type: "success",
              title: "Kubernetes Cluster Ready",
              message: `Kubernetes cluster ${cluster.cluster_name} is ready.`,
              service_type: "kubernetes",
              service_id: cluster_id,
              action: "deployed",
              metadata: { serviceName: cluster.cluster_name },
            });
            console.log("[updateClusterStatus] Notification sent for cluster ready");
          } catch (notifErr) {
            console.error("[updateClusterStatus] Failed to create notification:", notifErr);
          }
        } else {
          console.log(`[updateClusterStatus] Internal cluster ${cluster_id} ready — skipping billing and notifications`);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Cluster status updated successfully",
        status: status || cluster.status,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/kubernetes/clusters/update-status", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
