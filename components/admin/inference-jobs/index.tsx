"use client";

/**
 * AI Jobs — the rows behind the fleet counts, and the two actions on them.
 *
 * Worker Fleet answers "is the queue backed up" with numbers. This answers the
 * question support actually gets: which job failed, for which customer, and can
 * you re-run it. One screen for all six job kinds (media, fine-tunes, evals,
 * connectors, deployments, agent runs) because they differ only in vocabulary —
 * see lib/admin/runner-registry.ts.
 *
 * THE UI RULE HERE: a disabled action always says WHY, and an enabled action
 * that costs the customer money always says so before the click. Media has no
 * retry at all (nothing consumes its queue) and the page states that rather than
 * greying out a button and leaving an operator to guess.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import type { JobAction, JobView, JobsSummary } from "@/lib/admin/jobs-ops";

interface Payload {
  service: {
    service: string;
    label: string;
    purpose: string;
    source: string;
    on_hold: string | null;
    retry_supported: boolean;
    retry_unavailable_reason: string | null;
    cancel_supported: boolean;
    detail_columns: string[];
  };
  services: Array<{ service: string; label: string }>;
  page: { index: number; size: number; total: number | null; has_more: boolean };
  filters: { state: string; org_id: string | null };
  summary: JobsSummary;
  jobs: JobView[];
}

interface Pending {
  job: JobView;
  action: JobAction;
}

const STATE_LABELS: Record<string, string> = {
  open: "Queued & running",
  failed: "Failed",
  completed: "Completed",
  all: "All",
};

function age(ms: number | null): string {
  if (ms === null) return "—";
  const m = ms / 60_000;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function InferenceJobsAdmin({ initialService }: { initialService?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState(initialService || "media");
  const [state, setState] = useState("open");
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async (svc: string, st: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/inference/jobs?service=${svc}&state=${st}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(service, state);
  }, [load, service, state]);

  const apply = async () => {
    if (!pending) return;
    setWorking(true);
    try {
      const res = await api.post("/admin/inference/jobs", {
        service,
        job_id: pending.job.id,
        action: pending.action,
      });
      toast.success(
        `Job ${pending.action === "retry" ? "re-queued" : "cancelled"} (${res.data.from} → ${res.data.status})`,
        // A retry into a queue nothing is reading is not an error, but the
        // operator must not walk away thinking work has started.
        res.data.note ? { description: res.data.note, duration: 10_000 } : undefined
      );
      setPending(null);
      await load(service, state);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "The action could not be applied";
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  const s = data?.summary;
  const svc = data?.service;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <ListChecks className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">AI Jobs</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              {svc ? `${svc.purpose} · ${svc.source}` : "Long-running work, per job"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="h-9 w-[200px] border-white/10 bg-black/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(data?.services ?? [{ service: "media", label: "Media generation" }]).map((x) => (
                <SelectItem key={x.service} value={x.service}>
                  {x.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="h-9 w-[180px] border-white/10 bg-black/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={() => void load(service, state)}
            disabled={loading}
          >
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
      ) : !data || !s || !svc ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load jobs.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Queued", value: s.queued, tone: "text-white", hint: "waiting to be claimed" },
              { label: "Running", value: s.in_flight, tone: "text-blue-400", hint: "a worker holds these" },
              {
                label: "Stuck",
                value: s.stuck,
                tone: s.stuck > 0 ? "text-red-400" : "text-emerald-400",
                hint: "running, no heartbeat for 30m+",
              },
              { label: "Failed", value: s.failed, tone: s.failed > 0 ? "text-amber-400" : "text-neutral-400", hint: "in this view" },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
                <p className="text-xs text-neutral-400">{card.label}</p>
                <p className={cn("mt-1 text-2xl font-semibold tabular-nums", card.tone)}>{card.value}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{card.hint}</p>
              </div>
            ))}
          </div>

          {svc.on_hold && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">
                <strong>This runner is on hold.</strong> {svc.on_hold} Retried jobs will queue and wait.
              </p>
            </div>
          )}

          {!svc.retry_supported && svc.retry_unavailable_reason && (
            <div className="flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 backdrop-blur-xl">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <p className="text-sm text-blue-100">
                <strong>Retry is not available for {svc.label.toLowerCase()}.</strong> {svc.retry_unavailable_reason}
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="[&_tr]:border-white/10">
                  <TableRow>
                    <TableHead className="min-w-[190px]">Job</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    {svc.detail_columns.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap">
                        {c.replace(/_/g, " ")}
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[220px]">Error</TableHead>
                    <TableHead className="min-w-[170px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.jobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6 + svc.detail_columns.length} className="py-12 text-center text-sm text-neutral-400">
                        No {STATE_LABELS[state].toLowerCase()} jobs for {svc.label.toLowerCase()}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.jobs.map((job) => (
                      <TableRow key={job.id} className="border-white/5 hover:bg-white/[0.03]">
                        <TableCell>
                          <p className="font-medium text-white">{job.label ?? job.id.slice(0, 8)}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-neutral-500">{job.id}</p>
                        </TableCell>
                        <TableCell className="text-sm text-neutral-300">{job.org_name ?? job.org_id ?? "—"}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              job.stuck
                                ? "border-red-500/30 bg-red-500/10 text-red-300"
                                : job.open
                                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                                  : "border-white/15 bg-white/5 text-neutral-300"
                            )}
                          >
                            {job.stuck && <Clock className="h-3 w-3" />}
                            {job.status}
                            {job.stuck && " · stuck"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-neutral-400">{age(job.age_ms)}</TableCell>
                        {svc.detail_columns.map((c) => (
                          <TableCell key={c} className="max-w-[200px] truncate text-xs text-neutral-400">
                            {cell(job.details[c])}
                          </TableCell>
                        ))}
                        <TableCell className="max-w-[280px] text-xs text-neutral-400">
                          {job.error ? <span className="text-amber-300/90">{job.error}</span> : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(["retry", "cancel"] as JobAction[]).map((action) => {
                              const a = job.actions[action];
                              const Icon = action === "retry" ? RotateCcw : Ban;
                              return (
                                <Button
                                  key={action}
                                  size="sm"
                                  variant="outline"
                                  disabled={!a.allowed}
                                  // A refused action explains itself on hover
                                  // rather than being an inert grey box.
                                  title={a.reason ?? a.warning ?? undefined}
                                  className={cn(
                                    "h-7 border-white/10 px-2 text-xs",
                                    action === "cancel" && a.allowed && "text-red-300 hover:text-red-200"
                                  )}
                                  onClick={() => setPending({ job, action })}
                                >
                                  <Icon className="mr-1 h-3 w-3" />
                                  {action === "retry" ? "Retry" : "Cancel"}
                                </Button>
                              );
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Showing {data.jobs.length} of {data.page.total ?? "?"} {STATE_LABELS[state].toLowerCase()} job(s).
            {data.page.has_more && " More exist than fit on this page."} A job is “stuck” when a worker
            claimed it and stopped sending heartbeats for over 30 minutes.
          </p>
        </>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="border-white/10 bg-neutral-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pending?.action === "retry" ? (
                <RotateCcw className="h-4 w-4 text-blue-400" />
              ) : (
                <Ban className="h-4 w-4 text-red-400" />
              )}
              {pending?.action === "retry" ? "Retry this job?" : "Cancel this job?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-neutral-300">
                <p>
                  {pending?.job.label ?? pending?.job.id.slice(0, 8)} · {pending?.job.org_name ?? "unknown customer"} ·
                  currently <span className="font-medium text-white">{pending?.job.status}</span>
                </p>
                {/* The consequence is stated BEFORE the click — an operator
                    retrying on a customer's behalf is spending their money. */}
                {pending && pending.job.actions[pending.action].warning && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{pending.job.actions[pending.action].warning}</span>
                  </div>
                )}
                <p className="text-xs text-neutral-500">
                  This is recorded in the audit log against your account.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent">Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
              disabled={working}
              className={pending?.action === "cancel" ? "bg-red-600 hover:bg-red-500" : undefined}
            >
              {working ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {pending?.action === "retry" ? "Retry" : "Cancel job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
