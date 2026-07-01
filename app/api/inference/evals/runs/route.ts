/**
 * GET  /api/inference/evals/runs — list eval runs for the org
 * POST /api/inference/evals/runs — create (queue) a new eval run
 *
 * A run evaluates every case in a dataset against a target model using a
 * configured scorer. The eval-runner picks up queued runs and processes them.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";

const createSchema = z.object({
  name:       z.string().min(1).max(120),
  dataset_id: z.string().uuid(),
  model_id:   z.string().min(1).max(200),
  scorer_type: z.enum(["llm_judge", "exact", "contains", "regex", "json_schema"]).default("llm_judge"),
  scorer_config: z.object({
    judge_model:   z.string().optional(),
    judge_prompt:  z.string().max(4000).optional(),
    pattern:       z.string().optional(),
    schema:        z.record(z.unknown()).optional(),
  }).optional().default({}),
}).superRefine((val, ctx) => {
  if (val.scorer_type === "regex" && !val.scorer_config?.pattern?.trim()) {
    ctx.addIssue({ code: "custom", path: ["scorer_config", "pattern"], message: "Required for regex scorer" });
  }
  if (val.scorer_type === "json_schema" && !val.scorer_config?.schema) {
    ctx.addIssue({ code: "custom", path: ["scorer_config", "schema"], message: "Required for json_schema scorer" });
  }
});

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:evals-runs-list", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try { org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? ""); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 }); }

  const supabase = makeSupabase();

  const datasetId = request.nextUrl.searchParams.get("dataset_id");

  let query = supabase
    .schema("inference")
    .from("eval_runs")
    .select(`
      id, name, model_id, scorer_type, scorer_config, status,
      total_cases, completed_cases, failed_cases, avg_score,
      cost_cents, error, created_at, updated_at,
      eval_datasets!inner(id, name)
    `)
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (datasetId) {
    query = query.eq("dataset_id", datasetId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: "Failed to list eval runs" }, { status: 500 });

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:evals-runs-create", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try { org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? ""); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 }); }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    }, { status: 400 });
  }

  const supabase = makeSupabase();

  // Verify dataset ownership and get case count
  const { data: ds } = await supabase
    .schema("inference")
    .from("eval_datasets")
    .select("id, eval_cases(count)")
    .eq("id", parsed.data.dataset_id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; eval_cases: { count: number }[] }>();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const caseCount = ds.eval_cases[0]?.count ?? 0;
  if (caseCount === 0) {
    return NextResponse.json({ error: "Dataset has no cases — add test cases before running an eval" }, { status: 422 });
  }

  // Default judge model for llm_judge scorer
  const scorerConfig = parsed.data.scorer_config ?? {};
  if (parsed.data.scorer_type === "llm_judge" && !scorerConfig.judge_model) {
    scorerConfig.judge_model = "openai/gpt-4o-mini";
  }

  const { data: run, error } = await supabase
    .schema("inference")
    .from("eval_runs")
    .insert({
      org_id:         org.org_id,
      dataset_id:     parsed.data.dataset_id,
      name:           parsed.data.name,
      model_id:       parsed.data.model_id,
      scorer_type:    parsed.data.scorer_type,
      scorer_config:  scorerConfig,
      total_cases:    caseCount,
      created_by:     auth.user!.id,
    })
    .select("id, name, model_id, scorer_type, status, total_cases, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create eval run" }, { status: 500 });

  return NextResponse.json({ success: true, data: run }, { status: 201 });
}
