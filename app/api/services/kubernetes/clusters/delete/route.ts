import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { requireAdmin } from "@/lib/supabase/auth";
import { validateRequest, serviceErrorResponse } from "@/lib/middleware/validate-request";
import { KubernetesService } from "@/lib/services/kubernetes-service";

const DeletePayload = z.object({
  cluster_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const userId = auth.user.id;

  const rl = await limitByUser(userId, {
    prefix: "rl:k8s-cluster-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const validation = validateRequest(DeletePayload, body);
  if (!validation.success) return validation.response;

  const { cluster_id } = validation.data;

  const adminCheck = await requireAdmin();
  const isAdmin = !!adminCheck.ok;

  const result = await KubernetesService.deleteCluster(
    { clusterId: cluster_id, userId, isAdmin },
    req
  );

  if (!result.success) return serviceErrorResponse(result);

  return NextResponse.json(
    {
      message: "cluster deleted successfully",
      droplet_warnings: result.droplet_warnings,
    },
    { status: 200 }
  );
}
