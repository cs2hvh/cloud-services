/**
 * GET  /api/agents/runs — list the org's recent runs
 * POST /api/agents/runs — enqueue a run from the dashboard (playground)
 *
 * Session-authed, org-scoped sibling of the api-key gateway (/v1/responses).
 * The dashboard uses this so a user can run an agent without minting an API key;
 * the agent-runner then executes the queued run exactly the same way.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreAgents, AgentcoreRuns, orgPayer, orgHardCapReached } from "@/lib/supabase/queries/agentcore";
import { createRunSchema } from "@/lib/agentcore/agent-schema";

export async function GET(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  const agentId = request.nextUrl.searchParams.get("agent_id") ?? undefined;
  try {
    const runs = await AgentcoreRuns.list(org.org_id, { agentId });
    return NextResponse.json({ success: true, data: runs });
  } catch (err) {
    console.error("[agents] runs list error:", err);
    return NextResponse.json({ error: "Failed to list runs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agents-run", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Insufficient role — developer or higher required" }, { status: 403 });
  }

  // Enforce the org monthly hard cap BEFORE enqueuing — same ceiling the API
  // gateway (spendCheckMiddleware) applies, so the dashboard path can't bypass it.
  if (await orgHardCapReached(org.org_id)) {
    return NextResponse.json(
      { error: "Organization monthly hard cap reached", code: "hard_cap_reached" },
      { status: 402 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // Resolve the cost ceiling: from the stored agent, or the inline request.
  let maxCostCents = d.max_cost_cents ?? null;
  if (d.agent_id) {
    const agent = await AgentcoreAgents.get(org.org_id, d.agent_id);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    maxCostCents = agent.max_cost_cents;
  } else if (d.model && !(await AgentcoreAgents.modelExists(d.model))) {
    return NextResponse.json({ error: `Unknown or inactive model: ${d.model}` }, { status: 400 });
  }
  if (maxCostCents == null) {
    return NextResponse.json({ error: "Unable to resolve cost ceiling" }, { status: 400 });
  }

  const payer = await orgPayer(org.org_id);
  if (!payer) return NextResponse.json({ error: "Unable to resolve billing account" }, { status: 500 });

  const result = await AgentcoreRuns.create({
    org_id: org.org_id,
    agent_id: d.agent_id ?? null,
    billing_user_id: payer,
    input: d as Record<string, unknown>,
    max_cost_cents: maxCostCents,
    previous_response_id: d.previous_response_id ?? null,
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to create run" }, { status: 400 });
  }

  return NextResponse.json({ id: result.id, object: "response", status: "queued" }, { status: 202 });
}
