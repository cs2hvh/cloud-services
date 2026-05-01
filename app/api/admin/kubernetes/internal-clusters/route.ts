import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { provisionQueue } from "@/lib/queue";
import { Encryption } from "@/config/functions";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { clusterLifecycleOperations } from "@/lib/services/kubernetes/operations/cluster-lifecycle-operations";

export const dynamic = "force-dynamic";

// Internal node: no droplet_id (these are existing servers, not DigitalOcean droplets).
// We use 0 as sentinel — the provisioning worker only uses IPs for SSH.
const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const InternalNodeSpec = z.object({
  host: z.string().regex(ipRegex, "Invalid public IPv4"),
  role: z.enum(["control-plane", "worker"]),
  private_ip: z.string().regex(ipRegex, "Invalid private IPv4"),
  hostname: z.string().optional(),
  cpu: z.number().int().positive().optional(),
  memory_mb: z.number().int().positive().optional(),
  storage: z.number().int().positive().optional(),
});

const Payload = z.object({
  mode: z.enum(["auto", "manual"]).default("auto"),
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  location: z.string().min(1),
  k8s_minor: z.string().default("1.31.0"),
  pod_cidr: z.string().default("10.244.0.0/16"),
  ssh_user: z.string().default("ubuntu"),
  // Plaintext password — encrypted server-side before queuing (required for manual, optional for auto)
  ssh_password: z.string().optional(),
  // Auto mode: number of nodes and size
  node_count: z.number().int().min(1).max(10).default(1),
  node_size: z.string().default("s-2vcpu-4gb"),
  // Manual mode: explicit node IPs
  nodes: z.array(InternalNodeSpec).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    mode,
    name,
    location,
    k8s_minor,
    pod_cidr,
    ssh_user,
    ssh_password,
    node_count,
    node_size,
    nodes,
  } = parsed.data;

  const INTERNAL_OWNER_ID = auth.user.id;
  const adminEmail = auth.user.email ?? undefined;

  // ── Auto mode: delegate to cluster lifecycle (provisions DO droplets, skips billing) ──
  if (mode === "auto") {
    const result = await clusterLifecycleOperations.createCluster(
      {
        skipBilling: true,
        name,
        region: location,
        version: k8s_minor,
        node_pool: { count: node_count, size: node_size },
        owner_id: INTERNAL_OWNER_ID,
        user_email: adminEmail,
        isAdmin: true,
      },
      req,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Cluster creation failed", errorCode: result.errorCode },
        { status: 500 },
      );
    }

    return NextResponse.json({ clusterId: result.clusterId, status: "PROVISIONING" });
  }

  // ── Manual mode: existing servers, requires ssh_password + nodes ──
  if (!ssh_password || !ssh_password.trim()) {
    return NextResponse.json(
      { error: "ssh_password is required for manual mode" },
      { status: 400 },
    );
  }
  if (!nodes || nodes.length === 0) {
    return NextResponse.json(
      { error: "nodes array is required for manual mode (at least one node)" },
      { status: 400 },
    );
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const encryptedPassword = Encryption.encrypt(ssh_password, encryptionKey);
  const clusterId = crypto.randomUUID();

  // Insert the cluster row immediately so it appears in the admin UI
  // with status "pending" before the worker completes provisioning.
  const dbResult = await Clusters.create({
    cluster_id: clusterId,
    cluster_name: name,
    status: "pending",
    owner_id: INTERNAL_OWNER_ID,
    // project_id intentionally omitted — internal clusters have no project
    create_droplet: false,
    k8s_version: k8s_minor,
    node_config: {
      provision_config: {
        type: "internal",
        location,
        k8s_minor,
        pod_cidr,
        ssh_user,
        node_count: nodes.length,
      },
    },
  });

  if (!dbResult.success) {
    return NextResponse.json(
      { error: "Failed to create cluster record", details: dbResult.error },
      { status: 500 },
    );
  }

  const queuePayload = {
    clusterId,
    provider: "existing" as const,
    clusterType: "internal" as const,
    cluster: { name, location, pod_cidr, k8s_minor },
    auth: {
      method: "password" as const,
      user: ssh_user,
      password: encryptedPassword,
    },
    // Spread each node, inserting droplet_id: 0 (sentinel — not a DigitalOcean droplet)
    nodes: nodes.map((n) => ({
      host: n.host,
      role: n.role,
      private_ip: n.private_ip,
      hostname: n.hostname,
      cpu: n.cpu,
      memory_mb: n.memory_mb,
      storage: n.storage,
      droplet_id: 0,
    })),
    ips: nodes.map((n) => n.host),
    decryptedPassword: ssh_password,
    ownerId: INTERNAL_OWNER_ID,
    // No projectId or planId — internal clusters bypass billing entirely
    role: "admin" as const,
  };

  const job = await provisionQueue.add("provision", queuePayload);

  const auditContext = getAuditContext(req);
  await AuditLogService.create({
    user_id: INTERNAL_OWNER_ID,
    user_role: "admin",
    user_email: adminEmail,
    action: "create",
    service_type: "kubernetes",
    service_id: clusterId,
    service_name: name,
    after_state: {
      cluster_id: clusterId,
      cluster_type: "internal",
      cluster_name: name,
      location,
      k8s_minor,
      pod_cidr,
      nodes: nodes.map((n) => ({ host: n.host, role: n.role, private_ip: n.private_ip })),
      status: "QUEUED",
    },
    ip_address: auditContext.ipAddress,
    user_agent: auditContext.userAgent,
    request_id: auditContext.requestId,
    metadata: { job_id: job.id, node_count: nodes.length },
  });

  return NextResponse.json({ clusterId, jobId: job.id, status: "QUEUED" });
}
