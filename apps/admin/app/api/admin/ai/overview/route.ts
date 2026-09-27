import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { INFERENCE_SERVICE_TYPE } from "@admin/lib/inference-settlement";

export const dynamic = "force-dynamic";

/**
 * Platform-wide inference overview: spend, margin, error rate, growth and
 * top models/orgs over a bounded window. Aggregated in memory from
 * inference.usage — acceptable at current gateway volume (row cap below);
 * push into a Postgres RPC over the monthly partitions when volume grows.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(
    90,
    Math.max(1, parseInt(searchParams.get("days") || "30", 10) || 30),
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const supabase = await createServiceClient();
    // The inference schema is not in the generated types (same pattern as
    // lib/supabase/queries/support_tickets.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const [usageRes, orgsRes, modelsRes] = await Promise.all([
      inference
        .from("usage")
        .select(
          "org_id, model_id, api_key_id, cost_cents, upstream_cost_cents, input_tokens, output_tokens, status, latency_ms, created_at",
        )
        .gte("created_at", since.toISOString())
        .limit(100000),
      inference.from("orgs").select("id, slug, name"),
      inference.from("models").select("model_id, display_name"),
    ]);

    if (usageRes.error) {
      console.error("[Admin AI] usage query failed:", usageRes.error.message);
      return NextResponse.json(
        { error: "Failed to load usage" },
        { status: 500 },
      );
    }

    type UsageRow = {
      org_id: string;
      model_id: string;
      api_key_id: string | null;
      cost_cents: number | null;
      upstream_cost_cents: number | null;
      input_tokens: number | null;
      output_tokens: number | null;
      status: string;
      latency_ms: number | null;
      created_at: string;
    };
    const rows = (usageRes.data ?? []) as UsageRow[];
    const orgName = new Map<string, string>(
      (orgsRes.data ?? []).map(
        (o: { id: string; slug: string; name: string | null }): [string, string] => [
          o.id,
          o.name || o.slug,
        ],
      ),
    );
    const modelName = new Map<string, string>(
      (modelsRes.data ?? []).map(
        (m: { model_id: string; display_name: string | null }): [string, string] => [
          m.model_id,
          m.display_name || m.model_id,
        ],
      ),
    );

    let revenueCents = 0;
    let upstreamCents = 0;
    /** No cost basis: counted, never summed as zero. */
    let uncostedRequests = 0;
    let tokens = 0;
    let errors = 0;
    const orgSet = new Set<string>();
    const keySet = new Set<string>();
    const byModel = new Map<string, { requests: number; revenueCents: number }>();
    const byOrg = new Map<string, { requests: number; revenueCents: number }>();
    const byDay = new Map<string, { requests: number; revenueCents: number; errors: number }>();
    const latencies: number[] = [];

    for (const r of rows) {
      revenueCents += Number(r.cost_cents) || 0;
      // NULL is no cost basis, not zero cost. Counting it as zero would
      // report the request at 100% margin.
      if (r.upstream_cost_cents !== null && r.upstream_cost_cents !== undefined) {
        upstreamCents += Number(r.upstream_cost_cents);
      } else {
        uncostedRequests += 1;
      }
      tokens += (Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0);
      if (r.status !== "success") errors += 1;
      if (r.org_id) orgSet.add(r.org_id);
      if (r.api_key_id) keySet.add(r.api_key_id);
      if (typeof r.latency_ms === "number") latencies.push(r.latency_ms);

      const m = byModel.get(r.model_id) ?? { requests: 0, revenueCents: 0 };
      m.requests += 1;
      m.revenueCents += Number(r.cost_cents) || 0;
      byModel.set(r.model_id, m);

      const o = byOrg.get(r.org_id) ?? { requests: 0, revenueCents: 0 };
      o.requests += 1;
      o.revenueCents += Number(r.cost_cents) || 0;
      byOrg.set(r.org_id, o);

      const day = r.created_at.slice(0, 10);
      const d = byDay.get(day) ?? { requests: 0, revenueCents: 0, errors: 0 };
      d.requests += 1;
      d.revenueCents += Number(r.cost_cents) || 0;
      if (r.status !== "success") d.errors += 1;
      byDay.set(day, d);
    }

    // Zero-filled daily series.
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? { requests: 0, revenueCents: 0, errors: 0 };
      daily.push({
        day: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
        requests: bucket.requests,
        revenue: Math.round(bucket.revenueCents) / 100,
        errors: bucket.errors,
      });
    }

    latencies.sort((a, b) => a - b);
    const pct = (p: number) =>
      latencies.length
        ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]
        : null;

    const top = <K,>(
      map: Map<K, { requests: number; revenueCents: number }>,
      label: (k: K) => string,
    ) =>
      [...map.entries()]
        .sort((a, b) => b[1].revenueCents - a[1].revenueCents || b[1].requests - a[1].requests)
        .slice(0, 8)
        .map(([k, v]) => ({
          id: String(k),
          label: label(k),
          requests: v.requests,
          revenue: Math.round(v.revenueCents) / 100,
        }));

    // ---- SETTLEMENT --------------------------------------------------
    // What actually happened to that usage. Read from the ledger, never
    // from settled_at: the sweep stamps settled_at on rows it could NOT
    // collect too, so settled rows = collected + unpaid. See
    // lib/inference-settlement.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billingDb = (supabase as any).schema("billing");
    const [ledgerRes, openRes, debtRes, sweepRes] = await Promise.all([
      billingDb
        .from("transactions")
        .select("status, amount")
        .eq("service_type", INFERENCE_SERVICE_TYPE)
        .eq("type", "usage")
        .gte("created_at", since.toISOString()),
      // Accrued: priced, served, not yet swept. Always small - the sweep
      // runs hourly - so its size is itself a health signal.
      inference
        .from("usage")
        .select("cost_cents")
        .is("settled_at", null)
        .eq("status", "success")
        .gt("cost_cents", 0),
      // Debt is all-time: an hour unpaid last month is still owed.
      billingDb
        .from("transactions")
        .select("service_id, amount, created_at")
        .eq("service_type", INFERENCE_SERVICE_TYPE)
        .eq("type", "usage")
        .eq("status", "failed"),
      billingDb
        .from("sweep_runs")
        .select("started_at")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);

    let collectedUsd = 0;
    let unpaidInWindowUsd = 0;
    for (const t of (ledgerRes.data ?? []) as { status: string; amount: string | number }[]) {
      if (t.status === "completed") collectedUsd += Number(t.amount);
      else if (t.status === "failed") unpaidInWindowUsd += Number(t.amount);
    }
    const openRows = (openRes.data ?? []) as { cost_cents: number | null }[];
    const accruedUsd =
      openRows.reduce((sum, r) => sum + Number(r.cost_cents ?? 0), 0) / 100;
    const debtRows = (debtRes.data ?? []) as {
      service_id: string | null;
      amount: string | number;
      created_at: string;
    }[];
    const outstandingUsd = debtRows.reduce((sum, r) => sum + Number(r.amount), 0);
    const lastSweepAt = (sweepRes.data?.[0]?.started_at as string | undefined) ?? null;
    // Unpaid recorded in the last two sweeps means an empty wallet was
    // served recently - which is what the receipts can prove about
    // enforcement, since the setting itself is not in the database.
    const recentCutoff = Date.now() - 2 * 3600 * 1000;
    const servedEmptyRecently = debtRows.some(
      (r) => Date.parse(r.created_at) >= recentCutoff,
    );

    return NextResponse.json({
      days,
      settlement: {
        ok: !ledgerRes.error && !openRes.error && !debtRes.error,
        collectedUsd: Math.round(collectedUsd * 100) / 100,
        unpaidInWindowUsd: Math.round(unpaidInWindowUsd * 100) / 100,
        accruedUsd: Math.round(accruedUsd * 100) / 100,
        accruedRows: openRows.length,
        // PostgREST caps a read at 1000 rows; past that the figure is a
        // floor and says so.
        accruedTruncated: openRows.length >= 1000,
        outstandingUsd: Math.round(outstandingUsd * 100) / 100,
        unpaidOrgs: new Set(debtRows.map((r) => r.service_id).filter(Boolean)).size,
        lastSweepAt,
        servedEmptyRecently,
      },
      totals: {
        requests: rows.length,
        tokens,
        revenue: Math.round(revenueCents) / 100,
        upstreamCost: Math.round(upstreamCents) / 100,
        // Requests with no cost basis, excluded from the cost above rather
        // than counted as free. The margin beside it is drawn over the rest.
        uncostedRequests,
        marginPct:
          upstreamCents > 0
            ? Math.round(((revenueCents - upstreamCents) / upstreamCents) * 1000) / 10
            : null,
        errors,
        errorRatePct: rows.length
          ? Math.round((errors / rows.length) * 1000) / 10
          : 0,
        activeOrgs: orgSet.size,
        activeKeys: keySet.size,
        activeModels: byModel.size,
        totalOrgs: orgsRes.data?.length ?? 0,
        p50LatencyMs: pct(50),
        p95LatencyMs: pct(95),
      },
      daily,
      topModels: top(byModel, (id) => modelName.get(id) ?? id),
      topOrgs: top(byOrg, (id) => orgName.get(id) ?? id),
    });
  } catch (err) {
    console.error("[Admin AI] overview unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
