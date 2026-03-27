import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/supabase/auth";
import { Clusters } from "@/lib/supabase/queries/clusters";
import { Projects } from "@/lib/supabase/queries/projects";

const InitPayload = z.object({
  name: z.string().min(3).max(63),
  region: z.string().min(3),
  version: z.string().min(1),
  nodeCount: z.number().int().min(1).max(20),
  size: z.string().min(1),
  ownerId: z.string().uuid(),
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  resources: z.object({
    cpu: z.number().int().positive(),
    ram: z.number().int().positive(),
    storage: z.number().int().positive(),
  }),
});

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

export async function POST(req: NextRequest) {
  const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });
  try {
    await limiter.check(req, 15);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = InitPayload.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const adminCheck = await requireAdmin();
    const isAdmin = !!adminCheck.ok;

    if (!isAdmin && payload.ownerId !== auth.user.id) {
      return NextResponse.json(
        { error: "You do not have permission to create this cluster" },
        { status: 403 }
      );
    }

    const project = await Projects.get_by_id(payload.projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!isAdmin && project.owner !== payload.ownerId) {
      return NextResponse.json(
        { error: "Project does not belong to selected user" },
        { status: 403 }
      );
    }

    const clusterId = crypto.randomUUID();
    const nodeNames = makeNodeKeys(payload.nodeCount, payload.name);
    const ramInMb = payload.resources.ram * 1024;

    const createResult = await Clusters.create({
      cluster_id: clusterId,
      cluster_name: payload.name,
      owner_id: payload.ownerId,
      project_id: payload.projectId,
      status: "pending",
      create_droplet: false,
      create_status: false,
      connect_status: false,
      verify_status: false,
      k8s_version: payload.version,
      node_config: {
        cpu: payload.resources.cpu,
        ram: ramInMb,
        storage: payload.resources.storage,
        provision_config: {
          region: payload.region,
          size: payload.size,
          version: payload.version,
          node_count: payload.nodeCount,
          node_names: nodeNames,
          plan_id: payload.planId,
        },
      },
    });

    if (!createResult.success) {
      return NextResponse.json(
        { error: createResult.error || "Failed to initialize cluster creation" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        clusterId,
        status: "pending",
        message: "Cluster initialized. Droplet creation will begin from the cluster page.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[kubernetes/clusters/init] Error:", err);
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error occurred" }, { status: 500 });
  }
}
