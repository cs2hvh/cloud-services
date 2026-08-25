/**
 * GET  /api/agents/runs — list the org's recent runs
 * POST /api/agents/runs — enqueue a run from the dashboard (playground)
 *
 * Org-scoped sibling of the api-key gateway (/v1/responses). The dashboard uses
 * this so a user can run an agent without minting an API key; the agent-runner
 * then executes the queued run exactly the same way.
 *
 * GET also accepts an `ahu_` key, because the gateway can fetch ONE run by id
 * (GET /v1/agents/runs/:id) but cannot LIST them. An API customer who fires runs
 * asynchronously and loses an id, or who wants "what did my agent do today",
 * previously had to open a browser to find out. POST stays session-only on
 * purpose: the gateway already enqueues runs (POST /v1/agents/:id/runs), and a
 * second way to spend money is not worth the risk of the two drifting.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreAgents, AgentcoreRuns, orgPayer, orgHardCapReached } from "@/lib/supabase/queries/agentcore";
import { createRunSchema } from "@/lib/agentcore/agent-schema";
import { resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";

/** Which credential started each run, resolved in one batch query — an agent
 *  bound to both a private backend key and a public widget key needs to tell
 *  "my own dashboard testing" apart from "a real external caller" in its run
 *  history (doc 15). Absent api_key_id = the dashboard itself (session-authed
 *  playground/run button), not an API key at all. */
async function resolveKeyLabels(orgId: string, apiKeyIds: string[]): Promise<Map<string, { name: string; tier: string }>> {
  const labels = new Map<string, { name: string; tier: string }>();
  if (apiKeyIds.length === 0) return labels;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("api_keys")
    .select("id, name, key_tier")
    .eq("org_id", orgId)
    .in("id", apiKeyIds)
    .returns<{ id: string; name: string; key_tier: string }[]>();
  for (const k of data ?? []) labels.set(k.id, { name: k.name, tier: k.key_tier });
  return labels;
}

export async function GET(request: NextRequest) {
  const authResult = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId, email) => {
      // getOrBootstrapOrgForUser THROWS rather than returning null. Uncaught,
      // that escapes as a bare framework 500 with no JSON body — which is what
      // these routes used to catch themselves before the org resolution moved
      // in here. Swallow it to null and let the resolver answer normally.
      try {
        const o = await getOrBootstrapOrgForUser(userId, email);
        return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
      } catch {
        return null;
      }
    },
    undefined,
    true // agent-scoped keys allowed: the handler pins them to their own agent
  );
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  // An agent-scoped key sees ONLY its own agent's runs. The filter is FORCED,
  // not defaulted: honouring `?agent_id=` from such a key would let a key minted
  // for one agent read every other agent's run history — including their inputs
  // and outputs — across the whole org. The query param is only obeyed for
  // credentials that speak for the org.
  const requested = request.nextUrl.searchParams.get("agent_id") ?? undefined;
  const agentId = auth.apiKey?.agentId ?? requested;

  try {
    const runs = await AgentcoreRuns.list(auth.orgId, { agentId });
    const keyIds = Array.from(new Set(runs.map((r) => r.api_key_id).filter((v): v is string => !!v)));
    const keyLabels = await resolveKeyLabels(auth.orgId, keyIds);
    const data = runs.map((r) => ({
      ...r,
      // A revoked/since-deleted key still shows the run — key_name falls
      // back to null rather than silently dropping the whole field.
      key_name: r.api_key_id ? (keyLabels.get(r.api_key_id)?.name ?? null) : null,
      key_tier: r.api_key_id ? (keyLabels.get(r.api_key_id)?.tier ?? null) : null,
    }));
    return NextResponse.json({ success: true, data, scoped_to_agent: auth.apiKey?.agentId ?? null });
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
  // No `auth.via` guard here: this handler is session-only by design (the
  // gateway owns run creation), so the caller is always a person with a role.
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
