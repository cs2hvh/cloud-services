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

    // Validate node names: each must not exceed 20 characters
    const names: unknown = json?.names;
    if (Array.isArray(names)) {
      const invalid = names.filter((n) => typeof n === "string" && n.length > 20);
      if (invalid.length > 0) {
        return NextResponse.json(
          { message: `Node name(s) exceed 20 characters: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
    } else if (typeof names === "string" && names.length > 20) {
      return NextResponse.json(
        { message: `Node name "${names}" exceeds 20 characters` },
        { status: 400 }
      );
    }

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
