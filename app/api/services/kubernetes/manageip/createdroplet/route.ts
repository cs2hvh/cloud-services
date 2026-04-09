import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getAuditContext } from "@/lib/audit/context";
import { clusterOperations } from "@/lib/services/kubernetes/cluster-operations";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();
    const context = getAuditContext(req);

    const result = await clusterOperations.addNode({
      clusterId: json?.cluster_id,
      planId: json?.plan_id,
      userId: auth.user!.id,
      userEmail: auth.user!.email,
      dropletPayload: json,
      initialCost: typeof json?.initial_cost === "number" ? json.initial_cost : undefined,
      expectedNodeCount:
        typeof json?.expected_node_count === "number" ? json.expected_node_count : undefined,
      auditContext: context,
    });

    if (!result.success) {
      if (result.errorCode === "INSUFFICIENT_BALANCE") {
        return NextResponse.json(
          {
            error: result.error || "Insufficient credits to start this cluster.",
            message: result.error || "Insufficient credits to start this cluster.",
            ...(result.data as object),
          },
          { status: 402 }
        );
      }
      return NextResponse.json({ message: result.error }, { status: 503 });
    }

    return NextResponse.json(
      {
        data: result.dropletData,
        vmPassword: result.vmPassword,
        message: "Droplet created successfully",
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[createdroplet route] Error:", errorMsg, err);
    return NextResponse.json(
      { message: `Error: ${errorMsg}` },
      { status: 400 }
    );
  }
}
