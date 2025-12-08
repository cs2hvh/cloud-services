import { NextResponse } from "next/server";
import { z } from "zod";
import { provisionQueue } from "@/lib/queue";
import { Encryption } from "@/config/functions";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Projects } from "@/lib/supabase/queries";
import { requireAdmin } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/rate-limit";




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
});

export async function POST(req: Request) {
  // Basic rate limiting per IP/token
  const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });
  try {
    // Cast to any to satisfy type; limiter reads headers only
    await limiter.check(req as any, 10);
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

  const clusterId = crypto.randomUUID();
  // Derive role server-side to avoid trusting client-provided role
  const adminCheck = await requireAdmin();
  const derivedRole: "admin" | "user" = adminCheck.ok ? "admin" : "user";

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

  return NextResponse.json({ clusterId, job:job.id, status: "QUEUED" });
}
