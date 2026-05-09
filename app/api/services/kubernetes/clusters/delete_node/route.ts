import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getAuditContext } from "@/lib/audit/context";
import { clusterOperations } from "@/lib/services/kubernetes/cluster-operations";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();
    const context = getAuditContext(req);

    const result = await clusterOperations.removeNode({
      clusterId: json.cluster_id,
      dropletId: json.droplet_id,
      userId: auth.user!.id,
      userEmail: auth.user!.email,
      auditContext: context,
    });

    if (!result.success) {
      const status = result.errorCode === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ message: "cluster deleted successfully" }, { status: 200 });
  } catch (err: unknown) {
    logError("services/kubernetes/clusters/delete_node", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
