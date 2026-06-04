import { createServiceClient } from "@/lib/supabase/server";

type SR<T> = { success: true; data: T } | { success: false; error: string };

interface UsageRow {
  created_at: string;
  api_key_id: string;
  model_id: string;
  modality: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents: number;
  latency_ms: number | null;
  status: string;
  billed_to: string;
  cache_kind: "none" | "l1" | "semantic" | null;
}

export const InferenceUsageService = {
  async summary(org: { id: string; slug: string; name: string }, days: number): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const { data, error } = await db
      .schema("inference")
      .from("usage")
      .select("created_at, api_key_id, model_id, modality, input_tokens, output_tokens, cost_cents, latency_ms, status, billed_to, cache_kind")
      .eq("org_id", org.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .returns<UsageRow[]>();

    if (error) return { success: false, error: "Failed to fetch usage" };

    const rows = data ?? [];

    const month = new Date().toISOString().slice(0, 7);
    let monthSpentCents = 0;
    let monthRequests = 0;
    const dayBuckets = new Map<string, { spent: number; requests: number }>();
    const modelBuckets = new Map<string, { spent: number; requests: number }>();
    const keyBuckets = new Map<string, { spent: number; requests: number; cacheL1: number; cacheSemantic: number }>();
    let successCount = 0;
    let errorCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let l1HitCount = 0;
    let semanticHitCount = 0;
    const latencies: number[] = [];

    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      if (r.created_at.startsWith(month)) {
        monthSpentCents += r.cost_cents;
        monthRequests += 1;
      }
      const dayB = dayBuckets.get(day) ?? { spent: 0, requests: 0 };
      dayB.spent += r.cost_cents;
      dayB.requests += 1;
      dayBuckets.set(day, dayB);

      const modelB = modelBuckets.get(r.model_id) ?? { spent: 0, requests: 0 };
      modelB.spent += r.cost_cents;
      modelB.requests += 1;
      modelBuckets.set(r.model_id, modelB);

      if (r.api_key_id) {
        const keyB = keyBuckets.get(r.api_key_id) ?? { spent: 0, requests: 0, cacheL1: 0, cacheSemantic: 0 };
        keyB.spent += r.cost_cents;
        keyB.requests += 1;
        if (r.cache_kind === "l1") keyB.cacheL1 += 1;
        else if (r.cache_kind === "semantic") keyB.cacheSemantic += 1;
        keyBuckets.set(r.api_key_id, keyB);
      }

      if (r.status === "success") successCount += 1;
      else errorCount += 1;
      if (r.input_tokens) inputTokens += r.input_tokens;
      if (r.output_tokens) outputTokens += r.output_tokens;
      if (r.latency_ms) latencies.push(r.latency_ms);
      if (r.cache_kind === "l1") l1HitCount += 1;
      else if (r.cache_kind === "semantic") semanticHitCount += 1;
    }

    const day_series: Array<{ day: string; spent_cents: number; requests: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const b = dayBuckets.get(key) ?? { spent: 0, requests: 0 };
      day_series.push({ day: key, spent_cents: b.spent, requests: b.requests });
    }

    const top_models = [...modelBuckets.entries()]
      .map(([model_id, b]) => ({ model_id, spent_cents: b.spent, requests: b.requests }))
      .sort((a, b) => b.spent_cents - a.spent_cents)
      .slice(0, 10);

    const topKeyIds = [...keyBuckets.entries()].sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
    let top_api_keys: Array<{
      id: string;
      name: string;
      preview: string;
      spent_cents: number;
      requests: number;
      cache_l1_hits: number;
      cache_semantic_hits: number;
      cache_hit_rate: number | null;
    }> = [];
    if (topKeyIds.length > 0) {
      const ids = topKeyIds.map(([id]) => id);
      const { data: keyMeta } = await db
        .schema("inference")
        .from("api_keys")
        .select("id, name, key_prefix, key_last_four")
        .in("id", ids)
        .returns<Array<{ id: string; name: string | null; key_prefix: string; key_last_four: string }>>();
      const metaById = new Map<string, { name: string | null; preview: string }>();
      for (const m of keyMeta ?? []) {
        metaById.set(m.id, { name: m.name, preview: `${m.key_prefix}••••${m.key_last_four}` });
      }
      top_api_keys = topKeyIds.map(([id, b]) => {
        const meta = metaById.get(id);
        const hits = b.cacheL1 + b.cacheSemantic;
        return {
          id,
          name: meta?.name ?? "(revoked or deleted)",
          preview: meta?.preview ?? "—",
          spent_cents: b.spent,
          requests: b.requests,
          cache_l1_hits: b.cacheL1,
          cache_semantic_hits: b.cacheSemantic,
          cache_hit_rate: b.requests > 0 ? hits / b.requests : null,
        };
      });
    }

    latencies.sort((a, b) => a - b);
    const pct = (p: number) => latencies.length ? latencies[Math.floor((latencies.length - 1) * p)] : null;

    return {
      success: true,
      data: {
        success: true,
        org,
        summary: {
          month,
          month_spent_cents: monthSpentCents,
          month_requests: monthRequests,
          window_days: days,
          window_requests: rows.length,
          window_spent_cents: rows.reduce((s: number, r: UsageRow) => s + r.cost_cents, 0),
          success_count: successCount,
          error_count: errorCount,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms_p50: pct(0.5),
          latency_ms_p95: pct(0.95),
          latency_ms_p99: pct(0.99),
          cache_l1_hits: l1HitCount,
          cache_semantic_hits: semanticHitCount,
          cache_hit_rate: rows.length > 0 ? (l1HitCount + semanticHitCount) / rows.length : null,
        },
        day_series,
        top_models,
        top_api_keys,
        recent: rows.slice(0, 20).map((r: UsageRow) => ({
          created_at: r.created_at,
          model_id: r.model_id,
          modality: r.modality,
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          cost_cents: r.cost_cents,
          latency_ms: r.latency_ms,
          status: r.status,
          billed_to: r.billed_to,
          cache_kind: r.cache_kind ?? "none",
        })),
      },
    };
  },
};
