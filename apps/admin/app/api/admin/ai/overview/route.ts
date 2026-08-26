import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

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
      upstreamCents += Number(r.upstream_cost_cents) || 0;
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

    return NextResponse.json({
      days,
      totals: {
        requests: rows.length,
        tokens,
        revenue: Math.round(revenueCents) / 100,
        upstreamCost: Math.round(upstreamCents) / 100,
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
