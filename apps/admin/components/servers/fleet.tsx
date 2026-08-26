"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Server,
  CircleCheck,
  CircleAlert,
  CircleDashed,
  DollarSign,
  TrendingUp,
  RefreshCw,
  FolderSync,
  ExternalLink,
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
import Link from "next/link";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@admin/components/page-header";
import { StatCard } from "@admin/components/stat-card";
import { ChartCard, ChartTooltip } from "@admin/components/chart-card";
import { SERIES, CHROME, STATUS, axisProps } from "@admin/lib/chart-theme";
import { ServersTable } from "./servers-table";
import type { FleetOverview } from "./types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ServersFleet() {
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadOverview = useCallback(async () => {
    try {
      const res = await api.get<FleetOverview>("/admin/servers/overview");
      setOverview(res.data);
    } catch {
      // axios interceptor already toasts
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview, reloadKey]);

  const refreshAll = () => setReloadKey((k) => k + 1);

  const syncCatalog = async () => {
    setSyncing(true);
    try {
      await api.post("/admin/linode/sync");
      toast.success("Linode catalog synced");
      refreshAll();
    } catch {
      /* toasted by interceptor */
    } finally {
      setSyncing(false);
    }
  };

  const reconcile = async () => {
    setReconciling(true);
    try {
      const res = await api.post("/admin/linode/reconcile");
      const report = res.data?.report ?? res.data ?? {};
      toast.success(
        `Reconcile finished${
          typeof report === "object" ? ` — ${JSON.stringify(report).slice(0, 140)}` : ""
        }`,
      );
      refreshAll();
    } catch {
      /* toasted by interceptor */
    } finally {
      setReconciling(false);
    }
  };

  const t = overview?.totals;

  return (
    <div>
      <PageHeader
        title="Servers"
        description="Customer VMs across Linode and Proxmox — fleet health, growth, and revenue."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reconcile} disabled={reconciling}>
              <RefreshCw className={`mr-2 h-4 w-4 ${reconciling ? "animate-spin" : ""}`} />
              Reconcile Linode
            </Button>
            <Button variant="outline" size="sm" onClick={syncCatalog} disabled={syncing}>
              <FolderSync className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sync catalog
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/servers/linode">
                Linode console
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total servers" value={t ? t.servers : "—"} icon={Server} />
        <StatCard
          label="Running"
          value={t ? t.running : "—"}
          icon={CircleCheck}
          tone="good"
          hint={t ? `${t.stopped} stopped · ${t.suspended} suspended` : undefined}
        />
        <StatCard
          label="Provisioning"
          value={t ? t.provisioning : "—"}
          icon={CircleDashed}
          tone={t && t.provisioning > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Issues"
          value={t ? t.issues : "—"}
          icon={CircleAlert}
          tone={t && t.issues > 0 ? "critical" : undefined}
          hint="failed + error"
        />
        <StatCard
          label="MRR (est.)"
          value={t ? money(t.mrr) : "—"}
          icon={DollarSign}
          hint="sum of monthly rates, billable servers"
        />
        <StatCard
          label="Linode margin"
          value={
            overview?.margin.marginPct != null
              ? `${overview.margin.marginPct}%`
              : "—"
          }
          icon={TrendingUp}
          hint={
            overview?.margin.listHourly
              ? `${money(overview.margin.customerHourly)}/h billed vs ${money(overview.margin.listHourly)}/h list`
              : "no priced Linode servers"
          }
        />
      </div>

      {/* Charts row */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard title="New servers" subtitle="created per week, last 12 weeks">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview?.createdSeries ?? []} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="fleetCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHROME.grid} />
                <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={38} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHROME.baseline }} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Created"
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  fill="url(#fleetCreated)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Servers by region" subtitle="current fleet">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview?.byRegion ?? []} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHROME.grid} />
                <XAxis dataKey="region" {...axisProps} interval={0} angle={-30} textAnchor="end" height={46} />
                <YAxis {...axisProps} allowDecimals={false} width={38} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" name="Servers" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Fleet composition" subtitle="provider and status split">
          <CompositionBars overview={overview} />
        </ChartCard>
      </div>

      {/* Instances table */}
      <div className="mt-3">
        <ServersTable onChanged={refreshAll} />
      </div>
    </div>
  );
}

/** Two labeled single-row part-to-whole bars: provider split and status split. */
function CompositionBars({ overview }: { overview: FleetOverview | null }) {
  if (!overview || overview.totals.servers === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
        No servers yet
      </div>
    );
  }

  const total = overview.totals.servers;
  const providers = [
    { label: "Linode", count: overview.totals.linode, color: SERIES[0] },
    { label: "Proxmox", count: overview.totals.proxmox, color: SERIES[1] },
  ].filter((p) => p.count > 0);

  const statusColor: Record<string, string> = {
    running: STATUS.good,
    provisioning: STATUS.warning,
    suspended: STATUS.warning,
    stopped: STATUS.neutral,
    failed: STATUS.critical,
    error: STATUS.critical,
  };
  const statuses = [...overview.byStatus]
    .sort((a, b) => b.count - a.count)
    .map((s) => ({
      label: s.status,
      count: s.count,
      color: statusColor[s.status] ?? STATUS.neutral,
    }));

  const Row = ({ title, parts }: { title: string; parts: { label: string; count: number; color: string }[] }) => (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">{title}</div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div
            key={p.label}
            className="h-full rounded-sm"
            style={{ width: `${Math.max(2, (p.count / total) * 100)}%`, backgroundColor: p.color }}
            title={`${p.label}: ${p.count}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="capitalize text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular-nums">{p.count}</span>
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-52 flex-col justify-center gap-6">
      <Row title="By provider" parts={providers} />
      <Row title="By status" parts={statuses} />
    </div>
  );
}
