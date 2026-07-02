/**
 * GET /api/agents/runs/:id/trace — run status + full step waterfall (org-scoped).
 *
 * Session-authed read for the dashboard trace viewer + playground polling.
 * (The api-key gateway equivalent is GET /v1/agents/runs/:id.)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreRuns } from "@/lib/supabase/queries/agentcore";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  try {
    const run = await AgentcoreRuns.getWithSteps(org.org_id, id);
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: run });
  } catch (err) {
    console.error("[agents] trace error:", err);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}
