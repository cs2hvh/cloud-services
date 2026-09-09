import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Per-request inference log — one row per gateway call, the way a provider
 * console shows it: tokens in/out, cache read/write, model, upstream
 * provider, key, org, status, latency, TTFT and cost.
 *
 * Source is inference.usage (monthly partitions, queried through the parent).
 * Two separate reads by design:
 *   - the PAGE of rows the table renders (bounded, ordered, offset-paged);
 *   - SUMMARY aggregates over the whole filtered set, paged with a budget
 *     and a declared `truncated` flag — a partial sum must never present
 *     itself as complete (PostgREST caps every request at 1000 rows).
 */

const PAGE_CAP = 1000;
const SUMMARY_PAGES = 20; // 20k rows of aggregate budget

type UsageRow = {
  id: string;
  request_id: string | null;
  created_at: string;
  org_id: string | null;
  api_key_id: string | null;
  model_id: string | null;
  provider: string | null;
  modality: string | null;
  status: string;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cache_write_tokens: number | null;
  cache_kind: string | null;
  cost_cents: number | null;
  upstream_cost_cents: number | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  billed_to: string | null;
  is_batch: boolean | null;
  is_off_peak: boolean | null;
  num_units: number | null;
  unit_label: string | null;
};

const pctl = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
};

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
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(10, parseInt(searchParams.get("limit") || "50", 10) || 50),
  );
  const status = searchParams.get("status") || "";
  const modelId = searchParams.get("model") || "";
  const provider = searchParams.get("provider") || "";
  const modality = searchParams.get("modality") || "";
  const orgId = searchParams.get("org") || "";
  const keyId = searchParams.get("key") || "";
  const billedTo = searchParams.get("billed_to") || "";
  const q = (searchParams.get("q") || "").trim();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = await createServiceClient();
    // The inference schema is not in the generated types (same pattern as
    // the sibling AI routes).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const COLUMNS =
      "id, request_id, created_at, org_id, api_key_id, model_id, provider, modality, status, error_code, input_tokens, output_tokens, cached_tokens, cache_write_tokens, cache_kind, cost_cents, upstream_cost_cents, latency_ms, ttft_ms, billed_to, is_batch, is_off_peak, num_units, unit_label";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (builder: any) => {
      let b = builder.gte("created_at", since);
      if (status === "errors") b = b.neq("status", "success");
      else if (status) b = b.eq("status", status);
      if (modelId) b = b.eq("model_id", modelId);
      if (provider) b = b.eq("provider", provider);
      if (modality) b = b.eq("modality", modality);
      if (orgId) b = b.eq("org_id", orgId);
      if (keyId) b = b.eq("api_key_id", keyId);
      if (billedTo) b = b.eq("billed_to", billedTo);
      // Request ids are opaque strings; substring match is what an operator
      // pasting an id from a customer ticket actually needs.
      if (q) b = b.ilike("request_id", `%${q}%`);
      return b;
    };

    const from = (page - 1) * limit;
    const [rowsRes, countRes, orgsRes, keysRes, modelsRes] = await Promise.all([
      applyFilters(inference.from("usage").select(COLUMNS))
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1),
      applyFilters(
        inference.from("usage").select("id", { count: "exact", head: true }),
      ),
      inference.from("orgs").select("id, slug, name"),
      inference
        .from("api_keys")
        .select("id, name, key_prefix, key_last_four, org_id, revoked_at"),
      inference.from("models").select("model_id, display_name, modality, upstream_provider"),
    ]);

    if (rowsRes.error) {
      console.error("[Admin AI] requests query failed:", rowsRes.error.message);
      return NextResponse.json(
        { error: "Failed to load request log" },
        { status: 500 },
      );
    }

    // ---- summary over the FILTERED set, paged with a declared budget ----
    const summaryRows: UsageRow[] = [];
    let truncated = false;
    for (let p = 0; p < SUMMARY_PAGES; p++) {
      const { data, error } = await applyFilters(
        inference
          .from("usage")
          .select(
            "status, input_tokens, output_tokens, cached_tokens, cache_write_tokens, cost_cents, upstream_cost_cents, latency_ms, ttft_ms, billed_to",
          ),
      )
        .order("created_at", { ascending: false })
        .range(p * PAGE_CAP, p * PAGE_CAP + PAGE_CAP - 1);
      if (error) break;
      const batch = (data ?? []) as UsageRow[];
      summaryRows.push(...batch);
      if (batch.length < PAGE_CAP) break;
      if (p === SUMMARY_PAGES - 1) truncated = true;
    }

    const num = (v: number | null | undefined) => Number(v ?? 0);
    let requests = 0;
    let errors = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let cacheWriteTokens = 0;
    let revenueCents = 0;
    let upstreamCents = 0;
    let byokRequests = 0;
    const latencies: number[] = [];
    const ttfts: number[] = [];
    for (const r of summaryRows) {
      requests += 1;
      if (r.status !== "success") errors += 1;
      inputTokens += num(r.input_tokens);
      outputTokens += num(r.output_tokens);
      cachedTokens += num(r.cached_tokens);
      cacheWriteTokens += num(r.cache_write_tokens);
      revenueCents += num(r.cost_cents);
      upstreamCents += num(r.upstream_cost_cents);
      if (r.billed_to === "byok") byokRequests += 1;
      if (r.latency_ms !== null) latencies.push(Number(r.latency_ms));
      if (r.ttft_ms !== null) ttfts.push(Number(r.ttft_ms));
    }
    latencies.sort((a, b) => a - b);
    ttfts.sort((a, b) => a - b);

    const orgById = new Map<string, { slug: string; name: string }>(
      (orgsRes.data ?? []).map(
        (o: { id: string; slug: string; name: string }) => [
          o.id,
          { slug: o.slug, name: o.name },
        ],
      ),
    );
    const keyById = new Map<
      string,
      { label: string; org_id: string | null; revoked: boolean }
    >(
      (keysRes.data ?? []).map(
        (k: {
          id: string;
          name: string | null;
          key_prefix: string | null;
          key_last_four: string | null;
          org_id: string | null;
          revoked_at: string | null;
        }) => [
          k.id,
          {
            label: k.name || `${k.key_prefix ?? "key"}…${k.key_last_four ?? ""}`,
            org_id: k.org_id,
            revoked: k.revoked_at !== null,
          },
        ],
      ),
    );
    // The catalog's provider is the checkable one; usage.provider is a
    // gateway-written constant today (see the routing route's note).
    const providerOfModel = new Map<string, string | null>(
      (modelsRes.data ?? []).map(
        (m: { model_id: string; upstream_provider: string | null }) => [
          m.model_id,
          m.upstream_provider,
        ],
      ),
    );
    const modelLabel = new Map<string, string>(
      (modelsRes.data ?? []).map(
        (m: { model_id: string; display_name: string | null }) => [
          m.model_id,
          m.display_name || m.model_id,
        ],
      ),
    );

    const rows = ((rowsRes.data ?? []) as UsageRow[]).map((r) => {
      const key = r.api_key_id ? keyById.get(r.api_key_id) : undefined;
      const org = r.org_id ? orgById.get(r.org_id) : undefined;
      const cost = num(r.cost_cents) / 100;
      const upstream = num(r.upstream_cost_cents) / 100;
      return {
        id: r.id,
        requestId: r.request_id,
        at: r.created_at,
        org: org ? { id: r.org_id, label: org.name || org.slug } : null,
        key: key
          ? { id: r.api_key_id, label: key.label, revoked: key.revoked }
          : null,
        model: r.model_id,
        modelLabel: r.model_id
          ? (modelLabel.get(r.model_id) ?? r.model_id)
          : null,
        provider: r.provider,
        catalogProvider: r.model_id ? (providerOfModel.get(r.model_id) ?? null) : null,
        modality: r.modality,
        status: r.status,
        errorCode: r.error_code,
        inputTokens: num(r.input_tokens),
        outputTokens: num(r.output_tokens),
        cachedTokens: num(r.cached_tokens),
        cacheWriteTokens: num(r.cache_write_tokens),
        cacheKind: r.cache_kind,
        costUsd: cost,
        upstreamUsd: upstream,
        // BYOK requests bill against the customer's own upstream key —
        // margin there is not ours to claim, so it reports null, not zero.
        marginUsd: r.billed_to === "byok" ? null : cost - upstream,
        latencyMs: r.latency_ms,
        ttftMs: r.ttft_ms,
        billedTo: r.billed_to,
        isBatch: r.is_batch ?? false,
        isOffPeak: r.is_off_peak ?? false,
        units: r.num_units,
        unitLabel: r.unit_label,
      };
    });

    return NextResponse.json({
      days,
      page,
      limit,
      total: countRes.error ? null : (countRes.count ?? 0),
      rows,
      summary: {
        truncated,
        requests,
        errors,
        errorRatePct: requests > 0 ? (errors / requests) * 100 : 0,
        inputTokens,
        outputTokens,
        cachedTokens,
        cacheWriteTokens,
        cacheHitRatePct:
          inputTokens > 0 ? (cachedTokens / inputTokens) * 100 : null,
        revenueUsd: revenueCents / 100,
        upstreamUsd: upstreamCents / 100,
        marginUsd: (revenueCents - upstreamCents) / 100,
        marginPct:
          revenueCents > 0
            ? ((revenueCents - upstreamCents) / revenueCents) * 100
            : null,
        byokRequests,
        p50LatencyMs: pctl(latencies, 50),
        p95LatencyMs: pctl(latencies, 95),
        p50TtftMs: pctl(ttfts, 50),
      },
      // Filter vocabularies come from the data, so a value that exists is
      // always selectable and one that never occurs never offers itself.
      facets: {
        orgs: (orgsRes.data ?? []).map(
          (o: { id: string; slug: string; name: string }) => ({
            id: o.id,
            label: o.name || o.slug,
          }),
        ),
        keys: (keysRes.data ?? []).map(
          (k: {
            id: string;
            name: string | null;
            key_prefix: string | null;
            key_last_four: string | null;
          }) => ({
            id: k.id,
            label: k.name || `${k.key_prefix ?? "key"}…${k.key_last_four ?? ""}`,
          }),
        ),
        models: (modelsRes.data ?? []).map(
          (m: { model_id: string; display_name: string | null }) => ({
            id: m.model_id,
            label: m.display_name || m.model_id,
          }),
        ),
      },
    });
  } catch (err) {
    console.error("[Admin AI] requests unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
