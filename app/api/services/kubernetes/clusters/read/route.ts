import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { requireAdmin } from "@/lib/supabase/auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { KubernetesService } from "@/lib/services/kubernetes-service";
import { serviceErrorResponse } from "@/lib/middleware/validate-request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const userId = auth.user!.id;

  const rl = await limitByUser(userId, {
    prefix: "rl:k8s-cluster-read",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { cluster_id } = body as { cluster_id?: string };

  const adminCheck = await requireAdmin();
  const isAdmin = !!adminCheck.ok;

  if (cluster_id) {
    const result = await KubernetesService.getCluster({
      clusterId: cluster_id,
      userId,
      isAdmin,
    });

    if (!result.success) {
      return serviceErrorResponse(result);
    }

    return NextResponse.json({ success: true, cluster: result.data });
  } else {
    const result = await KubernetesService.readAllOwner(userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  }
}
