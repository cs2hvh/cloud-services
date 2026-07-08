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
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreRuns } from "@/lib/supabase/queries/agentcore";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agents-run-cancel", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  try {
    const result = await AgentcoreRuns.cancel(org.org_id, id);
    if (!result.success) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json({ success: true, id, status: result.status });
  } catch (err) {
    console.error("[agents] cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel run" }, { status: 500 });
  }
}
