import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { provisionQueue } from "@/lib/queue";
import { Encryption } from "@/config/functions";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Billing } from "@/lib/supabase/queries/billing";
import { Projects } from "@/lib/supabase/queries/projects";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { requireAdmin } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getRatesForKubernetesExisting } from "@/config/pricing";
import { NotificationService } from "@/lib/notifications";
import { AuditLogService, getAuditContext } from "@/lib/audit";




const EncryptedData = z.object({
  encrypted: z.string(),
  iv: z.string(),
  tag: z.string(),
  salt: z.string(),
});
// type TEncryptedData = z.infer<typeof EncryptedData>;
const Auth =  z.object({
    method: z.literal("password"),
    user: z.string().default("ubuntu"),
    password: EncryptedData
  })

const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const NodeSpec = z.object({
  host: z.string().min(1),                         // external IP or DNS
  role: z.enum(["control-plane", "worker"]),
  hostname: z.string().optional(),
  cpu: z.number().int().positive().optional(),
  memory_mb: z.number().int().positive().optional(),
  storage: z.number().int().positive().optional(),
  private_ip: z.string().regex(ipRegex, "Invalid IPv4 address"),
  droplet_id: z.number().int().positive()
});

const Payload = z.object({
  provider: z.literal("existing"),
  cluster: z.object({
    name: z.string(),                              // e.g. "ahura-01"
    location: z.string(),                          // e.g. "mumbai"
    pod_cidr: z.string().default("10.244.0.0/16"),
    k8s_minor: z.string().default("1.31.0")
  }),
  auth: Auth,
  nodes: z.array(NodeSpec) ,
  ips: z.array(z.string().regex(ipRegex, "Invalid IPv4 address")),
  ownerId: z.string(),
  projectId: z.string(),
  planId:z.string().uuid(),
  clusterId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  // Basic rate limiting per IP/token
  const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });
  try {
    await limiter.check(req, 10);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  //console.log(body,".........................41")

  
  const parsed = Payload.safeParse(body);

 
 
  //console.log(parsed.data,".................42")
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

   let decryptedPassword=undefined;
   if(parsed.data?.auth?.password){

     // console.log(parsed.data.auth.password,".........................57")
      decryptedPassword=Encryption.decrypt(parsed.data.auth.password,process.env.ENCRYPTION_KEY!);
      //console.log(decryptedPassword,".........................60");
  }

  const clusterId = parsed.data.clusterId ?? crypto.randomUUID();
  // Derive role server-side to avoid trusting client-provided role
  const adminCheck = await requireAdmin();
  const derivedRole: "admin" | "user" = adminCheck.ok ? "admin" : "user";

  const totalNodes = Math.max(parsed.data.nodes.length, 1);

  // Billing: dynamic from admin pricing and scaled by total nodes (workers + control plane)
  const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } = await getRatesForKubernetesExisting(
    parsed.data.planId,
    totalNodes
  );

  // Check balance BEFORE provisioning
  const balCheck = await ensureBalance(parsed.data.ownerId, INITIAL_COST);
  if (!balCheck.ok) {
    return NextResponse.json({ error: "Insufficient credits", balance: balCheck.balance, required: INITIAL_COST }, { status: 402 });
  }

  const job = await provisionQueue.add("provision", { clusterId, ...parsed.data, decryptedPassword, role: derivedRole });

  // Add activity log for Kubernetes cluster creation
  if (parsed.data.projectId) {
    await Projects.add_log({
      project_id: parsed.data.projectId,
      event: "Kubernetes Create",
      text: `Kubernetes cluster '${parsed.data.cluster.name}' creation started`,
    }, derivedRole);
    console.log(`[createKubernetesCluster] ✅ Activity log added for cluster creation`);
  }

  // Deduct upfront and register active_kubernetes after provisioning
  try {
    await postProvisionBilling({
      userId: parsed.data.ownerId,
      initialCost: INITIAL_COST,
      hourlyRate: HOURLY_RATE,
      serviceId: clusterId,
      addActive: Billing.add_active_kubernetes,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Post-provision billing failed", details: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // Create audit log
  const auditContext = getAuditContext(req);
  await AuditLogService.create({
    user_id: parsed.data.ownerId,
    user_role: derivedRole,
    user_email: auth.user?.email,
    action: 'create',
    service_type: 'kubernetes',
    service_id: clusterId,
    service_name: parsed.data.cluster.name,
    after_state: {
      cluster_id: clusterId,
      provider: parsed.data.provider,
      cluster_name: parsed.data.cluster.name,
      location: parsed.data.cluster.location,
      k8s_minor: parsed.data.cluster.k8s_minor,
      pod_cidr: parsed.data.cluster.pod_cidr,
      nodes: parsed.data.nodes,
      project_id: parsed.data.projectId,
      status: 'QUEUED',
    },
    ip_address: auditContext.ipAddress,
    user_agent: auditContext.userAgent,
    request_id: auditContext.requestId,
    metadata: {
      job_id: job.id,
      initial_cost: INITIAL_COST,
      hourly_rate: HOURLY_RATE,
      node_count: totalNodes,
    },
  });

  // Create notification
  await NotificationService.create({
    user_id: parsed.data.ownerId,
    type: "info",
    title: "Kubernetes Cluster Creation",
    message: `kubernetes cluster ${parsed.data.cluster.name} creation started...`,
    service_type: "kubernetes",
    service_id: clusterId,
    action: "created",
    metadata: { serviceName: parsed.data.cluster.name },
  });

  return NextResponse.json({ clusterId, job:job.id, status: "QUEUED" });
}
