"use client";

// HQ Analytics — the stakeholder half of the monitor. 30-day money, growth
// and ops aggregates from /api/admin/monitor/analytics (server-bucketed).
//
// Dataviz doctrine (see the dataviz skill): categorical hues are assigned in
// FIXED entity order, never cycled or ranked; one axis per chart (both lines
// on a chart share USD); text wears ink tokens, never series colors; every
// multi-series chart carries a legend; unknown renders as unknown, "≥" marks
// declared-partial sums.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Dark-mode categorical palette (validated order — dataviz reference):
// slot order is the CVD-safety mechanism. Entity → slot is FIXED so filters
// or growth never repaint a service.
const SERVICE_COLOR: Record<string, string> = {
  deploy: "#3987e5", // blue      slot 1
  gpu_volume: "#d95926", // orange  slot 2
  objectspace: "#199e70", // aqua   slot 3
  compute: "#c98500", // yellow    slot 4
  database: "#d55181", // magenta  slot 5
  gpu_pod: "#008300", // green     slot 6
  kubernetes: "#9085e9", // violet slot 7
  spectrum: "#e66767", // red      slot 8
};
const OTHER_COLOR = "#6b6a66";
const serviceColor = (s: string) => SERVICE_COLOR[s] ?? OTHER_COLOR;

const INK = { primary: "#ffffff", secondary: "#c3c2b7", muted: "#898781" };
const GRID = "#26262a";
const SURFACE = "#111216";

interface DayRevenue {
  day: string;
  total: number;
  discount: number;
  byService: Record<string, number>;
}

interface Feed {
  ok: boolean;
  at: string;
  windowDays: number;
  billingActiveSince: string;
  billedWindowDays: number;
  revenue: {
    ok: boolean;
    truncated: boolean;
    total30: number;
    gross30: number;
    effectiveDiscountPct: number | null;
    byDay: DayRevenue[];
    mix: Array<{ service: string; usd: number }>;
    margin: {
      upstream30: number;
      coveredRevenue30: number;
      marginUsd30: number;
      coveragePct: number | null;
    };
    discount30: number;
  };
  customers: { paying: number; concentrationPct: number | null };
  cash: {
    ok: boolean;
    truncated: boolean;
    topups30: number;
    coupons30: number;
    byDay: Array<{ day: string; topups: number; charged: number }>;
  };
  arrears: { ok: boolean; truncated: boolean; usd: number; rows: number };
  users: { ok: boolean; truncated: boolean; new30: number; byDay: Array<{ day: string; count: number }> };
  support: { ok: boolean; open: number | null; total: number | null; oldestOpen: string | null };
  topCustomers: Array<{ user_id: string; usd: number; name: string | null }> | null;
}

const money = (n: number, dp?: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: dp ?? 2,
    maximumFractionDigits: dp ?? (Math.abs(n) < 10 ? 4 : 2),
  })}`;
const dayLabel = (d: string) => d.slice(5);

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "bad" | "dim";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p
        className={`mt-1 font-heading text-xl font-semibold tracking-tight ${
          tone === "bad"
            ? "text-red-300"
            : tone === "warn"
              ? "text-amber-300"
              : tone === "dim"
                ? "text-white/40"
                : "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] leading-tight text-white/40">{sub}</p>}
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[13px] font-semibold tracking-tight">{title}</h2>
        {right && <span className="text-[10.5px] text-white/35">{right}</span>}
      </div>
      {children}
    </section>
  );
}

function LegendChips({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[10.5px] text-white/50">
          <span className="h-2 w-2 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "#0d0e11",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    fontSize: 11,
    color: INK.secondary,
  },
  labelStyle: { color: INK.muted, fontSize: 10 },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

const axisProps = {
  tick: { fill: INK.muted, fontSize: 10 },
  axisLine: { stroke: "#383835" },
  tickLine: false as const,
};

function Unavailable({ what }: { what: string }) {
  return (
    <p className="flex h-[200px] items-center justify-center text-xs text-white/35">
      {what} read failed — unknown, not zero
    </p>
  );
}

export default function AnalyticsView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/monitor/analytics", { cache: "no-store" });
      const data = (await res.json()) as Feed & { error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `analytics feed returned ${res.status}`);
        return;
      }
      setFeed(data);
      setError(null);
    } catch {
      setError("analytics feed unreachable");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (!feed) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          {error ? `Analytics failed: ${error}` : "Crunching 30 days…"}
        </p>
      </div>
    );
  }

  const rev = feed.revenue;
  const services = rev.mix.map((m) => m.service);
  const revData = rev.byDay.map((d) => ({
    day: dayLabel(d.day),
    ...Object.fromEntries(services.map((s) => [s, d.byService[s] ?? 0])),
  }));
  const cashData = feed.cash.byDay.map((d) => ({
    day: dayLabel(d.day),
    topups: d.topups,
    charged: d.charged,
  }));
  const signupData = feed.users.byDay.map((d) => ({ day: dayLabel(d.day), count: d.count }));
  const mixTotal = rev.mix.reduce((s, m) => s + m.usd, 0);
  const geq = rev.truncated ? "≥ " : "";
  const oldestOpenDays = feed.support.oldestOpen
    ? Math.floor((Date.now() - Date.parse(feed.support.oldestOpen)) / 86400000)
    : null;
  // Two window types, never one caption: revenue-ish sources can only exist
  // since billing went live; signups/top-ups genuinely span the full window.
  const billedLabel =
    feed.billedWindowDays < feed.windowDays
      ? `since ${new Date(feed.billingActiveSince).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`
      : `${feed.windowDays}d`;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          refresh failing: {error} — showing last good data
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label={`Revenue · ${billedLabel}`}
          value={rev.ok ? `${geq}${money(rev.total30)}` : "—"}
          sub={rev.ok ? "usage + deploy charges" : "read failed"}
          tone={rev.ok ? undefined : "dim"}
        />
        <Tile
          label="Margin · covered"
          value={rev.ok ? money(rev.margin.marginUsd30) : "—"}
          sub={
            rev.ok
              ? rev.margin.coveragePct === null
                ? "no revenue in window"
                : `on ${rev.margin.coveragePct.toFixed(0)}% of revenue with known upstream cost`
              : "read failed"
          }
          tone={rev.ok ? (rev.margin.marginUsd30 < 0 ? "bad" : "ok") : "dim"}
        />
        <Tile
          label={`Top-ups · ${feed.windowDays}d`}
          value={feed.cash.ok ? money(feed.cash.topups30) : "—"}
          sub={feed.cash.ok ? "completed wallet credits only" : "read failed"}
          tone={feed.cash.ok ? undefined : "dim"}
        />
        <Tile
          label={`Discounts · ${billedLabel}`}
          value={rev.ok ? money(rev.discount30) : "—"}
          sub={
            rev.ok
              ? rev.effectiveDiscountPct === null
                ? `coupon credits ${money(feed.cash.coupons30)}`
                : `${rev.effectiveDiscountPct.toFixed(1)}% off gross · coupons ${money(feed.cash.coupons30)}`
              : "read failed"
          }
          tone={rev.ok ? undefined : "dim"}
        />
        <Tile
          label="Arrears · receipted"
          value={feed.arrears.ok ? `${feed.arrears.truncated ? "≥ " : ""}${money(feed.arrears.usd)}` : "—"}
          sub={
            feed.arrears.ok
              ? feed.arrears.rows > 0
                ? `${feed.arrears.rows} failed-charge receipts · all-time`
                : "no unpaid hours on record"
              : "read failed"
          }
          tone={feed.arrears.ok ? (feed.arrears.usd > 0 ? "warn" : "ok") : "dim"}
        />
        <Tile
          label={`Paying customers · ${billedLabel}`}
          value={rev.ok ? String(feed.customers.paying) : "—"}
          sub={
            rev.ok
              ? feed.customers.concentrationPct === null
                ? "distinct billed accounts"
                : `top ${Math.min(8, feed.customers.paying)} hold ${feed.customers.concentrationPct.toFixed(0)}% of revenue`
              : "read failed"
          }
          tone={rev.ok ? undefined : "dim"}
        />
        <Tile
          label={`New users · ${feed.windowDays}d`}
          value={feed.users.ok ? String(feed.users.new30) : "—"}
          sub={feed.users.ok ? "signups" : "read failed"}
          tone={feed.users.ok ? undefined : "dim"}
        />
        <Tile
          label="Support queue"
          value={feed.support.ok ? String(feed.support.open ?? "—") : "—"}
          sub={
            feed.support.ok
              ? oldestOpenDays !== null
                ? `open tickets · oldest ${oldestOpenDays}d`
                : "open tickets"
              : "read failed"
          }
          tone={feed.support.ok ? ((feed.support.open ?? 0) > 0 ? "warn" : "ok") : "dim"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Revenue stacked by service */}
        <Card
          title="Daily revenue by service"
          right={rev.truncated ? "partial — row cap hit" : `${billedLabel} · USD`}
        >
          {rev.ok ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} />
                  {services.map((s) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      stackId="rev"
                      fill={serviceColor(s)}
                      stroke={SURFACE}
                      strokeWidth={1}
                      maxBarSize={22}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <LegendChips items={services.map((s) => ({ label: s, color: serviceColor(s) }))} />
            </>
          ) : (
            <Unavailable what="revenue" />
          )}
        </Card>

        {/* Cash in vs usage charged. (A daily margin chart was deliberately
            CUT: upstream_cost exists only on compute rows and the billed
            history is days old — a trend line would be noise dressed as
            signal. Margin lives as one KPI with its coverage declared.) */}
        <Card
          title="Cash in vs usage charged"
          right={`top-ups span ${feed.windowDays}d · usage billable ${billedLabel}`}
        >
          {feed.cash.ok ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={cashData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} />
                  <Line type="monotone" dataKey="topups" stroke="#199e70" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="charged" stroke="#3987e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <LegendChips
                items={[
                  { label: "top-ups (cash in)", color: "#199e70" },
                  { label: "usage charged", color: "#3987e5" },
                ]}
              />
            </>
          ) : (
            <Unavailable what="transactions" />
          )}
        </Card>

        {/* Signups */}
        <Card title="Signups per day" right={`${feed.users.new30} in ${feed.windowDays}d`}>
          {feed.users.ok ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={signupData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axisProps} width={40} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Unavailable what="signups" />
          )}
        </Card>

        {/* Service mix */}
        <Card title="Revenue mix by service" right={`${billedLabel} · share`}>
          {rev.ok && mixTotal > 0 ? (
            <div className="space-y-2.5">
              {rev.mix.map((m) => {
                const pct = (m.usd / mixTotal) * 100;
                return (
                  <div key={m.service}>
                    <div className="mb-1 flex items-baseline justify-between text-[11px]">
                      <span className="inline-flex items-center gap-1.5 text-white/60">
                        <span
                          className="h-2 w-2 rounded-[3px]"
                          style={{ background: serviceColor(m.service) }}
                        />
                        {m.service}
                      </span>
                      <span className="tabular-nums text-white/45">
                        {money(m.usd)} · {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(pct, 0.75)}%`, background: serviceColor(m.service) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : rev.ok ? (
            <p className="flex h-[200px] items-center justify-center text-xs text-white/35">
              no revenue in the window
            </p>
          ) : (
            <Unavailable what="revenue" />
          )}
        </Card>

        {/* Top customers */}
        <Card title="Top customers by spend" right={`${billedLabel} · usage + deploy`}>
          {feed.topCustomers === null ? (
            <Unavailable what="spend" />
          ) : feed.topCustomers.length === 0 ? (
            <p className="flex h-[200px] items-center justify-center text-xs text-white/35">
              no spend in the window
            </p>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                  <th className="pb-2 font-semibold">#</th>
                  <th className="pb-2 font-semibold">customer</th>
                  <th className="pb-2 text-right font-semibold">spend</th>
                </tr>
              </thead>
              <tbody>
                {feed.topCustomers.map((c, i) => (
                  <tr key={c.user_id} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 text-white/35">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <Link
                        href={`/users/${c.user_id}`}
                        className="text-white/80 underline-offset-2 hover:underline"
                      >
                        {c.name ?? `${c.user_id.slice(0, 8)}…`}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-white/70">{money(c.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <p className="text-[10.5px] text-white/30">
        Aggregated server-side · refreshed every 60s · billing has existed since{" "}
        {new Date(feed.billingActiveSince).toUTCString().slice(0, 16)}, so billed figures cover{" "}
        {feed.billedWindowDays} day(s) while top-ups and signups span the full {feed.windowDays} ·
        margin covers only rows carrying upstream cost (compute today) · &ldquo;≥&rdquo; marks a
        sum that hit the row-fetch cap and is declared partial rather than passed off as complete.
      </p>
    </div>
  );
}
