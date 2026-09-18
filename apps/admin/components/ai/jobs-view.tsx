"use client";

// Media generation jobs. A job is long-running and bills once on completion,
// so the two things worth surfacing are jobs stranded open (a customer is
// waiting and nothing has billed) and jobs that failed (a customer got
// nothing). Prompts are customer content and are never displayed — only
// their length, so a job can be recognised without reading it.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Film, RefreshCw } from "lucide-react";
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
import { AiTabs } from "@admin/components/ai/ai-tabs";
import { StatCard } from "@admin/components/stat-card";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Job = {
  id: string;
  modality: string;
  modelId: string | null;
  status: string;
  org: string;
  units: number | null;
  unitLabel: string | null;
  costUsd: number;
  resolution: string | null;
  duration: number | null;
  ratio: string | null;
  mode: string | null;
  promptChars: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  upstreamJobId: string | null;
  hasOutput: boolean;
  createdAt: string;
  ageMin: number;
  stuck: boolean;
};

type Feed = {
  days: number;
  summary: {
    total: number;
    byStatus: Record<string, number>;
    open: number;
    oldestOpenMin: number | null;
    stuck: boolean;
    stuckAfterMin: number;
    failureRatePct: number | null;
    unitsBilled: number;
    billedUsd: number;
  };
  jobs: Job[];
};

const age = (min: number) =>
  min < 60 ? `${min}m` : min < 2880 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;

function statusTone(status: string, stuck: boolean) {
  if (stuck) return "border-purple-500/50 bg-purple-500/10 text-purple-300";
  if (status === "completed")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "failed") return "border-red-500/50 bg-red-500/15 text-red-300";
  if (status === "canceled")
    return "border-white/[0.15] bg-white/[0.04] text-white/50";
  return "border-[#3987e5]/40 bg-[#3987e5]/10 text-[#82adfb]";
}

export function AiJobsView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("7");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/jobs", {
        params: { days, status: status === "all" ? undefined : status, limit: 100 },
      });
      setFeed(res.data);
      setError(null);
    } catch {
      setError("Could not load media jobs");
    } finally {
      setLoading(false);
    }
  }, [days, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = feed?.summary;

  return (
    <div>
      <PageHeader
        title="Media jobs"
        description="Image and video generation. A job bills once when it completes, so an open job is unbilled work in progress."
        actions={
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[150px] text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open (queued/running)</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-9 w-[130px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />
      <AiTabs />

      {error && (
        <p className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {s?.stuck && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-purple-500/50 bg-purple-500/10 px-3 py-2 text-[12.5px] text-purple-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">A job has been open for{" "}
            {age(s.oldestOpenMin ?? 0)}</span> — past {s.stuckAfterMin} minutes a
            job is stranded rather than slow: the customer is still waiting and
            nothing has billed. Check the settle cron on the worker.
          </span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Jobs"
          value={s ? s.total : "—"}
          hint={s ? `${s.open} open · last ${days}d` : undefined}
          icon={Film}
        />
        <StatCard
          label="Failure rate"
          value={s?.failureRatePct != null ? `${s.failureRatePct.toFixed(0)}%` : "—"}
          hint={
            s ? `${s.byStatus.failed ?? 0} failed of ${(s.byStatus.completed ?? 0) + (s.byStatus.failed ?? 0)} settled` : undefined
          }
          tone={s?.failureRatePct != null && s.failureRatePct > 10 ? "critical" : "good"}
        />
        <StatCard
          label="Units billed"
          value={s ? s.unitsBilled.toLocaleString() : "—"}
          hint="seconds / images on completed jobs"
        />
        <StatCard
          label="Billed"
          value={s ? `$${s.billedUsd.toFixed(2)}` : "—"}
          hint="completed jobs only"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Model</th>
                <th className="px-4 py-2.5 font-semibold">Org</th>
                <th className="px-4 py-2.5 font-semibold">Spec</th>
                <th className="px-4 py-2.5 text-right font-semibold">Units</th>
                <th className="px-4 py-2.5 text-right font-semibold">Billed</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(feed?.jobs.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No media jobs in this window."}
                  </td>
                </tr>
              ) : (
                feed?.jobs.map((j) => (
                  <tr key={j.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className={`${MONO} whitespace-nowrap px-4 py-2.5 text-[12px] text-muted-foreground`}>
                      {j.createdAt.slice(5, 16).replace("T", " ")}
                      <span className="ml-1.5 text-muted-foreground/70">
                        {age(j.ageMin)} ago
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5">
                      {j.modelId ?? "—"}
                      <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                        {j.modality}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {j.org}
                    </td>
                    <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">
                      {[
                        j.resolution,
                        j.duration ? `${j.duration}s` : null,
                        j.ratio,
                        j.mode,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                      {j.promptChars !== null && (
                        <span className="ml-1.5 text-muted-foreground/60">
                          prompt {j.promptChars}c
                        </span>
                      )}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {j.units === null ? "—" : `${j.units}${j.unitLabel ? ` ${j.unitLabel}` : ""}`}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {j.costUsd > 0 ? `$${j.costUsd.toFixed(4)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10.5px] ${statusTone(j.status, j.stuck)}`}
                        title={j.errorMessage ?? undefined}
                      >
                        {j.stuck ? `stranded ${age(j.ageMin)}` : j.status}
                      </span>
                      {j.errorCode && (
                        <div className="mt-0.5 max-w-[200px] truncate text-[10.5px] text-red-300/80">
                          {j.errorCode}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[10.5px] text-muted-foreground">
        Jobs bill once on completion through the usage queue, so an open job is
        work in progress that has not been charged. Prompts are customer
        content and are never shown here — only their length.
      </p>
    </div>
  );
}
