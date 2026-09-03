import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { BILLING_ACTIVE_SINCE } from "@admin/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * Analytics feed for the HQ board — 30-day aggregations, computed server-side
 * so the client gets day-buckets, not row dumps.
 *
 * Honesty rules carried over from the monitor feed:
 * - PostgREST caps every request at 1000 rows, so row sources are fetched via
 *   .range() pages with a hard page budget; hitting the budget sets a
 *   `truncated` flag the UI must surface as "≥" — never silent partial sums.
 * - A failed read nulls its section; the UI renders unknown, not zero.
 * - Margin uses service_charges.upstream_cost, which only compute rows carry
 *   today — the margin figure declares its coverage instead of implying it
 *   spans all revenue.
 */

const DAY_MS = 24 * 3600 * 1000;
const WINDOW_DAYS = 30;
const PAGE = 1000;
const MAX_PAGES = 10;

interface PagedResult<T> {
  rows: T[];
  truncated: boolean;
  error: string | null;
}

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<PagedResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await query(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { rows, truncated: false, error: error.message };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

const dayKey = (iso: string) => iso.slice(0, 10);

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");
  const paas = supabase.schema("paas");
  const support = supabase.schema("support");
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();

  const [
    chargesRes,
    paasRes,
    txnsRes,
    signupsRes,
    arrearsRes,
    ticketsOpenRes,
    ticketsTotalRes,
    oldestOpenRes,
  ] = await Promise.all([
      fetchAll<{
        period_start: string;
        service_type: string;
        amount_usd: string | number;
        gross_usd: string | number | null;
        discount_usd: string | number | null;
        upstream_cost: string | number | null;
        user_id: string;
      }>((from, to) =>
        billing
          .from("service_charges")
          .select("period_start, service_type, amount_usd, gross_usd, discount_usd, upstream_cost, user_id")
          .gte("period_start", since)
          .order("period_start", { ascending: true })
          .range(from, to),
      ),
      fetchAll<{ period_start: string; amount_usd: string | number; user_id: string }>((from, to) =>
        paas
          .from("project_charges")
          .select("period_start, amount_usd, user_id")
          .gte("period_start", since)
          .order("period_start", { ascending: true })
          .range(from, to),
      ),
      fetchAll<{ created_at: string; type: string; status: string; amount: string | number }>(
        (from, to) =>
          billing
            .from("transactions")
            .select("created_at, type, status, amount")
            .gte("created_at", since)
            .order("created_at", { ascending: true })
            .range(from, to),
      ),
      fetchAll<{ created_at: string }>((from, to) =>
        supabase
          .from("user_profiles")
          .select("created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      // Arrears is a debt, not an event: ALL-TIME receipted failed-usage rows,
      // not a 30-day slice — an hour unpaid 35 days ago is still owed.
      fetchAll<{ amount: string | number }>((from, to) =>
        billing
          .from("transactions")
          .select("amount")
          .eq("status", "failed")
          .eq("type", "usage")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      support.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      support.from("support_tickets").select("id", { count: "exact", head: true }),
      support
        .from("support_tickets")
        .select("created_at, ticket_number")
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

  // ---- usage revenue: day buckets by service, margin where upstream known ----
  type DayBucket = {
    day: string;
    byService: Record<string, number>;
    total: number;
    gross: number;
    upstream: number;
    upstreamCoveredUsd: number;
    discount: number;
  };
  const days = new Map<string, DayBucket>();
  const bucket = (day: string): DayBucket => {
    let b = days.get(day);
    if (!b) {
      b = { day, byService: {}, total: 0, gross: 0, upstream: 0, upstreamCoveredUsd: 0, discount: 0 };
      days.set(day, b);
    }
    return b;
  };
  const spendByUser = new Map<string, number>();
  const mix = new Map<string, number>();

  const revenueOk = chargesRes.error === null;
  for (const c of chargesRes.rows) {
    const day = dayKey(c.period_start);
    const amt = Number(c.amount_usd);
    const b = bucket(day);
    b.byService[c.service_type] = (b.byService[c.service_type] ?? 0) + amt;
    b.total += amt;
    b.gross += Number(c.gross_usd ?? amt);
    b.discount += Number(c.discount_usd ?? 0);
    if (c.upstream_cost !== null) {
      b.upstream += Number(c.upstream_cost);
      b.upstreamCoveredUsd += amt;
    }
    mix.set(c.service_type, (mix.get(c.service_type) ?? 0) + amt);
    spendByUser.set(c.user_id, (spendByUser.get(c.user_id) ?? 0) + amt);
  }
  const paasOk = paasRes.error === null;
  for (const p of paasRes.rows) {
    const day = dayKey(p.period_start);
    const amt = Number(p.amount_usd);
    const b = bucket(day);
    // project_charges records NO gross/discount/upstream — those are unknown
    // (NULL), not zero. Folding deploy dollars into the gross denominator
    // would claim "no discounts were given on deploy"; the discount rate is
    // therefore computed only over rows that actually record gross.
    b.byService["deploy"] = (b.byService["deploy"] ?? 0) + amt;
    b.total += amt;
    mix.set("deploy", (mix.get("deploy") ?? 0) + amt);
    spendByUser.set(p.user_id, (spendByUser.get(p.user_id) ?? 0) + amt);
  }

  // ---- cash movements ----
  const cashByDay = new Map<string, { topups: number; refunds: number; purchases: number }>();
  let topups30 = 0;
  let coupons30 = 0;
  const txnsOk = txnsRes.error === null;
  for (const t of txnsRes.rows) {
    const day = dayKey(t.created_at);
    const amt = Number(t.amount);
    const c = cashByDay.get(day) ?? { topups: 0, refunds: 0, purchases: 0 };
    // Only real completed top-ups count as cash in — coupon/credit grants are
    // kept separate so the line reconciles against the bank.
    if (t.type === "topup" && t.status === "completed") {
      c.topups += amt;
      topups30 += amt;
    } else if (t.type === "refund") {
      c.refunds += amt;
    } else if (t.type === "purchase" || t.type === "setup") {
      c.purchases += amt;
    } else if (t.type === "coupon") {
      coupons30 += amt;
    }
    cashByDay.set(day, c);
  }

  // Receipted arrears — all-time, paged, truncation declared.
  const arrearsOk = arrearsRes.error === null;
  const arrearsUsd = arrearsRes.rows.reduce((s, r) => s + Number(r.amount), 0);
  const arrearsRows = arrearsRes.rows.length;

  // ---- signups ----
  const signupsByDay = new Map<string, number>();
  const signupsOk = signupsRes.error === null;
  for (const u of signupsRes.rows) {
    const day = dayKey(u.created_at);
    signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
  }

  // ---- top customers (usage + deploy spend), names resolved in one query ----
  const top = [...spendByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([user_id, usd]) => ({ user_id, usd }));
  let topCustomers: Array<{ user_id: string; usd: number; name: string | null }> = top.map(
    (t) => ({ ...t, name: null }),
  );
  if (top.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, username, display_name")
      .in(
        "id",
        top.map((t) => t.user_id),
      );
    const nameOf = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        (p.display_name as string | null) ?? (p.username as string | null),
      ]),
    );
    topCustomers = top.map((t) => ({ ...t, name: nameOf.get(t.user_id) ?? null }));
  }

  // ---- day axes. Two different windows, deliberately: signups/top-ups are
  // true 30-day sources, but NO hour before BILLING_ACTIVE_SINCE can ever be
  // billed — a 30-day revenue axis would read as 27 days of outage. Revenue
  // charts clamp to the billed window and the UI captions each window as
  // what it is (missing days inside an axis are real zeros: the source
  // answered; there simply were no rows that day).
  const axis: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    axis.push(dayKey(new Date(Date.now() - i * DAY_MS).toISOString()));
  }
  const activeSinceDay = dayKey(BILLING_ACTIVE_SINCE);
  const billedAxis = axis.filter((d) => d >= activeSinceDay);
  const revenueByDay = billedAxis.map((day) => {
    const b = days.get(day);
    return {
      day,
      total: b?.total ?? 0,
      discount: b?.discount ?? 0,
      byService: b?.byService ?? {},
    };
  });
  const cashflowByDay = axis.map((day) => ({
    day,
    topups: cashByDay.get(day)?.topups ?? 0,
    charged: days.get(day)?.total ?? 0,
  }));
  const signups = axis.map((day) => ({ day, count: signupsByDay.get(day) ?? 0 }));

  const all = [...days.values()];
  const revenue30 = all.reduce((s, d) => s + d.total, 0);
  const gross30 = all.reduce((s, d) => s + d.gross, 0);
  const upstream30 = all.reduce((s, d) => s + d.upstream, 0);
  const upstreamCovered30 = all.reduce((s, d) => s + d.upstreamCoveredUsd, 0);
  const discount30 = all.reduce((s, d) => s + d.discount, 0);
  const topSum = top.reduce((s, t) => s + t.usd, 0);

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    billingActiveSince: BILLING_ACTIVE_SINCE,
    billedWindowDays: billedAxis.length,
    revenue: {
      ok: revenueOk && paasOk,
      truncated: chargesRes.truncated || paasRes.truncated,
      total30: revenue30,
      gross30,
      effectiveDiscountPct: gross30 > 0 ? (discount30 / gross30) * 100 : null,
      byDay: revenueByDay,
      mix: [...mix.entries()]
        .map(([service, usd]) => ({ service, usd }))
        .sort((a, b) => b.usd - a.usd),
      // Margin is only claimable where upstream_cost exists on the row.
      margin: {
        upstream30,
        coveredRevenue30: upstreamCovered30,
        marginUsd30: upstreamCovered30 - upstream30,
        coveragePct: revenue30 > 0 ? (upstreamCovered30 / revenue30) * 100 : null,
      },
      discount30,
    },
    customers: {
      paying: spendByUser.size,
      concentrationPct: revenue30 > 0 ? (topSum / revenue30) * 100 : null,
    },
    cash: {
      ok: txnsOk,
      truncated: txnsRes.truncated,
      topups30,
      coupons30,
      byDay: cashflowByDay,
    },
    arrears: {
      ok: arrearsOk,
      truncated: arrearsRes.truncated,
      usd: arrearsUsd,
      rows: arrearsRows,
    },
    users: {
      ok: signupsOk,
      truncated: signupsRes.truncated,
      new30: signupsRes.rows.length,
      byDay: signups,
    },
    support: {
      ok: !ticketsOpenRes.error && !ticketsTotalRes.error,
      open: ticketsOpenRes.error ? null : (ticketsOpenRes.count ?? 0),
      total: ticketsTotalRes.error ? null : (ticketsTotalRes.count ?? 0),
      oldestOpen: oldestOpenRes.error ? null : (oldestOpenRes.data?.[0]?.created_at ?? null),
    },
    topCustomers: revenueOk && paasOk ? topCustomers : null,
  });
}
