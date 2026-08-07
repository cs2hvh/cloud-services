"use client";

/**
 * AI platform overview — the front door the admin lacked.
 *
 * Eight pages each answered their own question and none answered the two an
 * operator asks first: which AI features do customers actually use, and is
 * anything broken? See lib/admin/feature-health.ts.
 *
 * "Unused" and "idle" are deliberately NOT failures. A feature nobody has tried is
 * a product fact, and painting it red teaches an operator to ignore the page.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  Info,
  Moon,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import CronHealthPanel from "./cron-health";
import FeatureSwitchesPanel from "./feature-switches";
import type { CapabilityHealth, PlatformSummary, Verdict } from "@/lib/admin/feature-health";

interface Payload {
  window: { days: number; since: string; sort: string };
  sampling: { org_counts_are_sampled: boolean; org_sample_limit: number; org_sample_capped: boolean; note: string };
  summary: PlatformSummary;
  capabilities: CapabilityHealth[];
}

const VERDICT: Record<Verdict, { label: string; tone: string; dot: string; icon: typeof CheckCircle2 }> = {
  healthy:  { label: "Healthy",     tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "bg-emerald-400", icon: CheckCircle2 },
  degraded: { label: "Degraded",    tone: "border-red-500/30 bg-red-500/10 text-red-300",             dot: "bg-red-400",     icon: AlertTriangle },
  idle:     { label: "Idle",        tone: "border-white/15 bg-white/5 text-neutral-300",              dot: "bg-neutral-500", icon: Moon },
  unused:   { label: "Never used",  tone: "border-white/15 bg-white/5 text-neutral-400",              dot: "bg-neutral-600", icon: PackageOpen },
  unknown:  { label: "Unknown",     tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",       dot: "bg-amber-400",   icon: HelpCircle },
};

const compact = (n: number | null) =>
  n === null ? "—" : n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export default function InferenceOverviewAdmin() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [sort, setSort] = useState<"usage" | "concern">("usage");

  const load = useCallback(async (windowDays: string, sortMode: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/inference/overview?days=${windowDays}&sort=${sortMode}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load the platform overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days, sort);
  }, [load, days, sort]);

  const s = data?.summary;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <Activity className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">AI Platform Overview</h1>
            <p className="mt-0.5 text-sm text-neutral-400">What customers use, and what needs attention</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as "usage" | "concern")}>
            <SelectTrigger className="h-9 w-[170px] border-white/10 bg-black/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usage">Most used first</SelectItem>
              <SelectItem value="concern">Problems first</SelectItem>
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-[150px] border-white/10 bg-black/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load(days, sort)} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data || !s ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load the platform overview.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Needs attention</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", s.degraded + s.unknown > 0 ? "text-red-400" : "text-emerald-400")}>
                    {s.degraded + s.unknown}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {s.degraded} degraded, {s.unknown} unmeasurable
                  </p>
                </div>
                <div className={cn("rounded-lg border bg-gradient-to-br p-2", s.degraded + s.unknown > 0 ? "border-red-500/30 from-red-500/20 to-orange-500/20 text-red-400" : "border-emerald-500/30 from-emerald-500/20 to-green-500/20 text-emerald-400")}>
                  {s.degraded + s.unknown > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">In active use</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {s.healthy + s.degraded}
                    <span className="text-base font-normal text-neutral-500"> / {s.capabilities}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{compact(s.recent_activity)} events in window</p>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-2 text-blue-400">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Dormant</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.idle + s.unused}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {s.unused} never used, {s.idle} idle
                  </p>
                </div>
                <div className="rounded-lg border border-white/15 bg-gradient-to-br from-neutral-500/20 to-neutral-600/20 p-2 text-neutral-400">
                  <Moon className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Blind spots</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", s.unmanaged > 0 ? "text-amber-400" : "text-white")}>
                    {s.unmanaged}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    no admin page · {s.unmeasurable_failures} can&apos;t show failures
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-yellow-500/20 p-2 text-amber-400">
                  <HelpCircle className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {/* The one figure that is a sample rather than an exact count. */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 backdrop-blur-xl">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <p className="text-sm text-blue-100">
              {data.sampling.note}
              {data.sampling.org_sample_capped && (
                <strong> A sample was capped in this window, so customer counts are a floor.</strong>
              )}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="[&_tr]:border-white/10">
                  <TableRow>
                    <TableHead className="min-w-[190px]">Capability</TableHead>
                    <TableHead className="min-w-[110px]">State</TableHead>
                    <TableHead className="text-right">In window</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead className="text-right">All time</TableHead>
                    <TableHead className="text-right">Last seen</TableHead>
                    <TableHead className="min-w-[260px]">Why</TableHead>
                    <TableHead className="min-w-[90px]">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.capabilities.map((c) => {
                    const v = VERDICT[c.verdict];
                    return (
                      <TableRow key={c.key} className="border-white/5 hover:bg-white/[0.03]">
                        <TableCell>
                          <p className="font-medium text-white">{c.label}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">{c.purpose}</p>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", v.tone)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", v.dot)} />
                            {v.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{compact(c.recent)}</TableCell>
                        <TableCell className="text-right tabular-nums text-neutral-400">
                          {c.orgs === null ? <span className="text-neutral-600">—</span> : c.orgs}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.failures === null ? (
                            <span className="text-neutral-600" title="This table has no status column, so failures cannot be counted">n/a</span>
                          ) : c.failures === 0 ? (
                            <span className="text-neutral-600">0</span>
                          ) : (
                            <span className={c.error_rate_pct !== null && c.error_rate_pct > 10 ? "text-red-400" : "text-amber-400"}>
                              {c.failures}
                              {c.error_rate_pct !== null && ` (${c.error_rate_pct.toFixed(0)}%)`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-neutral-500">{compact(c.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-neutral-400">
                          {c.idle_days === null ? "never" : c.idle_days === 0 ? "today" : `${c.idle_days}d`}
                        </TableCell>
                        <TableCell className="text-xs text-neutral-400">{c.detail}</TableCell>
                        <TableCell>
                          {c.admin_path ? (
                            <Link href={c.admin_path} className="inline-flex items-center gap-1 text-xs text-purple-300 underline-offset-2 hover:underline">
                              Open <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-neutral-600" title="No admin page manages this capability yet">
                              none
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Row and failure counts are exact database counts over the last {data.window.days} day(s).
            &ldquo;Never used&rdquo; and &ldquo;Idle&rdquo; are not faults — a feature nobody has adopted is a product
            fact, not an outage.
          </p>
        </>
      )}

      {/* The two things the capability table above structurally cannot show.
          Both load independently, so a failure in either still leaves the rest
          of the page usable. */}
      <CronHealthPanel />
      <FeatureSwitchesPanel />
    </div>
  );
}
