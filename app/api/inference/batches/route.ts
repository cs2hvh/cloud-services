/**
 * GET  /api/inference/batches    — list batches in active org (paginated)
 * POST /api/inference/batches    — create a batch from an uploaded input file
 *
 * OpenAI-compatible shape. The processor is invoked OUT OF BAND (via
 * POST /api/inference/batches/[id]/process) so this route returns
 * immediately with status='validating'.
 *
 * Create flow:
 *   1. Validate the input file exists in this org + has purpose='batch'
 *   2. Count input lines for request_counts.total (parse-lite, no full
 *      JSON parse — that happens in the processor)
 *   3. Insert batch row with status='validating'
 *   4. Return the OpenAI-shaped batch object
 *
 * The processor (separate route) picks it up, flips status to in_progress,
 * iterates the lines, and writes the output file when done.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { downloadText } from "@/lib/inference/batch-storage";
import {
  serializeBatch,
  type BatchRow,
} from "@/lib/inference/batches";

const ENDPOINTS = ["/v1/chat/completions", "/v1/embeddings"] as const;

const createSchema = z.object({
  input_file_id: z.string().regex(/^file_[a-z0-9]+$/i, "Invalid file id"),
  endpoint: z.enum(ENDPOINTS),
  completion_window: z.literal("24h").default("24h"),
  metadata: z
    .record(z.string(), z.string())
    .refine((m) => Object.keys(m).length <= 16, "metadata supports at most 16 entries")
    .optional(),
});

function makeBatchId(): string {
  return `batch_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-batches-list",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("batches")
    .select("*")
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<BatchRow[]>();

  if (error) {
    console.error("[Inference Batches] list error:", error);
    return NextResponse.json({ error: "Failed to list batches" }, { status: 500 });
  }

  return NextResponse.json({
    object: "list",
    data: (data ?? []).map(serializeBatch),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-batches-create",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create batches" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1. Verify input file belongs to this org + is a batch input
  const { data: inputFile } = await supabase
    .schema("inference")
    .from("files")
    .select("id, purpose, bytes, deleted_at")
    .eq("id", parsed.data.input_file_id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; purpose: string; bytes: number; deleted_at: string | null }>();
  if (!inputFile || inputFile.deleted_at) {
    return NextResponse.json({ error: "input_file_id not found in this org" }, { status: 404 });
  }
  if (inputFile.purpose !== "batch") {
    return NextResponse.json(
      { error: `input_file_id has purpose "${inputFile.purpose}" — expected "batch"` },
      { status: 400 }
    );
  }

  // 2. Quick line-count for request_counts.total — full JSON parse
  //    happens in the processor; this is just for the dashboard. We
  //    don't fail validation here, just record the count.
  let lineCount = 0;
  try {
    const text = await downloadText(org.org_id, parsed.data.input_file_id);
    lineCount = text.split("\n").filter((l) => l.trim().length > 0).length;
  } catch (err) {
    console.error("[Inference Batches] R2 line-count failed:", err);
    return NextResponse.json(
      { error: "Could not read input file from storage" },
      { status: 502 }
    );
  }

  if (lineCount === 0) {
    return NextResponse.json({ error: "Input file is empty" }, { status: 400 });
  }

  // 3. Create batch row
  const id = makeBatchId();
  // 24h window — expressed in milliseconds
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: createdRaw, error: insertErr } = await supabase
    .schema("inference")
    .from("batches")
    .insert({
      id,
      org_id: org.org_id,
      created_by: auth.user!.id,
      endpoint: parsed.data.endpoint,
      input_file_id: parsed.data.input_file_id,
      status: "validating",
      completion_window: parsed.data.completion_window,
      metadata: parsed.data.metadata ?? {},
      request_counts: { total: lineCount, completed: 0, failed: 0 },
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  const created = createdRaw as unknown as BatchRow | null;

  if (insertErr || !created) {
    console.error("[Inference Batches] insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "batch.created",
    targetType: "batch",
    targetId: id,
    metadata: {
      endpoint: parsed.data.endpoint,
      input_file_id: parsed.data.input_file_id,
      lines: lineCount,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json(serializeBatch(created), { status: 201 });
}
