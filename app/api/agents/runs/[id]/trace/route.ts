/**
 * GET /api/agents/runs/:id/trace — run status + full step waterfall (org-scoped).
 *
 * Session-authed read for the dashboard trace viewer + playground polling.
 * (The api-key gateway equivalent is GET /v1/agents/runs/:id.)
 */
import { NextRequest, NextResponse } from "next/server";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { agentScopeMismatch } from "@/lib/inference/api-key-auth";
import { AgentcoreRuns } from "@/lib/supabase/queries/agentcore";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", allowAgentScoped: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const org = { org_id: auth.orgId, role: auth.orgRole };

  try {
    const run = await AgentcoreRuns.getWithSteps(org.org_id, id);
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    // A key scoped to one agent must not read another agent's run. 404 rather
    // than 403 so the response cannot be used to test whether a run id exists.
    if (agentScopeMismatch(auth, run.agent_id)) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: run });
  } catch (err) {
    console.error("[agents] trace error:", err);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}
