/**
 * GET /api/inference/observe/analytics — aggregated span metrics for the org.
 *
 * Query params:
 *   ?period=7d         lookback window: 24h | 7d | 30d (default 7d)
 *   ?group_by=model    grouping dimension: model | prompt_version | name | key
 *
 * Returns totals, grouped breakdown, and per-day time series.
 * Fetches up to 2000 spans and aggregates server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";

type Period = "24h" | "7d" | "30d";
type GroupBy = "model" | "prompt_version" | "name" | "key";

const PERIOD_MS: Record<Period, number> = {
  "24h": 86_400_000,
  "7d":  7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

interface SpanRow {
  model_id: string | null;
  name: string;
  api_key_id: string | null;
  prompt_version: number | null;
  cost_cents: number | null;
  latency_ms: number | null;
  status: string;
  guardrail_action: string | null;
  created_at: string;
}

interface GroupEntry {
  key: string;
  label: string;
  name: string;
  requests: number;
  cost_cents: number;
  latencies: number[];
  errors: number;
  blocked: number;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-analytics",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const params = request.nextUrl.searchParams;
  const periodParam = (params.get("period") ?? "7d") as Period;
  const period: Period = periodParam in PERIOD_MS ? periodParam : "7d";
  const groupByParam = (params.get("group_by") ?? "model") as GroupBy;
  const groupBy: GroupBy = ["model", "prompt_version", "name", "key"].includes(groupByParam)
    ? groupByParam
    : "model";

  const cutoff = new Date(Date.now() - PERIOD_MS[period]).toISOString();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("trace_spans")
    .select("model_id, name, api_key_id, prompt_version, cost_cents, latency_ms, status, guardrail_action, created_at")
    .eq("org_id", org.org_id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as SpanRow[];

  // ── Totals ────────────────────────────────────────────────────────────────
  let totalCost = 0, totalLatency = 0, latencyCount = 0, blocked = 0, errors = 0;
  for (const r of rows) {
    if (r.cost_cents != null) totalCost += Number(r.cost_cents);
    if (r.latency_ms != null) { totalLatency += r.latency_ms; latencyCount++; }
    if (r.guardrail_action === "blocked") blocked++;
    if ((r.status.startsWith("error_") && r.status !== "error_guardrail_blocked") || r.status === "cancelled") errors++;
  }

  // ── Group key extractor ───────────────────────────────────────────────────
  function extractKey(r: SpanRow): { key: string; label: string; name: string } {
    switch (groupBy) {
      case "prompt_version":
        return r.prompt_version != null
          ? { key: String(r.prompt_version), label: `v${r.prompt_version}`, name: r.name }
          : { key: "(no prompt)", label: "no prompt", name: r.name };
      case "name":
        return { key: r.name, label: r.name.replace("gen_ai.", ""), name: r.name };
      case "key":
        return r.api_key_id != null
          ? { key: r.api_key_id, label: r.api_key_id.slice(0, 8) + "…", name: r.name }
          : { key: "(unknown)", label: "unknown key", name: r.name };
      case "model":
      default:
        return { key: r.model_id ?? "(unknown)", label: r.model_id ?? "(unknown)", name: r.name };
    }
  }

  // ── Group aggregation ─────────────────────────────────────────────────────
  const groupMap = new Map<string, GroupEntry>();
  for (const r of rows) {
    const { key, label, name } = extractKey(r);
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, label, name, requests: 0, cost_cents: 0, latencies: [], errors: 0, blocked: 0 });
    }
    const g = groupMap.get(key)!;
    g.requests++;
    g.cost_cents += Number(r.cost_cents ?? 0);
    if (r.latency_ms != null) g.latencies.push(r.latency_ms);
    if ((r.status.startsWith("error_") && r.status !== "error_guardrail_blocked") || r.status === "cancelled") g.errors++;
    if (r.guardrail_action === "blocked") g.blocked++;
  }

  const by_group = Array.from(groupMap.values())
    .map((g) => {
      const sorted = g.latencies.slice().sort((a, b) => a - b);
      return {
        key: g.key,
        label: g.label,
        name: g.name,
        requests: g.requests,
        cost_cents: Math.round(g.cost_cents * 100) / 100,
        avg_latency_ms: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
        p95_latency_ms: sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.95)] ?? null) : null,
        error_rate: g.requests > 0 ? Math.round((g.errors / g.requests) * 1000) / 10 : 0,
        block_rate: g.requests > 0 ? Math.round((g.blocked / g.requests) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.requests - a.requests);

  // ── By day ────────────────────────────────────────────────────────────────
  const dayMap = new Map<string, { requests: number; cost_cents: number; blocked: number }>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { requests: 0, cost_cents: 0, blocked: 0 });
    const d = dayMap.get(day)!;
    d.requests++;
    d.cost_cents += Number(r.cost_cents ?? 0);
    if (r.guardrail_action === "blocked") d.blocked++;
  }
  const by_day = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, requests: v.requests, cost_cents: Math.round(v.cost_cents * 100) / 100, blocked: v.blocked }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    period,
    group_by: groupBy,
    sampled: rows.length,
    capped: rows.length === 2000,
    totals: {
      requests: rows.length,
      cost_cents: Math.round(totalCost * 100) / 100,
      blocked,
      errors,
      avg_latency_ms: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : null,
    },
    by_group,
    by_day,
  });
}
