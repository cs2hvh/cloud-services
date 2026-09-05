import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getRatesForKubernetesExisting } from "@/config/pricing";
import { postProvisionBilling } from "@/config/billing-flow";
import { Billing } from "@/lib/supabase/queries/billing";
import { NotificationService } from "@/lib/notifications";
// import { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic"; // avoid caching

type Row = {
  cluster_name: string;
  create_droplet: boolean | null;
  create_status: boolean | null;
  connect_status: boolean | null;
  verify_status: boolean | null;
  status: "pending" | "creating" | "ready" | "failed" | "deleted" | null;
  kubeconfig: string | null;
  owner_id: string;
  project_id: string | null;
  node_config: { cpu: number; ram: number; storage: number; provision_config?: { type?: string; plan_id?: string; node_count?: number; [key: string]: unknown } } | null;
  control_plane:{public_ip:string,private_ip:string,droplet_id:string} | null;
  workers: {public_ip:string,private_ip:string,droplet_id:string}[] | null;
};

async function ensureBillingActivatedForReadyCluster(clusterId: string, cluster: Row) {
  if (cluster.status !== "ready") return;

  const supabase = await createServiceClient();
  const { data: activeRow, error: activeRowError } = await supabase
    .schema("billing")
    .from("active_kubernetes")
    .select("service_id")
    .eq("service_id", clusterId)
    .eq("status", "active")
    .maybeSingle();

  if (activeRowError || activeRow?.service_id) {
    return;
  }

  const nodeConfig = (cluster.node_config ?? null) as Record<string, unknown> | null;
  const provisionConfig = (nodeConfig?.provision_config ?? null) as Record<string, unknown> | null;
  const planId = typeof provisionConfig?.plan_id === "string" ? provisionConfig.plan_id : null;
  if (!planId) return;

  const workerCount = Array.isArray(cluster.workers) ? cluster.workers.length : 0;
  const hasControlPlane = Boolean(cluster.control_plane);
  const configuredNodeCount =
    typeof provisionConfig?.node_count === "number" ? Number(provisionConfig.node_count) : null;
  const totalNodes = Math.max(
    hasControlPlane ? workerCount + 1 : workerCount,
    configuredNodeCount !== null ? configuredNodeCount + 1 : 1
  );

  const { initialCost, hourlyRate } = await getRatesForKubernetesExisting(planId, totalNodes);
  await postProvisionBilling({
    userId: cluster.owner_id,
    initialCost,
    hourlyRate,
    serviceId: clusterId,
    serviceType: "kubernetes",
    addActive: Billing.add_active_kubernetes,
  });
}

async function ensureReadyNotification(clusterId: string, cluster: Row) {
  if (cluster.status !== "ready") return;

  const supabase = await createServiceClient();
  const { data: existingNotification, error: notificationCheckError } = await supabase
    .from("notifications")
    .select("id")
    .eq("service_id", clusterId)
    .eq("service_type", "kubernetes")
    .eq("action", "deployed")
    .maybeSingle();

  if (notificationCheckError || existingNotification?.id) {
    return;
  }

  await NotificationService.create({
    user_id: cluster.owner_id,
    type: "success",
    title: "Kubernetes Cluster Ready",
    message: `Kubernetes cluster ${cluster.cluster_name} is ready.`,
    service_type: "kubernetes",
    service_id: clusterId,
    action: "deployed",
    metadata: { serviceName: cluster.cluster_name },
  });
}

export async function POST(
  req: Request
) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const supabase = await createSSRClient();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  if (!body?.clusterId) {
    return NextResponse.json(
      { success: false, error: "clusterId is required" },
      { status: 400 }
    );
  }

  // OWNERSHIP. This query runs on createSSRClient, which is built on
  // SUPABASE_SERVICE_ROLE_KEY (lib/supabase/server.ts:49) and therefore bypasses
  // RLS entirely. Until this filter existed the route authenticated the caller
  // and then handed back ANY cluster named by body.clusterId, whole row
  // included — kubeconfig, control_plane and workers — so one customer could
  // read another customer's cluster-admin credentials by supplying their id.
  //
  // The service-role client is kept because the billing activation and
  // notification calls below legitimately need it. The scoping is therefore
  // explicit here rather than delegated to a policy: on a service-role client
  // there is no policy to fall back on, which is exactly why the omission was
  // invisible.
  const { data, error } = await supabase
    .from("clusters")
    .select("cluster_name, create_droplet, create_status, connect_status, verify_status, status, kubeconfig, node_config, control_plane, workers, owner_id, project_id")
    .eq("cluster_id", body.clusterId)
    .eq("owner_id", auth.user.id)
    .single<Row>();

  if (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch cluster status" },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Cluster not found" },
      { status: 404 }
    );
  }

  try {
    // Skip billing and notifications for internal clusters (explicit marker, not project_id nullness)
    const isInternalCluster = data.node_config?.provision_config?.type === "internal";
    if (!isInternalCluster) {
      await ensureBillingActivatedForReadyCluster(body.clusterId, data);
    }
  } catch (billingErr) {
    console.error("[kubernetes/status] Failed to activate ready billing:", billingErr);
  }

  try {
    const isInternalCluster = data.node_config?.provision_config?.type === "internal";
    if (!isInternalCluster) {
      await ensureReadyNotification(body.clusterId, data);
    }
  } catch (notificationErr) {
    console.error("[kubernetes/status] Failed to ensure ready notification:", notificationErr);
  }

  return NextResponse.json({
    success: true,
    clusterId: body.clusterId,
    createDropletStatus: data.create_droplet ?? false,
    createStatus: data.create_status ?? false,
    connectStatus: data.connect_status ?? false,
    verifyStatus: data.verify_status ?? false,
    status: data.status ?? "pending",
    clusterInfo: data
  });
}
