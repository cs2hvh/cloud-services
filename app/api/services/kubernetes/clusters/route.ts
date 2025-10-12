import { NextResponse } from "next/server";
import { z } from "zod";
import { provisionQueue } from "@/lib/queue";

const Auth = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("password"),
    user: z.string().default("ubuntu"),
    password: z.string().min(1),
  }),
  z.object({
    method: z.literal("key"),
    user: z.string().default("ubuntu"),
    private_key_path: z.string().min(1),
  }),
]);

const NodeSpec = z.object({
  host: z.string(),                               // external IP or DNS
  role: z.enum(["control-plane", "worker"]),
  hostname: z.string().optional(),
  cpu: z.number().int().min(1).optional(),        // validated only
  memory_mb: z.number().int().min(1).optional(), // validated only
  storage:z.number().int().min(1).optional(),
  private_ip: z.string(),
  droplet_id: z.number()
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
   ips: z.array(z.string()),                 // {"cp-1":{...}, "w-1":{...}}
    ownerId: z.string(),      
     projectId: z.string(),
});

export async function POST(req: Request) {
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

  const clusterId = crypto.randomUUID();
  const job = await provisionQueue.add("provision", { clusterId, ...parsed.data });
  console.log(job,"...............job")

  return NextResponse.json({ clusterId, job:job.id, status: "QUEUED" });
}
