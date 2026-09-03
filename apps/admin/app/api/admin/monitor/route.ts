import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { MAIN_APP_URL } from "@admin/lib/sections";

export const dynamic = "force-dynamic";

/**
 * The HQ board's single feed. Read-only aggregation over billing/public/paas
 * — every number here is displayed on the live platform map, so each one
 * must be a real read, never a default that could render as health.
 *
 * Signal sources (agreed with the billing lane):
 * - active service counts: billing.active_* views (what the sweep itself sees)
 * - sweep freshness: max(service_charges.created_at) — the sweep's own writes
 * - open meters: service_meters with ended_at IS NULL
 * - failures: billing_failure_events WHERE resolved = false
 * - audit pipeline: probed live (fails with PGRST106 until the schema is
 *   re-exposed; the board shows that as a red node, NOT as a broken board)
 */

const DAY_MS = 24 * 3600 * 1000;

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
    openMetersRes,
    failuresCountRes,
    failuresRecentRes,
    livePricesRes,
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
      .select("service_type, amount_usd, created_at, hourly_rate")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(1000),
    billing.from("service_meters").select("id", head).is("ended_at", null),
    billing.from("billing_failure_events").select("id", head).eq("resolved", false),
    billing
      .from("billing_failure_events")
      .select("service_table, failure_type, error_message, occurred_at")
      .eq("resolved", false)
      .order("occurred_at", { ascending: false })
      .limit(5),
    billing.from("service_pricing").select("id", head).is("effective_to", null),
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
      chargeCount24h: charges.length,
      byService,
      openMeters: count(openMetersRes),
      failuresUnresolved: count(failuresCountRes),
      livePrices: count(livePricesRes),
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
