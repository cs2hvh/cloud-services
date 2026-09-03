import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { MAIN_APP_URL } from "@admin/lib/sections";
import { BILLING_ACTIVE_SINCE } from "@admin/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * The HQ board's single feed. Read-only aggregation over billing/public/paas
 * — every number here is displayed on the live platform map, so each one
 * must be a real read, never a default that could render as health.
 *
 * Signal doctrine (billing lane review, 2026-09-03):
 * - BILLED COVERAGE is the primary health signal, not sweep recency. The
 *   sweep resumed at 03:00 after a 12-hour stall and recency read green the
 *   whole time — hours-billed vs hours-elapsed per open meter is the query
 *   that catches what "last ran" cannot.
 * - Charges group by period_start (the hour BILLED); created_at is when the
 *   row was written and a backfill makes it meaningless.
 * - Open meters: the sweep filters ended_at IS NULL **and** status='active';
 *   nothing enforces their agreement, so meters where the two disagree are a
 *   signal of their own (a stopped resource still billing, or the reverse).
 * - A failed read renders grey/unknown — never green, never zero.
 * - active service counts: billing.active_* views (what the sweep sees)
 * - audit pipeline: probed live, claims reachability only
 */

const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
const COVERAGE_WINDOW_MS = 7 * DAY_MS;

type Tone = "ok" | "warn" | "bad" | "dim";

export interface HqEvent {
  at: string;
  kind: "charge" | "txn" | "failure";
  label: string;
  amount: number | null;
  tone: Tone;
}

async function probeMainApp(): Promise<{ up: boolean; ms: number | null }> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(MAIN_APP_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    // Any HTTP answer means the app is serving; 4xx/5xx would still prove
    // reachability, but flag them so a broken deploy reads as degraded.
    return { up: res.status < 500, ms: Date.now() - started };
  } catch {
    return { up: false, ms: null };
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");
  const paas = supabase.schema("paas");
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();

  const head = { count: "exact" as const, head: true };

  const [
    usersRes,
    usersNewRes,
    activeCompute,
    activeGpu,
    activeDb,
    activeK8s,
    activeObj,
    activeSpectrum,
    activeApps,
    activeInference,
    deployProjects,
    domainsRes,
    sweepLastRes,
    charges24Res,
    charges24CountRes,
    openMetersRes,
    failuresCountRes,
    failuresRecentRes,
    livePricesRes,
    activePlansRes,
    gpuQuoteRes,
    liveCouponsRes,
    txns24Res,
    linodeSyncRes,
    auditProbeRes,
    mainApp,
  ] = await Promise.all([
    supabase.from("user_profiles").select("id", head),
    supabase.from("user_profiles").select("id", head).gte("created_at", dayAgo),
    billing.from("active_compute").select("*", head),
    billing.from("active_gpu_pods").select("*", head),
    billing.from("active_database").select("*", head),
    billing.from("active_kubernetes").select("*", head),
    billing.from("active_objectspace").select("*", head),
    billing.from("active_spectrum").select("*", head),
    billing.from("active_platform_apps").select("*", head),
    billing.from("active_inference_vector").select("*", head),
    paas.from("projects").select("id", head).is("deleted_at", null),
    supabase.from("platform_app_domains").select("id", head),
    billing
      .from("service_charges")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
    billing
      .from("service_charges")
      .select("service_type, amount_usd, created_at, hourly_rate, period_start")
      .gte("period_start", dayAgo)
      .order("period_start", { ascending: false })
      .limit(1000),
    // Exact count alongside the capped row fetch: PostgREST's server-side max
    // is 1000 rows, so past that the SUM above goes partial — the count tells
    // us when, and the board says "≥" instead of pretending completeness.
    billing.from("service_charges").select("id", head).gte("period_start", dayAgo),
    // Every meter that is open by EITHER definition — the union catches the
    // rows where the two definitions disagree, which is its own alert.
    billing
      .from("service_meters")
      .select("id, service_type, service_id, status, started_at, ended_at")
      .or("ended_at.is.null,status.eq.active")
      .limit(500),
    billing.from("billing_failure_events").select("id", head).eq("resolved", false),
    billing
      .from("billing_failure_events")
      .select("service_table, failure_type, error_message, occurred_at")
      .eq("resolved", false)
      .order("occurred_at", { ascending: false })
      .limit(5),
    billing
      .from("service_pricing")
      .select("service_type, plan_key, rate_model, unit, amount")
      .is("effective_to", null)
      .limit(500),
    supabase.from("service_plans").select("service_type, plan_key").eq("is_active", true).limit(500),
    supabase.from("gpu_pricing").select("markup_pct").limit(500),
    billing
      .from("promocodes")
      .select("id", head)
      .eq("is_active", true)
      .gte("valid_till", new Date().toISOString()),
    billing
      .from("transactions")
      .select("type, amount, description, created_at, status")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("linode_types")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1),
    supabase.schema("audits").from("audit_logs").select("id", head),
    probeMainApp(),
  ]);

  const count = (r: { count: number | null; error: { message: string } | null }) =>
    r.error ? null : (r.count ?? 0);

  // --- billing pipeline ---
  const sweepLastAt = sweepLastRes.data?.[0]?.created_at ?? null;
  const sweepAgeH = sweepLastAt
    ? (Date.now() - Date.parse(sweepLastAt)) / 3600000
    : null;
  const charges = charges24Res.data ?? [];
  const charged24h = charges.reduce((s, c) => s + Number(c.amount_usd), 0);
  const byService: Record<string, { count: number; usd: number }> = {};
  for (const c of charges) {
    const b = (byService[c.service_type as string] ??= { count: 0, usd: 0 });
    b.count += 1;
    b.usd += Number(c.amount_usd);
  }

  // --- meters: open set + the invariant the sweep assumes but nothing enforces ---
  const meterRows = openMetersRes.error ? null : (openMetersRes.data ?? []);
  const openMeterList = (meterRows ?? []).filter(
    (m) => m.status === "active" && m.ended_at === null,
  );
  const invariantBad = meterRows
    ? meterRows.filter((m) => (m.status === "active") !== (m.ended_at === null)).length
    : null;

  // --- BILLED COVERAGE: hours elapsed vs hours actually charged, per open
  // meter, over the last 7 days. Billed is COUNTED BY THE SERVER inside the
  // exact same window as expected — [fromHour, floorHourNow):
  //   * a shared upper bound, or the always-billed current hour papers over
  //     exactly one in-window gap per meter (found in review: min-clamping
  //     an unbounded count reported 0 missing when 1 was);
  //   * head counts, because PostgREST caps row fetches at 1000 server-side
  //     and a truncated fetch fails toward a false red that grows with
  //     meter age — counts have no cap;
  //   * no clamp: billed > expected means duplicate charges for an hour,
  //     which must surface as an anomaly, not be floored away.
  let coverage: {
    open: number;
    expected: number;
    billed: number;
    missing: number;
    worst: { service_type: string; missing: number } | null;
    overBilled: number;
    shape: "balance" | "stall" | "unknown";
  } | null = null;
  if (meterRows) {
    const now = Date.now();
    const floorHourNow = Math.floor(now / HOUR_MS) * HOUR_MS;
    const activeSince = Date.parse(BILLING_ACTIVE_SINCE);
    const windowFloor = now - COVERAGE_WINDOW_MS;
    const windows = openMeterList.map((m) => {
      const rawStart = Math.max(Date.parse(m.started_at as string), activeSince, windowFloor);
      const startHour = Math.ceil(rawStart / HOUR_MS) * HOUR_MS;
      return {
        service_type: m.service_type as string,
        service_id: m.service_id as string,
        startHour,
        expected: Math.max(0, Math.round((floorHourNow - startHour) / HOUR_MS)),
      };
    });
    const toIso = new Date(floorHourNow).toISOString();
    const billedCounts = await Promise.all(
      windows.map((w) =>
        billing
          .from("service_charges")
          .select("id", head)
          .eq("service_type", w.service_type)
          .eq("service_id", w.service_id)
          .gte("period_start", new Date(w.startHour).toISOString())
          .lt("period_start", toIso),
      ),
    );
    if (!billedCounts.some((r) => r.error)) {
      let expected = 0;
      let billed = 0;
      let overBilled = 0;
      let gapMeters = 0;
      let cleanMeters = 0;
      let worst: { service_type: string; missing: number } | null = null;
      windows.forEach((w, i) => {
        const b = billedCounts[i].count ?? 0;
        expected += w.expected;
        billed += b;
        if (b > w.expected) overBilled += 1;
        const miss = w.expected - b;
        if (w.expected > 0) {
          if (miss > 0) gapMeters += 1;
          else cleanMeters += 1;
        }
        if (miss > 0 && (worst === null || miss > worst.missing)) {
          worst = { service_type: w.service_type, missing: miss };
        }
      });
      // Broken and owed need opposite responses (billing-lane classification,
      // live case: two same-user gpu_volumes refused 28h on empty balance
      // while a funded meter billed the identical window). Aggregate proxy:
      // a sweep stall cannot bill one meter and skip another in the same
      // hours — gaps alongside fully-billed meters are balance-shaped. The
      // coverage RPC will classify per-hour properly; this is the honest
      // approximation until then.
      const shape: "balance" | "stall" | "unknown" =
        gapMeters === 0
          ? "unknown"
          : cleanMeters > 0
            ? "balance"
            : gapMeters > 1
              ? "stall"
              : "unknown";
      coverage = {
        open: openMeterList.length,
        expected,
        billed,
        missing: Math.max(0, expected - billed),
        worst,
        overBilled,
        shape,
      };
    }
  }

  // --- unpriced-but-sellable: active plans with neither an exact live price
  // nor a '*' fallback — the provisions-nothing-bills-nothing state.
  const priceRows = livePricesRes.error ? null : (livePricesRes.data ?? []);
  let unpricedSellable: number | null = null;
  if (priceRows && !activePlansRes.error) {
    const priced = new Set(priceRows.map((p) => `${p.service_type}:${p.plan_key}`));
    unpricedSellable = (activePlansRes.data ?? []).filter(
      (p) =>
        !priced.has(`${p.service_type}:${p.plan_key}`) && !priced.has(`${p.service_type}:*`),
    ).length;
  }

  // --- gpu: do the two price books agree? (the 10× lesson, kept on screen)
  let gpuBooks: {
    agrees: boolean;
    chargeMarkup: number;
    quoteMin: number;
    quoteMax: number;
  } | null = null;
  const gpuChargeRow = (priceRows ?? []).find(
    (p) => p.service_type === "gpu_pod" && p.plan_key === "*" && p.rate_model === "markup",
  );
  if (gpuChargeRow && !gpuQuoteRes.error && (gpuQuoteRes.data ?? []).length > 0) {
    const quotes = (gpuQuoteRes.data ?? []).map((g) => Number(g.markup_pct));
    const quoteMin = Math.min(...quotes);
    const quoteMax = Math.max(...quotes);
    const chargeMarkup = Number(gpuChargeRow.amount);
    gpuBooks = {
      chargeMarkup,
      quoteMin,
      quoteMax,
      agrees:
        Math.abs(quoteMin - chargeMarkup) < 0.001 && Math.abs(quoteMax - chargeMarkup) < 0.001,
    };
  }
  const txns = txns24Res.data ?? [];
  const topups24h = txns
    .filter((t) => t.type === "recharge" || t.type === "topup")
    .reduce((s, t) => s + Number(t.amount), 0);
  const coupons24h = txns.filter((t) => t.type === "coupon").length;

  // --- audit pipeline: probed, not assumed ---
  const audits = auditProbeRes.error
    ? { up: false, rows: null, error: auditProbeRes.error.message }
    : { up: true, rows: auditProbeRes.count ?? 0, error: null };

  // --- linode sync freshness ---
  const linodeSyncAt = linodeSyncRes.data?.[0]?.synced_at ?? null;
  const linodeSyncAgeH = linodeSyncAt
    ? (Date.now() - Date.parse(linodeSyncAt)) / 3600000
    : null;

  // --- merged event ticker ---
  const events: HqEvent[] = [
    ...charges.slice(0, 10).map(
      (c): HqEvent => ({
        at: c.created_at as string,
        kind: "charge",
        label: `swept ${c.service_type} @ $${Number(c.hourly_rate).toFixed(4)}/hr`,
        amount: Number(c.amount_usd),
        tone: "ok",
      }),
    ),
    ...txns.slice(0, 10).map(
      (t): HqEvent => ({
        at: t.created_at as string,
        kind: "txn",
        label: `${t.type}${t.description ? ` · ${String(t.description).slice(0, 40)}` : ""}`,
        amount: Number(t.amount),
        tone: t.status === "completed" ? "ok" : "warn",
      }),
    ),
    ...(failuresRecentRes.data ?? []).map(
      (f): HqEvent => ({
        at: f.occurred_at as string,
        kind: "failure",
        label: `${f.service_table} ${f.failure_type}: ${String(f.error_message ?? "").slice(0, 60)}`,
        amount: null,
        tone: "bad",
      }),
    ),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 16);

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    users: { total: count(usersRes), new24h: count(usersNewRes) },
    services: {
      compute: count(activeCompute),
      gpu: count(activeGpu),
      database: count(activeDb),
      kubernetes: count(activeK8s),
      objectspace: count(activeObj),
      spectrum: count(activeSpectrum),
      platform_apps: count(activeApps),
      inference: count(activeInference),
      deploy: count(deployProjects),
      domains: count(domainsRes),
    },
    billing: {
      sweepLastAt,
      sweepAgeH,
      charged24h,
      chargeCount24h: count(charges24CountRes) ?? charges.length,
      // The row fetch is server-capped at 1000; past that the sums above are
      // partial (and biased toward dropping the oldest hours of the day).
      charges24hTruncated: (count(charges24CountRes) ?? charges.length) > charges.length,
      byService,
      openMeters: meterRows ? openMeterList.length : null,
      invariantBad,
      coverage,
      unpricedSellable,
      gpuBooks,
      failuresUnresolved: count(failuresCountRes),
      livePrices: priceRows ? priceRows.length : null,
      liveCoupons: count(liveCouponsRes),
      topups24h,
      couponRedemptions24h: coupons24h,
    },
    providers: {
      linodeSyncAt,
      linodeSyncAgeH,
      mainApp,
    },
    audits,
    events,
  });
}
