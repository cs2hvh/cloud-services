import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { requireAdmin } from "@/lib/supabase/auth";
import { validateRequest, serviceErrorResponse } from "@/lib/middleware/validate-request";
import { KubernetesService } from "@/lib/services/kubernetes-service";

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

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const userId = auth.user.id;

  const rl = await limitByUser(userId, {
    prefix: "rl:k8s-cluster-create",
    limit: 15,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const validation = validateRequest(InitPayload, body);
  if (!validation.success) return validation.response;

  const payload = validation.data;

  const adminCheck = await requireAdmin();
  const isAdmin = !!adminCheck.ok;

  if (!isAdmin && payload.ownerId !== userId) {
    return NextResponse.json(
      { error: "You do not have permission to create this cluster" },
      { status: 403 }
    );
  }

  const result = await KubernetesService.initCluster(
    {
      name: payload.name,
      region: payload.region,
      version: payload.version,
      nodeCount: payload.nodeCount,
      size: payload.size,
      ownerId: payload.ownerId,
      actorUserId: userId,
      projectId: payload.projectId,
      planId: payload.planId,
      resources: payload.resources,
      userEmail: auth.user.email,
      isAdmin,
    },
    req
  );

  if (!result.success) return serviceErrorResponse(result);

  return NextResponse.json(
    {
      clusterId: result.clusterId,
      status: "pending",
      message: "Cluster initialized. Droplet creation will begin from the cluster page.",
    },
    { status: 200 }
  );
}
