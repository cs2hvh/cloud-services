/**
 * POST /api/agents/[id]/knowledge-base
 *
 * Agent-scoped convenience endpoint: create a vector collection, seed it
 * (pasted text and/or hosted URLs), and attach it to this agent's
 * `file_search` tool — as one call, instead of the 3 separate calls across
 * two subsystems this previously took (POST .../vector/collections, POST
 * .../upsert or .../ingest-url, then PATCH /api/agents/[id] with the
 * resulting collection_id).
 *
 * Deliberately orchestrates the existing, already-billing-aware vector
 * endpoints via internal fetch (forwarding the caller's own Authorization
 * header) rather than re-implementing collection creation/billing here —
 * one source of truth for that logic, this is just the agent-shaped wrapper
 * around it, same relationship /api/agents/[id]/keys has to the general
 * inference.api_keys machinery.
 *
 * Body: { name?: string, description?: string, text?: string, urls?: string[] }
 * At least one of `text` / `urls` is required.
 *
 * Accepts an `ahu_` API key as well as a session. This endpoint forwards the
 * CALLER'S OWN Authorization header to the three vector routes it orchestrates,
 * so widening those (lib/inference/api-key-auth.ts) is what made an API key work
 * end-to-end here — the only thing still refusing one was this front door.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { billableActionRefusal, resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";
import { AgentcoreAgents, type AgentToolDecl } from "@/lib/supabase/queries/agentcore";

const bodySchema = z
  .object({
    name: z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores").optional(),
    description: z.string().max(500).optional(),
    text: z.string().max(200_000).optional(),
    urls: z.array(z.string().url()).max(5).optional(),
    max_results: z.number().int().min(1).max(20).optional(),
  })
  .refine((d) => !!d.text || (d.urls && d.urls.length > 0), {
    message: "Provide `text` and/or `urls` to seed the knowledge base",
  });

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "kb";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    }
  );
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id: agentId } = await params;

  // Step 1 below creates a vector collection, which starts a recurring credit
  // meter. Refuse up front rather than letting the forwarded call fail deep
  // inside step "create" — same rule, but a clear message instead of a nested
  // one about a collection the caller never asked for by name.
  if (auth.apiKey) {
    const refusal = billableActionRefusal(auth.apiKey);
    if (refusal) return NextResponse.json({ error: refusal, code: "key_not_permitted" }, { status: 403 });
  }

  const rl = await limitByUser(auth.subject, { prefix: "rl:agent-kb-create", limit: 5, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };
  // Role gates the session path only — a key has no org role.
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create a knowledge base" }, { status: 403 });
  }

  const agent = await AgentcoreAgents.get(org.org_id, agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  // Forwarded verbatim to the vector routes below — an `ahu_` key or a session
  // bearer, whichever the caller used. Non-null: both paths above required one.
  const authHeader = request.headers.get("authorization") ?? "";
  const origin = request.nextUrl.origin;
  const collectionName = `${slugify(parsed.data.name ?? agent.name)}-${Date.now().toString(36)}`;

  // 1. Create the collection (goes through the real billing reservation +
  //    quota checks in that route — not duplicated here).
  const createRes = await fetch(`${origin}/api/inference/vector/collections`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: collectionName,
      description: parsed.data.description ?? `Knowledge base for agent "${agent.name}"`,
      embedding_model_id: "openai/text-embedding-3-small",
      distance_metric: "cosine",
    }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    return NextResponse.json({ error: createJson.error ?? "Failed to create knowledge base", step: "create" }, { status: createRes.status });
  }
  const collectionId: string = createJson.data?.id ?? createJson.id;

  // Once the collection exists, any failure below must not leave it behind
  // orphaned — it's already gone through billing reservation, so a silent
  // early return here would leave the org paying for a collection nothing
  // ever attaches to. Best-effort delete before responding with the error;
  // cleanup failing doesn't change the response, it's reported alongside it.
  async function failWithCleanup(body: Record<string, unknown>, status: number) {
    let cleanup: "deleted" | "failed" = "deleted";
    try {
      const delRes = await fetch(`${origin}/api/inference/vector/collections/${collectionId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (!delRes.ok) cleanup = "failed";
    } catch {
      cleanup = "failed";
    }
    return NextResponse.json({ ...body, collection_id: collectionId, cleanup }, { status });
  }

  // 2. Seed it — pasted text (paragraph-split) and/or URLs.
  const seedResults: Record<string, unknown> = {};
  if (parsed.data.text) {
    const parts = parsed.data.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const rows = parts.map((content, i) => ({ external_id: `doc-${Date.now()}-${i + 1}`, content }));
    const upsertRes = await fetch(`${origin}/api/inference/vector/collections/${collectionId}/upsert`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const upsertJson = await upsertRes.json().catch(() => ({}));
    if (!upsertRes.ok) {
      return failWithCleanup({ error: upsertJson.error ?? "Failed to seed text, knowledge base was not created", step: "upsert" }, upsertRes.status);
    }
    seedResults.text_rows_upserted = upsertJson.upserted;
  }
  if (parsed.data.urls?.length) {
    const ingestRes = await fetch(`${origin}/api/inference/vector/collections/${collectionId}/ingest-url`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: parsed.data.urls }),
    });
    const ingestJson = await ingestRes.json().catch(() => ({}));
    if (!ingestRes.ok) {
      return failWithCleanup({ error: ingestJson.error ?? "Failed to ingest URLs, knowledge base was not created", step: "ingest-url" }, ingestRes.status);
    }
    seedResults.urls_ingested = ingestJson.urls_fetched;
    seedResults.url_rows_upserted = ingestJson.upserted;
  }

  // 3. Attach file_search to the agent, replacing any prior file_search
  //    entry but leaving every other tool (memory, web_search, code, ...)
  //    untouched — the whole point of this endpoint is not to make the
  //    caller re-specify tools they already had configured.
  const existingTools = (agent.tools ?? []) as AgentToolDecl[];
  const nextTools: AgentToolDecl[] = [
    ...existingTools.filter((t) => t.type !== "file_search"),
    { type: "file_search", collection_id: collectionId, max_results: parsed.data.max_results ?? 5 },
  ];
  const updateResult = await AgentcoreAgents.update(org.org_id, agentId, { tools: nextTools });
  if (!updateResult.success) {
    return failWithCleanup(
      { error: updateResult.error ?? "Failed to attach to the agent, knowledge base was not created", step: "attach" },
      500
    );
  }

  return NextResponse.json({
    success: true,
    collection_id: collectionId,
    collection_name: collectionName,
    ...seedResults,
    agent: updateResult.data,
  });
}
