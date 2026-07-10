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
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
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
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id: agentId } = await params;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:agent-kb-create", limit: 5, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create a knowledge base" }, { status: 403 });
  }

  const agent = await AgentcoreAgents.get(org.org_id, agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const authHeader = request.headers.get("authorization")!;
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
