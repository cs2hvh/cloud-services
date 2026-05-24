/**
 * GET /api/inference/usage/summary
 *
 * Returns this-month spend, request count, last-7-days daily breakdown,
 * top models by cost, and the most-recent 20 requests for the caller's
 * active inference org. Powers the Overview + Usage dashboard pages.
 *
 * Query params (optional):
 *   ?days=N        — number of days to include in the daily breakdown (default 7, max 90)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";

interface UsageRow {
  created_at: string;
  model_id: string;
  modality: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents: number;
  latency_ms: number | null;
  status: string;
  billed_to: string;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-usage-summary",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(1, daysParam), 90) : 7;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Window starts at start-of-day UTC, N days back
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  // Pull all rows in window for this org (org-scoped via WHERE)
  // For 100k req/hour scale we'll add pagination in Phase 2; for now full pull
  // is fine since most orgs see <10k req/day in early access.
  const { data, error } = await supabase
    .schema("inference")
    .from("usage")
    .select(
      "created_at, model_id, modality, input_tokens, output_tokens, cost_cents, latency_ms, status, billed_to"
    )
    .eq("org_id", org.org_id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .returns<UsageRow[]>();

  if (error) {
    console.error("[Inference Usage] fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }

  const rows = data ?? [];

  // ── Aggregations ──────────────────────────────────────────────
  const month = new Date().toISOString().slice(0, 7);
  let monthSpentCents = 0;
  let monthRequests = 0;
  const dayBuckets = new Map<string, { spent: number; requests: number }>();
  const modelBuckets = new Map<string, { spent: number; requests: number }>();
  let successCount = 0;
  let errorCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const latencies: number[] = [];

  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (row.created_at.startsWith(month)) {
      monthSpentCents += row.cost_cents;
      monthRequests += 1;
    }
    const dayB = dayBuckets.get(day) ?? { spent: 0, requests: 0 };
    dayB.spent += row.cost_cents;
    dayB.requests += 1;
    dayBuckets.set(day, dayB);

    const mB = modelBuckets.get(row.model_id) ?? { spent: 0, requests: 0 };
    mB.spent += row.cost_cents;
    mB.requests += 1;
    modelBuckets.set(row.model_id, mB);

    if (row.status === "success") successCount += 1;
    else errorCount += 1;
    if (row.input_tokens) inputTokens += row.input_tokens;
    if (row.output_tokens) outputTokens += row.output_tokens;
    if (row.latency_ms) latencies.push(row.latency_ms);
  }

  // Build the day series even for days with zero traffic so charts plot evenly
  const daySeries: Array<{ day: string; spent_cents: number; requests: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const b = dayBuckets.get(key) ?? { spent: 0, requests: 0 };
    daySeries.push({ day: key, spent_cents: b.spent, requests: b.requests });
  }

  const topModels = [...modelBuckets.entries()]
    .map(([model_id, b]) => ({ model_id, spent_cents: b.spent, requests: b.requests }))
    .sort((a, b) => b.spent_cents - a.spent_cents)
    .slice(0, 10);

  latencies.sort((a, b) => a - b);
  const pct = (p: number) =>
    latencies.length ? latencies[Math.floor((latencies.length - 1) * p)] : null;

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name },
    summary: {
      month,
      month_spent_cents: monthSpentCents,
      month_requests: monthRequests,
      window_days: days,
      window_requests: rows.length,
      window_spent_cents: rows.reduce((s, r) => s + r.cost_cents, 0),
      success_count: successCount,
      error_count: errorCount,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms_p50: pct(0.5),
      latency_ms_p95: pct(0.95),
      latency_ms_p99: pct(0.99),
    },
    day_series: daySeries,
    top_models: topModels,
    recent: rows.slice(0, 20).map((r) => ({
      created_at: r.created_at,
      model_id: r.model_id,
      modality: r.modality,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      cost_cents: r.cost_cents,
      latency_ms: r.latency_ms,
      status: r.status,
      billed_to: r.billed_to,
    })),
  });
}
