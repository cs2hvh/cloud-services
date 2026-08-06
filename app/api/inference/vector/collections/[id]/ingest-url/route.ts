/**
 * POST /api/inference/vector/collections/[id]/ingest-url
 *
 * Seeds a vector collection from one or more hosted web pages/documents
 * instead of pasted text: fetches each URL server-side, extracts readable
 * paragraphs, auto-embeds them with the collection's embedding model, and
 * upserts them as rows (external_id derived from the URL + chunk index, so
 * re-ingesting the same URL updates its rows instead of duplicating them).
 *
 * Body: { urls: string[] }  — max 5 URLs per request, 100 paragraphs total.
 *
 * Same auth/org/quota model as ./upsert/route.ts; this is just a different
 * content source feeding the same underlying upsert path.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";
import { embedText } from "@/lib/inference/embeddings";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { fetchAndExtractParagraphs } from "@/lib/inference/url-ingest";
import { checkVectorQuota } from "@/lib/inference/vector-quota";

const ingestSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(5),
});

const MAX_TOTAL_PARAGRAPHS = 100;

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

function urlRowId(url: string, index: number): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  return `url-${hash}-${index}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Accepts an `ahu_` key. This route stays on the control plane rather than the
  // gateway because its SSRF guard pins the outbound connection to a
  // pre-resolved IP via undici + node:dns/node:net, which Workers cannot do —
  // so widening the credential here is what makes ingestion reachable by API.
  // `authResult`, not `resolved` — this file already uses that name further down
  // for the embedded chunks.
  const authResult = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId) => {
      const o = await getActiveOrgForUser(userId);
      return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
    }
  );
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-ingest-url",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  // Ingestion spends on embeddings, and the vector quota is enforced below, but
  // it does not START a meter — no billableActionRefusal. A public-tier key is
  // still bounded by its own hard cap, exactly as at the gateway.
  const org = { org_id: auth.orgId, role: auth.orgRole };
  // Role gates the session path only — a key has no org role. Its authority is
  // its tier and scope, and a missing org is already a 403 from the resolver.
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot upsert" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: collection, error: cErr } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, dimensions, embedding_model_id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; dimensions: number; embedding_model_id: string | null }>();
  if (cErr || !collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  if (!collection.embedding_model_id) {
    return NextResponse.json(
      { error: "This is a bring-your-own-embeddings collection (no embedding model) — URL ingest requires auto-embed, so it isn't available for this collection." },
      { status: 400 }
    );
  }

  // Fetch + extract every URL up front so a single bad URL fails fast,
  // before spending anything on embeddings.
  const fetched: Array<{ url: string; title: string | null; paragraphs: string[] }> = [];
  for (const url of parsed.data.urls) {
    try {
      fetched.push(await fetchAndExtractParagraphs(url));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : `Failed to fetch ${url}`, failing_url: url },
        { status: 422 }
      );
    }
  }

  const chunks = fetched.flatMap((f) =>
    f.paragraphs.map((content, index) => ({
      external_id: urlRowId(f.url, index),
      content,
      metadata: { source_url: f.url, title: f.title, chunk_index: index },
    }))
  ).slice(0, MAX_TOTAL_PARAGRAPHS);

  if (chunks.length === 0) {
    return NextResponse.json({ error: "No readable text extracted from the given URL(s)" }, { status: 422 });
  }

  const quota = await checkVectorQuota(supabase, org.org_id, chunks.length);
  if (!quota.ok) return quota.response;

  const resolved: Array<{ external_id: string; content: string; metadata: Record<string, unknown>; embedding: number[] }> = [];
  for (const chunk of chunks) {
    try {
      const { embedding } = await embedText(chunk.content, collection.embedding_model_id);
      if (embedding.length !== collection.dimensions) {
        return NextResponse.json(
          { error: `Embedding has ${embedding.length} dims, collection expects ${collection.dimensions}` },
          { status: 400 }
        );
      }
      resolved.push({ ...chunk, embedding });
    } catch (err) {
      console.error("[Inference Vector] URL ingest auto-embed failed:", err);
      return NextResponse.json(
        {
          error: customerSafeErrorMessage(err instanceof Error ? err.message : "Auto-embed failed") || "Auto-embed failed. Try again.",
          failing_row: chunk.external_id,
        },
        { status: 502 }
      );
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .schema("inference")
    .from("vector_rows")
    .upsert(
      resolved.map((r) => ({
        collection_id: collection.id,
        external_id: r.external_id,
        content: r.content,
        metadata: r.metadata,
        embedding: JSON.stringify(r.embedding),
      })),
      { onConflict: "collection_id,external_id" }
    )
    .select("id, external_id");

  if (insErr) {
    console.error("[Inference Vector] URL ingest upsert error:", insErr);
    return NextResponse.json({ error: "Failed to upsert rows" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    urls_fetched: fetched.map((f) => ({ url: f.url, title: f.title, paragraphs: f.paragraphs.length })),
    upserted: inserted?.length ?? 0,
    rows: inserted ?? [],
  });
}
