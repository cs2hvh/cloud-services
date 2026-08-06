/**
 * POST   /api/inference/evals/datasets/[id]/cases — batch-add test cases
 * DELETE /api/inference/evals/datasets/[id]/cases?caseId=... — delete one case
 *
 * Cases are the individual (input, expected) rows in a dataset.
 * input must be a messages array [{role, content}] (OpenAI format).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(32_000),
});

const caseSchema = z.object({
  input:    z.array(messageSchema).min(1),
  expected: z.string().max(8_000).optional().nullable(),
  tags:     z.array(z.string().max(50)).max(20).optional().default([]),
});

const batchSchema = z.object({
  cases: z.array(caseSchema).min(1).max(500),
});

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:evals-cases-add", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    }, { status: 400 });
  }

  const supabase = makeSupabase();

  // Verify dataset ownership
  const { data: ds } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .select("id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string }>();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const rows = parsed.data.cases.map((c) => ({
    dataset_id: id,
    org_id:     org.org_id,
    input:      c.input,
    expected:   c.expected ?? null,
    tags:       c.tags,
  }));

  const { data, error } = await supabase
    .schema("inference")
    .from("eval_cases")
    .insert(rows)
    .select("id, input, expected, tags, created_at");

  if (error) return NextResponse.json({ error: "Failed to add cases" }, { status: 500 });

  return NextResponse.json({ success: true, data, inserted: data?.length ?? 0 }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:evals-cases-del", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const caseId = request.nextUrl.searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "Missing caseId" }, { status: 400 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = makeSupabase();

  // Verify the case belongs to this dataset and org
  const { data: c } = await supabase
    .schema("inference")
    .from("eval_cases")
    .select("id")
    .eq("id", caseId)
    .eq("dataset_id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string }>();

  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  const { error } = await supabase
    .schema("inference")
    .from("eval_cases")
    .delete()
    .eq("id", caseId);

  if (error) return NextResponse.json({ error: "Failed to delete case" }, { status: 500 });

  return NextResponse.json({ success: true });
}
