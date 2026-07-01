/**
 * GET    /api/inference/evals/datasets/[id] — dataset detail with cases
 * DELETE /api/inference/evals/datasets/[id] — delete dataset (cascades cases)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";

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
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:evals-ds-get", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try { org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? ""); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 }); }

  const supabase = makeSupabase();

  const { data: ds } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .select("id, name, description, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const { data: cases } = await supabase
    .schema("inference")
    .from("eval_cases")
    .select("id, input, expected, tags, created_at")
    .eq("dataset_id", id)
    .order("created_at", { ascending: true })
    .limit(1000);

  return NextResponse.json({ success: true, data: { ...ds, cases: cases ?? [] } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:evals-ds-delete", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try { org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? ""); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 }); }

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
