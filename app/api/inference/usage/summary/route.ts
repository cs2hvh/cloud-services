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
import { resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";

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

export async function GET(request: NextRequest) {
  // Accepts an `ahu_` key. Reading your own spend is the first thing a customer
  // automates — reconciling our figure against their own — and it was previously
  // reachable only from a browser, and only via the cookie-only auth helper, so
  // even a script holding a valid Supabase JWT was refused.
  const resolved = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUser();
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId) => {
      const o = await getActiveOrgForUser(userId);
      return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
    },
    undefined,
    true // agent-scoped keys allowed — but see ownKeyOnly below: they are
         // filtered to their OWN spend, which is what GET /v1/key already
         // gives any key at the edge.
  );
  if (!resolved.ok) return resolved.response;
  const auth = resolved.auth;

  // A read costs nothing, so no billable-action refusal. But "costs nothing"
  // is not "reveals nothing": org-wide spend, and the names and prefixes of
  // every other key, must not be readable by a key scoped to one agent — a
  // public key is embeddable in a browser, so that would publish them.
  //
  // An agent-scoped (hence every public) key therefore sees ONLY its own rows.
  // An org-level private key, like a session, still sees the whole org.
  const ownKeyOnly = auth.apiKey?.agentId ? auth.apiKey.keyId : null;
  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-usage-summary",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = { org_id: auth.orgId };

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
  let usageQuery = supabase
    .schema("inference")
    .from("usage")
    .select(
      "created_at, api_key_id, model_id, modality, input_tokens, output_tokens, cost_cents, latency_ms, status, billed_to, cache_kind"
    )
    .eq("org_id", org.org_id)
    .gte("created_at", since.toISOString());

  // Narrowed at the QUERY, not filtered out of the response — a scoped key
  // must never have the other rows in hand, because every total computed
  // below would otherwise still be an org-wide number.
  if (ownKeyOnly) usageQuery = usageQuery.eq("api_key_id", ownKeyOnly);

  const { data, error } = await usageQuery
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
  // Per-API-key bucket tracks cache hit counts alongside spend/requests so
  // the dashboard can show "this key hit cache 42% of the time" — the
  // per-key signal that complements the org-wide rollup in the stats strip.
  const keyBuckets = new Map<
    string,
    { spent: number; requests: number; cacheL1: number; cacheSemantic: number }
  >();
  let successCount = 0;
  let errorCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let l1HitCount = 0;
  let semanticHitCount = 0;
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

    if (row.api_key_id) {
      const kB = keyBuckets.get(row.api_key_id) ?? {
        spent: 0,
        requests: 0,
        cacheL1: 0,
        cacheSemantic: 0,
      };
      kB.spent += row.cost_cents;
      kB.requests += 1;
      if (row.cache_kind === "l1") kB.cacheL1 += 1;
      else if (row.cache_kind === "semantic") kB.cacheSemantic += 1;
      keyBuckets.set(row.api_key_id, kB);
    }

    if (row.status === "success") successCount += 1;
    else errorCount += 1;
    if (row.input_tokens) inputTokens += row.input_tokens;
    if (row.output_tokens) outputTokens += row.output_tokens;
    if (row.latency_ms) latencies.push(row.latency_ms);
    if (row.cache_kind === "l1") l1HitCount += 1;
    else if (row.cache_kind === "semantic") semanticHitCount += 1;
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

  // The per-key breakdown names other keys ("Production server", prefix, last
  // four). That is a key inventory, so a scoped key gets none of it — even
  // though its own rows are all it could see anyway, this keeps the intent
  // explicit rather than relying on the filter above staying correct.
  const topKeyIds = ownKeyOnly
    ? []
    : [...keyBuckets.entries()].sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);

  // Resolve names + previews for the top-N keys in a single query so we
  // can render "Production server (ahu_live_...••••)" instead of bare
  // UUIDs in the dashboard.
  let topApiKeys: Array<{
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
    const { data: keyMeta } = await supabase
      .schema("inference")
      .from("api_keys")
      .select("id, name, key_prefix, key_last_four")
      .in("id", ids)
      .returns<
        Array<{
          id: string;
          name: string | null;
          key_prefix: string;
          key_last_four: string;
        }>
      >();
    const metaById = new Map<string, { name: string | null; preview: string }>();
    for (const m of keyMeta ?? []) {
      metaById.set(m.id, {
        name: m.name,
        preview: `${m.key_prefix}••••${m.key_last_four}`,
      });
    }
    topApiKeys = topKeyIds.map(([id, b]) => {
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
  const pct = (p: number) =>
    latencies.length ? latencies[Math.floor((latencies.length - 1) * p)] : null;

  return NextResponse.json({
    success: true,
    org: { id: auth.orgId, slug: auth.orgSlug, name: auth.orgName },
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
      cache_l1_hits: l1HitCount,
      cache_semantic_hits: semanticHitCount,
      cache_hit_rate: rows.length > 0 ? (l1HitCount + semanticHitCount) / rows.length : null,
    },
    day_series: daySeries,
    top_models: topModels,
    top_api_keys: topApiKeys,
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
      cache_kind: r.cache_kind ?? "none",
    })),
  });
}
