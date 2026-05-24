/**
 * POST /api/inference/vector/collections/[id]/upsert
 *
 * Batch upsert vector rows into a collection. Each row supplies either:
 *   • `embedding` (number[]) — pre-computed, length must match collection.dimensions
 *   • `content` (string) — server auto-embeds using the collection's embedding_model_id
 *                          (requires OPENROUTER_PLATFORM_KEY env)
 *
 * Body:
 *   { rows: [{ external_id, content?, metadata?, embedding? }, ...] }
 *
 * Max 100 rows per batch. Returns counts of inserted + updated.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { embedText } from "@/lib/inference/embeddings";

const upsertSchema = z.object({
  rows: z
    .array(
      z.object({
        external_id: z.string().min(1).max(200),
        content: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        embedding: z.array(z.number()).optional(),
      })
    )
    .min(1)
    .max(100),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-vec-upsert",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") {
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
    .maybeSingle<{ id: string; dimensions: number; embedding_model_id: string }>();

  if (cErr || !collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Resolve embeddings — pre-computed or auto-embed
  const resolved: Array<{
    external_id: string;
    content: string | null;
    metadata: Record<string, unknown>;
    embedding: number[];
  }> = [];

  for (const r of parsed.data.rows) {
    let embedding = r.embedding;
    if (!embedding) {
      if (!r.content) {
        return NextResponse.json(
          {
            error: `Row "${r.external_id}" must provide either \`embedding\` or \`content\``,
          },
          { status: 400 }
        );
      }
      try {
        const result = await embedText(r.content, collection.embedding_model_id);
        embedding = result.embedding;
      } catch (err) {
        return NextResponse.json(
          {
            error: err instanceof Error ? err.message : "Auto-embed failed",
            failing_row: r.external_id,
          },
          { status: 502 }
        );
      }
    }
    if (embedding.length !== collection.dimensions) {
      return NextResponse.json(
        {
          error: `Row "${r.external_id}" has ${embedding.length} dims, collection expects ${collection.dimensions}`,
        },
        { status: 400 }
      );
    }
    resolved.push({
      external_id: r.external_id,
      content: r.content ?? null,
      metadata: r.metadata ?? {},
      embedding,
    });
  }

  // Upsert with ON CONFLICT (collection_id, external_id)
  const { data: inserted, error: insErr } = await supabase
    .schema("inference")
    .from("vector_rows")
    .upsert(
      resolved.map((r) => ({
        collection_id: collection.id,
        external_id: r.external_id,
        content: r.content,
        metadata: r.metadata,
        // pgvector accepts JSON-stringified array via supabase-js
        embedding: JSON.stringify(r.embedding),
      })),
      { onConflict: "collection_id,external_id" }
    )
    .select("id, external_id");

  if (insErr) {
    console.error("[Inference Vector] upsert error:", insErr);
    return NextResponse.json(
      { error: "Failed to upsert rows", detail: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    upserted: inserted?.length ?? 0,
    rows: inserted ?? [],
  });
}
