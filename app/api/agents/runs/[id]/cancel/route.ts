/**
 * POST /api/agents/runs/:id/cancel — cancel a queued/running run (org-scoped).
 *
 * Session-authed counterpart to the api-key gateway's POST /v1/agents/
 * runs/:id/cancel — added because no dashboard UI (playground, agent
 * detail Runs tab) had ANY way to stop a run started from the dashboard
 * itself short of minting an API key and calling the gateway directly
 * (found during the "whole agent UI" gap review, 2026-07-08).
 */
import { NextRequest, NextResponse } from "next/server";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { agentScopeMismatch } from "@/lib/inference/api-key-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { AgentcoreRuns } from "@/lib/supabase/queries/agentcore";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", allowAgentScoped: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:agents-run-cancel", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  try {
    // cancel() goes straight to an UPDATE, so there is no row to check against
    // — read the run first, or an agent-scoped key could cancel any run in the
    // org just by guessing an id.
    if (auth.apiKey?.agentId) {
      const run = await AgentcoreRuns.getWithSteps(org.org_id, id);
      if (!run || agentScopeMismatch(auth, run.agent_id)) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
    }

    const result = await AgentcoreRuns.cancel(org.org_id, id);
    if (!result.success) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json({ success: true, id, status: result.status });
  } catch (err) {
    console.error("[agents] cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel run" }, { status: 500 });
  }
}
