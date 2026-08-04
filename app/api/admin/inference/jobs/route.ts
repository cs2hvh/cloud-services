// GET  /api/admin/inference/jobs?service=media — the jobs behind the fleet counts
// POST /api/admin/inference/jobs                — retry or cancel one job
//
// Doc 21 §4 (A4) promised retry / cancel / force-reap; §8.11 records that the
// fleet view shipped read-only, so recovering the 17 failed fine-tunes and the
// 3 media jobs stuck for 31 days meant hand-written SQL. This is the other half.
//
// ONE ROUTE FOR ALL SIX JOB KINDS, driven by lib/admin/runner-registry.ts. Six
// near-identical routes would each need their own status vocabulary, and that is
// exactly how `canceled`-with-one-L gets written as `cancelled` in five of them.
//
// Thin by design: auth + IO. Every judgement (is this row stuck, is this action
// legal, what exactly does it write) lives in lib/admin/jobs-ops.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { RUNNERS, findRunner } from "@/lib/admin/runner-registry";
import { planAction, summarizeJobs, toJobView, type JobAction, type JobRow } from "@/lib/admin/jobs-ops";
import { actorContext, jobActionEntry, recordAdminAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

/** Rows per page. Bounded because these tables grow without limit. */
const PAGE_SIZE = 100;
/** PostgREST caps a response silently; stay well under it and report the cap. */
const MAX_PAGE_SIZE = 200;

/** Columns to select for a service — id/org/status/time plus whatever it declares. */
function columnsFor(service: string): string {
  const spec = findRunner(service)!;
  const cols = new Set<string>(["id", "org_id", "status", spec.time_column]);
  if (spec.heartbeat_column) cols.add(spec.heartbeat_column);
  if (spec.jobs.label_column) cols.add(spec.jobs.label_column);
  if (spec.jobs.error_column) cols.add(spec.jobs.error_column);
  for (const c of spec.jobs.detail_columns) cols.add(c);
  return [...cols].join(", ");
}

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const service = params.get("service") ?? "media";
  const spec = findRunner(service);
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown service '${service}'`, services: RUNNERS.map((r) => r.service) },
      { status: 400 }
    );
  }

  // "state" is the operator's vocabulary, not the table's: each job kind spells
  // its statuses differently, and support does not know which spells cancelled
  // with one L.
  const state = params.get("state") ?? "open";
  const orgId = params.get("org_id");
  const page = Math.max(0, Number(params.get("page")) || 0);
  const pageSize = Math.min(Math.max(Number(params.get("page_size")) || PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const supabase = inferenceAdminClient();
  let query = supabase
    .schema(spec.schema)
    .from(spec.table)
    .select(columnsFor(service), { count: "exact" })
    .order(spec.time_column, { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const statusesFor: Record<string, string[] | null> = {
    open: [...spec.claimable, ...spec.in_flight],
    failed: spec.failed,
    completed: spec.done,
    all: null,
  };
  // `in` rather than `??`: "all" maps to null MEANING "do not filter", and `??`
  // treated that deliberate null exactly like an unknown key and fell back to
  // "open". Live testing caught it — "all" quietly returned only open jobs, so
  // media read as 0 rows against a table holding 33. Whether a key EXISTS and
  // what its value IS are different questions and must be asked separately.
  const wanted = state in statusesFor ? statusesFor[state] : statusesFor.open;
  if (wanted) query = query.in("status", wanted);
  if (orgId) query = query.eq("org_id", orgId);

  const { data, error, count } = await query.returns<JobRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Resolve org names so the table is not a wall of UUIDs. One extra query, on
  // the ids actually on this page.
  const orgIds = [...new Set(rows.map((r) => r.org_id).filter((v): v is string => typeof v === "string"))];
  const { data: orgs } = await supabase
    .schema("inference")
    .from("orgs")
    .select("id, name, slug")
    .in("id", orgIds.length > 0 ? orgIds : ["00000000-0000-0000-0000-000000000000"])
    .returns<Array<{ id: string; name: string | null; slug: string | null }>>();
  const orgNames = new Map((orgs ?? []).map((o) => [o.id, o.name ?? o.slug ?? o.id]));

  const now = Date.now();
  const jobs = rows.map((row) => toJobView(spec, row, orgNames, now));

  return NextResponse.json({
    service: {
      service: spec.service,
      label: spec.label,
      purpose: spec.purpose,
      source: `${spec.schema}.${spec.table}`,
      /** Non-null = deliberately paused. A retry here will queue and sit. */
      on_hold: spec.on_hold,
      retry_supported: spec.jobs.retry_to !== null,
      retry_unavailable_reason: spec.jobs.retry_unavailable_reason,
      cancel_supported: spec.jobs.cancel_to !== null,
      detail_columns: spec.jobs.detail_columns,
    },
    services: RUNNERS.map((r) => ({ service: r.service, label: r.label })),
    page: { index: page, size: pageSize, total: count ?? null, has_more: (count ?? 0) > (page + 1) * pageSize },
    filters: { state, org_id: orgId },
    summary: summarizeJobs(spec, jobs),
    jobs,
  });
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const service = body?.service;
  const jobId = body?.job_id;
  const action = body?.action as JobAction | undefined;

  if (typeof service !== "string" || typeof jobId !== "string" || (action !== "retry" && action !== "cancel")) {
    return NextResponse.json(
      { error: "service, job_id and action ('retry' | 'cancel') are required" },
      { status: 400 }
    );
  }
  const spec = findRunner(service);
  if (!spec) return NextResponse.json({ error: `Unknown service '${service}'` }, { status: 400 });

  const supabase = inferenceAdminClient();
  const { data: current, error: readErr } = await supabase
    .schema(spec.schema)
    .from(spec.table)
    .select(`id, org_id, status`)
    .eq("id", jobId)
    .maybeSingle<{ id: string; org_id: string | null; status: string }>();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const plan = planAction(spec, action, current.status, Date.now());
  // 409, not 400: the request is well formed, the job is just in the wrong
  // state — usually because it moved on since the page was loaded.
  if (!plan.ok) return NextResponse.json({ error: plan.reason, code: "action_not_allowed" }, { status: 409 });

  // Conditional on the status we read. If a runner settled the job in between,
  // this matches no rows and we say so, rather than yanking a live job.
  const { data: updated, error } = await supabase
    .schema(spec.schema)
    .from(spec.table)
    .update(plan.update)
    .eq("id", jobId)
    .in("status", plan.from)
    .select("id, status")
    .maybeSingle<{ id: string; status: string }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      {
        error: "The job changed state before this could be applied — reload and try again.",
        code: "state_changed",
      },
      { status: 409 }
    );
  }

  void recordAdminAudit(
    jobActionEntry(action, spec.service, `${spec.schema}.${spec.table}`, jobId, current.org_id, current.status, plan.to),
    { userId: adminCheck.userId, email: adminCheck.email },
    actorContext(req)
  );

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    from: current.status,
    action,
    // A retry into a queue no runner is reading is not a failure, but the
    // operator must not be left thinking work has started.
    note: action === "retry" && spec.on_hold ? spec.on_hold : null,
  });
}
