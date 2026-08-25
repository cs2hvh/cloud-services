/**
 * GET    /api/inference/evals/datasets/[id] — dataset detail with cases
 * DELETE /api/inference/evals/datasets/[id] — delete dataset (cascades cases)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { readAllPaged } from "@/lib/admin/paged-read";

/** Bounded read. Reached by PAGING, never by asking PostgREST for it. */
const CASE_LIMIT = 20_000;

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:evals-ds-get", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = makeSupabase();

  const { data: ds } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .select("id, name, description, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  // PAGED, NOT LIMITED. This one sat exactly ON PostgREST's 1,000-row ceiling,
  // which is the worst place to be: a dataset with more than 1,000 cases returned
  // precisely 1,000 and there was no way — not even in principle — to tell a full
  // read from a truncated one. See lib/admin/paged-read.ts.
  const { rows: cases, truncated } = await readAllPaged<Record<string, unknown>>(
    (from, to) =>
      supabase
        .schema("inference")
        .from("eval_cases")
        .select("id, input, expected, tags, created_at")
        .eq("dataset_id", id)
        .order("created_at", { ascending: true })
        .range(from, to)
        .returns<Record<string, unknown>[]>(),
    { maxRows: CASE_LIMIT }
  );

  return NextResponse.json({
    success: true,
    data: { ...ds, cases, cases_truncated: truncated, cases_limit: CASE_LIMIT },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await controlPlaneAuth(request, { session: "header", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, { prefix: "rl:evals-ds-delete", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = makeSupabase();

  // Verify ownership before delete
  const { data: ds } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .select("id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string }>();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  // Block delete while any run for this dataset is still active
  const { count: activeRuns } = await supabase
    .schema("inference")
    .from("eval_runs")
    .select("id", { count: "exact", head: true })
    .eq("dataset_id", id)
    .in("status", ["queued", "running"]);

  if ((activeRuns ?? 0) > 0) {
    return NextResponse.json(
      { error: "Dataset has active runs — cancel them before deleting" },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Failed to delete dataset" }, { status: 500 });

  return NextResponse.json({ success: true });
}
