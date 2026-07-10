/**
 * POST /api/inference/vector/collections/[id]/ingest-file
 *
 * Seeds a vector collection from uploaded documents (PDF, DOCX, TXT, MD)
 * instead of pasted text or a URL: extracts readable text server-side,
 * auto-embeds it with the collection's embedding model, and upserts it as
 * rows (external_id derived from filename + size + chunk index, so
 * re-uploading the same file updates its rows instead of duplicating them).
 *
 * Body: multipart/form-data, one or more `files` fields — max 5 files,
 * 10MB each, 100 paragraphs total across the batch.
 *
 * Same auth/org/quota model as ./upsert and ./ingest-url; this is just a
 * third content source feeding the same underlying upsert path.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { embedText } from "@/lib/inference/embeddings";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { extractDocumentText, isSupportedFilename, MAX_FILE_BYTES, SUPPORTED_EXTENSIONS } from "@/lib/inference/doc-ingest";
import { checkVectorQuota } from "@/lib/inference/vector-quota";

const MAX_FILES = 5;
const MAX_TOTAL_PARAGRAPHS = 100;

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

function fileRowId(filename: string, size: number, index: number): string {
  const hash = createHash("sha1").update(`${filename}:${size}`).digest("hex").slice(0, 16);
  return `file-${hash}-${index}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-vec-ingest-file",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with `files` field(s)" }, { status: 400 });
  }
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided — attach one or more under the `files` field" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files — max ${MAX_FILES} per request` }, { status: 400 });
  }
  for (const f of files) {
    if (!isSupportedFilename(f.name)) {
      return NextResponse.json(
        { error: `Unsupported file type for "${f.name}" — supported: ${SUPPORTED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `"${f.name}" is too large (${f.size} bytes) — max ${MAX_FILE_BYTES} bytes per file` },
        { status: 400 }
      );
    }
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
    .maybeSingle<{ id: string; dimensions: number; embedding_model_id: string | null }>();
  if (cErr || !collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  if (!collection.embedding_model_id) {
    return NextResponse.json(
      { error: "This is a bring-your-own-embeddings collection (no embedding model) — file ingest requires auto-embed, so it isn't available for this collection." },
      { status: 400 }
    );
  }

  // Extract every file up front so a single bad file fails fast, before
  // spending anything on embeddings.
  const extracted: Array<{ filename: string; size: number; paragraphs: string[] }> = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const { paragraphs } = await extractDocumentText(file.name, buffer);
      extracted.push({ filename: file.name, size: file.size, paragraphs });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : `Failed to extract text from ${file.name}`, failing_file: file.name },
        { status: 422 }
      );
    }
  }

  const chunks = extracted.flatMap((f) =>
    f.paragraphs.map((content, index) => ({
      external_id: fileRowId(f.filename, f.size, index),
      content,
      metadata: { source_file: f.filename, chunk_index: index },
    }))
  ).slice(0, MAX_TOTAL_PARAGRAPHS);

  if (chunks.length === 0) {
    return NextResponse.json({ error: "No readable text extracted from the given file(s)" }, { status: 422 });
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
      console.error("[Inference Vector] File ingest auto-embed failed:", err);
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
    console.error("[Inference Vector] File ingest upsert error:", insErr);
    return NextResponse.json({ error: "Failed to upsert rows" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    files_processed: extracted.map((f) => ({ filename: f.filename, paragraphs: f.paragraphs.length })),
    upserted: inserted?.length ?? 0,
    rows: inserted ?? [],
  });
}
