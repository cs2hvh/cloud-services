"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Coins,
  DollarSign,
  Building2,
  AlertTriangle,
  Braces,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import { ChartCard, ChartTooltip } from "@admin/components/chart-card";
import { SERIES, CHROME, STATUS, axisProps } from "@admin/lib/chart-theme";

type Overview = {
  days: number;
  totals: {
    requests: number;
    tokens: number;
    revenue: number;
    upstreamCost: number;
    marginPct: number | null;
    errors: number;
    errorRatePct: number;
    activeOrgs: number;
    activeKeys: number;
    activeModels: number;
    totalOrgs: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  daily: { day: string; requests: number; revenue: number; errors: number }[];
  topModels: { id: string; label: string; requests: number; revenue: number }[];
  topOrgs: { id: string; label: string; requests: number; revenue: number }[];
};

type Health = {
  gateway: { ok: boolean; latencyMs?: number; detail?: string; url?: string };
  upstream: { ok: boolean; latencyMs?: number; detail?: string };
  database: { ok: boolean; latencyMs?: number; detail?: string };
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact" }).format(n);

export function AiOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [days, setDays] = useState("30");

  const load = useCallback(async () => {
    try {
      const res = await api.get<Overview>("/admin/ai/overview", {
        params: { days },
      });
      setOverview(res.data);
    } catch {
      /* toasted by interceptor */
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get<Health>("/admin/ai/health")
      .then((res) => setHealth(res.data))
      .catch(() => {});
  }, []);

  const t = overview?.totals;

  return (
    <div>
      <PageHeader
        title="AI Labs"
        description="Inference platform — usage, revenue, models and service health."
        actions={
          <>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild size="sm" variant="outline">
              <Link href="/ai/workloads">
                GPU workloads <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/ai/models">
                Model catalog <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      {/* Health strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HealthCard
          label="Gateway edge"
          check={health?.gateway}
          extra={health?.gateway?.latencyMs ? `${health.gateway.latencyMs} ms` : undefined}
        />
        <HealthCard
          label="Upstream (Wokey)"
          check={health?.upstream}
          extra={health?.upstream?.latencyMs ? `${health.upstream.latencyMs} ms` : undefined}
        />
        <HealthCard
          label="Control plane DB"
          check={health?.database}
          extra={health?.database?.latencyMs ? `${health.database.latencyMs} ms` : undefined}
        />
      </div>

      {/* KPI row */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Requests" value={t ? compact(t.requests) : "—"} icon={Activity} />
        <StatCard label="Tokens" value={t ? compact(t.tokens) : "—"} icon={Braces} />
        <StatCard
          label="Revenue"
          value={t ? money(t.revenue) : "—"}
          icon={DollarSign}
          hint={t ? `${money(t.upstreamCost)} upstream cost` : undefined}
        />
        <StatCard
          label="Margin"
          value={t?.marginPct != null ? `${t.marginPct}%` : "—"}
          icon={TrendingUp}
          hint="revenue vs upstream cost"
        />
        <StatCard
          label="Error rate"
          value={t ? `${t.errorRatePct}%` : "—"}
          icon={AlertTriangle}
          tone={t && t.errorRatePct > 2 ? "critical" : t && t.errorRatePct > 0.5 ? "warning" : undefined}
          hint={
            t?.p50LatencyMs != null
              ? `p50 ${t.p50LatencyMs} ms · p95 ${t.p95LatencyMs} ms`
              : undefined
          }
        />
        <StatCard
          label="Active orgs"
          value={t ? t.activeOrgs : "—"}
          icon={Building2}
          hint={t ? `of ${t.totalOrgs} · ${t.activeKeys} keys · ${t.activeModels} models` : undefined}
        />
      </div>

      {/* Charts */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Requests" subtitle={`per day, last ${overview?.days ?? days} days`}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview?.daily ?? []} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="aiRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHROME.grid} />
                <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={42} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHROME.baseline }} />
                <Area
                  type="monotone"
                  dataKey="requests"
                  name="Requests"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#aiRequests)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Revenue" subtitle={`USD per day, last ${overview?.days ?? days} days`}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview?.daily ?? []} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="aiRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHROME.grid} />
                <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} width={42} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip
                  content={<ChartTooltip formatter={(v) => money(Number(v))} />}
                  cursor={{ stroke: CHROME.baseline }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#aiRevenue)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Top models" subtitle="by revenue in window">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overview?.topModels ?? []}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke={CHROME.grid} />
                <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `$${v}`} />
                <YAxis
                  type="category"
                  dataKey="label"
                  {...axisProps}
                  width={150}
                  tick={{ fill: CHROME.secondaryInk, fontSize: 11 }}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(v) => money(Number(v))} />}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="revenue" name="Revenue" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Top organizations" subtitle="by revenue in window">
          <div className="flex h-56 flex-col justify-start gap-1 overflow-y-auto custom-scrollbar">
            {(overview?.topOrgs ?? []).length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No usage in this window
              </div>
            )}
            {(overview?.topOrgs ?? []).map((org, i) => (
              <div
                key={org.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]"
              >
                <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{org.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {compact(org.requests)} requests
                  </div>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {money(org.revenue)}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function HealthCard({
  label,
  check,
  extra,
}: {
  label: string;
  check?: { ok: boolean; detail?: string };
  extra?: string;
}) {
  const color = !check ? STATUS.neutral : check.ok ? STATUS.good : STATUS.critical;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="relative flex h-2.5 w-2.5">
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-30"
          style={{ backgroundColor: color }}
        />
        <span
          className="relative inline-flex h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">
          {check ? (check.ok ? (check.detail ?? "operational") : (check.detail ?? "down")) : "checking…"}
        </div>
      </div>
      {extra && (
        <span className="text-xs tabular-nums text-muted-foreground">{extra}</span>
      )}
    </div>
  );
}
