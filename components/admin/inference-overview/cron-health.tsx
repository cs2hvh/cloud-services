"use client";

/**
 * Are the scheduled sweeps still running?
 *
 * The capability table above is built from rows customers created. It cannot see
 * the machinery that RECOVERS those rows, because a sweep that stops running
 * produces nothing at all — it just quietly stops fixing things. Six of these
 * endpoints returned 404 in production for about two months and the overview
 * reported the platform healthy throughout.
 *
 * Loaded separately from the capability table on purpose: if one query fails the
 * other half of the page still renders.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import type { CronHealth, CronSummary, CronVerdict } from "@/lib/admin/cron-registry";

interface Payload {
  summary: CronSummary;
  jobs: CronHealth[];
  note: string;
}

const VERDICT: Record<CronVerdict, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  ok:        { label: "Running",    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: CheckCircle2 },
  failing:   { label: "Failing",    tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",       icon: AlertTriangle },
  stale:     { label: "Stalled",    tone: "border-red-500/30 bg-red-500/10 text-red-300",             icon: Clock },
  never_run: { label: "Never ran",  tone: "border-red-500/30 bg-red-500/10 text-red-300",             icon: HelpCircle },
};

function lastRun(job: CronHealth): string {
  if (job.age_minutes === null) return "never";
  if (job.age_minutes < 1) return "just now";
  if (job.age_minutes < 90) return `${job.age_minutes}m ago`;
  if (job.age_minutes < 60 * 48) return `${Math.round(job.age_minutes / 60)}h ago`;
  return `${Math.round(job.age_minutes / 1440)}d ago`;
}

export default function CronHealthPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/inference/cron");
      setData(res.data);
      setError(null);
    } catch (err) {
      const message =
        (err as { response?: { data?: { hint?: string; error?: string } } })?.response?.data?.hint ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to load scheduled-job health";
      setError(message);
      toast.error("Failed to load scheduled-job health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />;

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-100 backdrop-blur-xl">
        <p className="font-medium">Scheduled-job health is unavailable.</p>
        <p className="mt-1 text-amber-100/80">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Scheduled jobs</h2>
          <p className="mt-0.5 text-sm text-neutral-400">
            The sweeps that recover stuck work. {s.needs_attention === 0
              ? "All running."
              : `${s.needs_attention} of ${s.jobs} need attention.`}
          </p>
        </div>
        <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {s.needs_attention > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 backdrop-blur-xl">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-100">
            <strong>
              {s.never_run + s.stale > 0
                ? `${s.never_run + s.stale} sweep(s) are not running.`
                : `${s.failing} sweep(s) are failing.`}
            </strong>{" "}
            {data.note}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="[&_tr]:border-white/10">
              <TableRow>
                {/* Six columns, not seven. "What happens if it stops" is static
                    context and moved under the job name; the LIVE diagnosis —
                    the thing an operator acts on — was the column being pushed
                    off the right edge. */}
                <TableHead className="min-w-[300px]">Job</TableHead>
                <TableHead className="min-w-[110px]">State</TableHead>
                <TableHead className="text-right">Last run</TableHead>
                <TableHead className="text-right">Every</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="min-w-[320px]">What&apos;s happening</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.jobs.map((job) => {
                const v = VERDICT[job.verdict];
                return (
                  <TableRow key={job.job} className="border-white/5 hover:bg-white/[0.03]">
                    <TableCell className="align-top">
                      <p className="font-medium text-white">{job.label}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-neutral-500">{job.path}</p>
                      <p className="mt-1 max-w-[300px] whitespace-normal text-xs text-neutral-500">
                        If it stops: {job.protects}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", v.tone)}>
                        <v.icon className="h-3 w-3" />
                        {v.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums text-neutral-300">{lastRun(job)}</TableCell>
                    <TableCell className="text-right align-top tabular-nums text-neutral-500">{job.interval_minutes}m</TableCell>
                    <TableCell className="text-right align-top tabular-nums text-neutral-500">
                      {job.runs_total}
                      {job.consecutive_failures > 0 && (
                        <span className="text-red-400"> · {job.consecutive_failures} failing</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[320px] whitespace-normal align-top text-xs text-neutral-400">
                      {job.detail}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
