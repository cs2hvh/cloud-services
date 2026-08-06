/**
 * GET    /api/inference/evals/runs/[id] — run detail with results
 * DELETE /api/inference/evals/runs/[id] — cancel a queued/running run
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { readAllPaged } from "@/lib/admin/paged-read";

/** Bounded read. Reached by PAGING, never by asking PostgREST for it. */
const RESULT_LIMIT = 20_000;

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

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:evals-run-get", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try { org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? ""); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 }); }

  const supabase = makeSupabase();

  const { data: run } = await supabase
    .schema("inference")
    .from("eval_runs")
    .select(`
      id, name, model_id, scorer_type, scorer_config, status,
      total_cases, completed_cases, failed_cases, avg_score,
      cost_cents, error, created_at, updated_at,
      eval_datasets!inner(id, name)
    `)
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle();

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  // PAGED, NOT LIMITED. `.limit(2000)` reads as "give me up to 2,000 results",
  // but PostgREST caps a response at 1,000 and says nothing. An eval run with
  // more than 1,000 cases would have shown the customer a silently truncated
  // report — the pass/fail counts they read off it simply wrong, with no
  // indication. See lib/admin/paged-read.ts.
  const { rows: results, truncated } = await readAllPaged<Record<string, unknown>>(
    (from, to) =>
      supabase
        .schema("inference")
        .from("eval_results")
        .select(`
          id, case_id, output, score, passed, scorer_reasoning, status,
          latency_ms, cost_cents, error, created_at,
          eval_cases!inner(input, expected, tags)
        `)
        .eq("run_id", id)
        .order("created_at", { ascending: true })
        .range(from, to)
        .returns<Record<string, unknown>[]>(),
    { maxRows: RESULT_LIMIT }
  );

  return NextResponse.json({
    success: true,
    // `results_truncated` is reported rather than left implicit: a run big enough
    // to hit the bound is exactly the one where a missing tail changes the answer.
    data: { ...run, results, results_truncated: truncated, results_limit: RESULT_LIMIT },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:evals-run-cancel", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try { org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? ""); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 }); }

  const supabase = makeSupabase();

  const { data: run } = await supabase
    .schema("inference")
    .from("eval_runs")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; status: string }>();

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.status === "completed" || run.status === "cancelled" || run.status === "failed") {
    return NextResponse.json({ error: `Run is already ${run.status}` }, { status: 409 });
  }

  const { error } = await supabase
    .schema("inference")
    .from("eval_runs")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Failed to cancel run" }, { status: 500 });

  // Remove any pending result rows that were pre-inserted by the runner but
  // never processed — they would otherwise linger with status='pending'.
  await supabase
    .schema("inference")
    .from("eval_results")
    .delete()
    .eq("run_id", id)
    .eq("status", "pending");

  return NextResponse.json({ success: true });
}
