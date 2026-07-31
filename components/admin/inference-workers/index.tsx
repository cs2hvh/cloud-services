"use client";

/**
 * Worker fleet — "is each worker running, and is work moving?"
 *
 * Resolved ON DEMAND: once when the page opens, and whenever Refresh is pressed.
 * Nothing polls in the background. See nextstespsAI/21-admin-platform.md §8 for
 * why a continuous check-in table was rejected.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  HelpCircle,
  Info,
  RefreshCw,
  Server,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import type { FleetStatus, FleetSummary, FleetVerdict } from "@/lib/admin/fleet";
import {
  DOT_CLASS,
  STATUS,
  TONE_CLASS,
  humanMs,
  humanSince,
  needsAttention,
  probeVantageWarning,
  unconfirmedCount,
  unknownMeaning,
  vantageSuspect,
} from "./status";

interface RunnerRow extends FleetVerdict {
  label: string;
  purpose: string;
  source: string | null;
  has_heartbeat: boolean;
  /** False when the runner has no /health service at all (e.g. media). */
  probeable: boolean;
  read_error: string | null;
  last_job_activity: string | null;
}

interface Payload {
  probing: {
    enabled: boolean;
    /** RUNNER_HEALTH_PROBE=on — every load probes, so no button is needed. */
    default_on: boolean;
    /** This response came from a one-off ?probe=1. */
    forced: boolean;
    reason: string | null;
    force_param: string;
  };
  window_hours: number;
  stuck_after_minutes: number;
  summary: FleetSummary;
  runners: RunnerRow[];
}

function StatusBadge({ status }: { status: FleetStatus }) {
  const p = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASS[p.tone]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[p.tone])} />
      {p.label}
    </span>
  );
}

/** A count that only renders when non-zero — zeros are noise in a queue column. */
function Count({ n, tone }: { n: number; tone?: "warn" | "bad" }) {
  if (n === 0) return <span className="text-neutral-600">0</span>;
  return (
    <span className={cn("tabular-nums", tone === "bad" && "text-red-400", tone === "warn" && "text-amber-400")}>
      {n}
    </span>
  );
}

function RunnerDetail({
  row,
  stuckAfter,
  windowHours,
  probingEnabled,
}: {
  row: RunnerRow;
  stuckAfter: number;
  windowHours: number;
  probingEnabled: boolean;
}) {
  const p = STATUS[row.status];
  // "Not checked" has two different causes and the static text only fits one.
  const meaning = row.status === "unknown" ? unknownMeaning(row.probeable, probingEnabled) : p.meaning;
  return (
    <div className="space-y-3 border-t border-white/5 bg-black/20 px-4 py-4 text-sm">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-neutral-500">What this means</p>
          <p className="mt-0.5 max-w-xl text-neutral-300">{meaning}</p>
        </div>
        {p.action && (
          <div>
            <p className="text-xs text-neutral-500">What to do</p>
            <p className="mt-0.5 max-w-xl text-amber-200">{p.action}</p>
          </div>
        )}
      </div>

      <div className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-neutral-500">Reads from</span>
          <p className="mt-0.5 break-all font-mono text-neutral-300">{row.source ?? "—"}</p>
        </div>
        <div>
          <span className="text-neutral-500">Last job activity</span>
          <p className="mt-0.5 text-neutral-300">{humanSince(row.last_job_activity, Date.now())}</p>
        </div>
        <div>
          <span className="text-neutral-500">Completed / failed ({windowHours}h)</span>
          <p className="mt-0.5 text-neutral-300">
            {row.completed_recent} / <span className={row.failed_recent > 0 ? "text-red-400" : ""}>{row.failed_recent}</span>
          </p>
        </div>
        <div>
          <span className="text-neutral-500">Stuck threshold</span>
          <p className="mt-0.5 text-neutral-300">
            {row.has_heartbeat ? `heartbeat older than ${stuckAfter} min` : "no heartbeat column — cannot detect stuck"}
          </p>
        </div>
      </div>

      {/* Probe telemetry only when we actually probed — otherwise the row would
          imply we checked and found nothing. */}
      {row.reachable && (
        <div className="grid gap-x-8 gap-y-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs sm:grid-cols-4">
          <div>
            <span className="text-neutral-500">Health response</span>
            <p className="mt-0.5 text-emerald-300">{humanMs(row.latency_ms)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Ready</span>
            <p className="mt-0.5 text-neutral-300">{row.ready === null ? "—" : row.ready ? "yes" : "no"}</p>
          </div>
          <div>
            <span className="text-neutral-500">Claimer last polled</span>
            <p className="mt-0.5 text-neutral-300">{humanMs(row.claim_tick_ms_ago)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Worker last active</span>
            <p className="mt-0.5 text-neutral-300">{humanMs(row.worker_idle_ms_ago)}</p>
          </div>
        </div>
      )}

      {row.read_error && (
        <p className="break-all rounded-lg border border-red-500/30 bg-red-500/10 p-2 font-mono text-xs text-red-300">
          Could not read {row.source}: {row.read_error}
        </p>
      )}
    </div>
  );
}

export default function InferenceWorkersAdmin() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async (forceProbe: boolean) => {
    setLoading(true);
    if (forceProbe) setProbing(true);
    try {
      const res = await api.get(`/admin/inference/workers${forceProbe ? "?probe=1" : ""}`);
      setData(res.data);
      setCheckedAt(new Date());
    } catch {
      toast.error("Failed to check the fleet");
    } finally {
      setLoading(false);
      setProbing(false);
    }
  }, []);

  // Checks once on open, then only when asked. No interval.
  useEffect(() => {
    void load(false);
  }, [load]);

  const s = data?.summary;
  const statuses = data?.runners.map((r) => r.status) ?? [];
  const vantage = data ? probeVantageWarning(statuses, data.probing.enabled) : null;
  // Rows to act on, with unreachable ones dropped when the probe run is
  // vantage-suspect — otherwise the card contradicts the banner above it.
  const suspect = data ? vantageSuspect(statuses, data.probing.enabled) : false;
  const attention =
    data?.runners.filter(
      (r) => needsAttention(r.status) && !(suspect && (r.status === "down" || r.status === "not_deployed"))
    ) ?? [];
  const unconfirmed = data ? unconfirmedCount(statuses, data.probing.enabled) : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <Server className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Worker Fleet</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              Is each worker running, and is its work moving?
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {checkedAt && (
            <span className="text-xs text-neutral-500">
              checked {checkedAt.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-white/10"
            onClick={() => void load(false)}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && !probing && "animate-spin")} />
            Refresh
          </Button>
          {/* Only offer a manual probe when the server does NOT probe on every
              load. With RUNNER_HEALTH_PROBE=on the button would be a no-op. */}
          {data && !data.probing.default_on && (
            <Button
              variant="outline"
              size="sm"
              className="border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"
              onClick={() => void load(true)}
              disabled={loading}
              title="Call each runner's /health once. Only reachable from inside the cluster."
            >
              <Radio className={cn("mr-1.5 h-3.5 w-3.5", probing && "animate-pulse")} />
              {probing ? "Probing…" : data.probing.forced ? "Probe again" : "Probe health"}
            </Button>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data || !s ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not check the fleet.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Needs attention</p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-semibold tabular-nums",
                      attention.length > 0 ? "text-red-400" : suspect ? "text-neutral-300" : "text-emerald-400"
                    )}
                  >
                    {attention.length}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {attention.length > 0
                      ? attention.map((r) => r.label).join(", ")
                      : suspect
                        // Don't say a flat "nothing to act on" under red rows — it
                        // reads as "all fine" when the truth is "we can't tell".
                        ? "nothing confirmed to act on — see the note below"
                        : "nothing to act on"}
                  </p>
                </div>
                {/* Zero-to-act-on is only GOOD news if we could actually see the
                    fleet. Under a vantage-suspect probe it means "we don't know",
                    so stay neutral rather than flashing all-clear. */}
                <div
                  className={cn(
                    "rounded-lg border bg-gradient-to-br p-2",
                    attention.length > 0
                      ? "border-red-500/30 from-red-500/20 to-orange-500/20 text-red-400"
                      : suspect
                        ? "border-white/15 from-neutral-500/20 to-neutral-600/20 text-neutral-400"
                        : "border-emerald-500/30 from-emerald-500/20 to-green-500/20 text-emerald-400"
                  )}
                >
                  {attention.length > 0 ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : suspect ? (
                    <HelpCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Stuck jobs</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", s.total_stuck > 0 ? "text-red-400" : "text-white")}>
                    {s.total_stuck}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">claimed then abandoned</p>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-gradient-to-br from-red-500/20 to-orange-500/20 p-2 text-red-400">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Queued</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.total_queued}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">waiting to be claimed</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-yellow-500/20 p-2 text-amber-400">
                  <Server className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Confirmed healthy</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {s.healthy}
                    <span className="text-base font-normal text-neutral-500"> / {s.services}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {unconfirmed > 0 ? `${unconfirmed} cannot be confirmed` : "all accounted for"}
                  </p>
                </div>
                {/* A green tick beside "0 / 6" would read as all-clear when the
                    truth is that nothing was confirmed. Green only when some
                    runner actually answered. */}
                <div
                  className={cn(
                    "rounded-lg border bg-gradient-to-br p-2",
                    s.healthy > 0
                      ? "border-emerald-500/30 from-emerald-500/20 to-green-500/20 text-emerald-400"
                      : "border-white/15 from-neutral-500/20 to-neutral-600/20 text-neutral-400"
                  )}
                >
                  {s.healthy > 0 ? <CheckCircle2 className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                </div>
              </div>
            </div>
          </div>

          {/* Says why some rows cannot be judged, so "Not checked" is never
              mistaken for a fault. */}
          {!data.probing.enabled && data.probing.reason && (
            <div className="flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 backdrop-blur-xl">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <p className="text-sm text-blue-100">{data.probing.reason}</p>
            </div>
          )}

          {/* A probe from outside the cluster reports most of the fleet as Down.
              Never let that read as an outage. */}
          {vantage && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">{vantage}</p>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="[&_tr]:border-white/10">
                  <TableRow>
                    <TableHead className="min-w-[170px]">Worker</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                    <TableHead className="text-right">Queued</TableHead>
                    <TableHead className="text-right">In flight</TableHead>
                    <TableHead className="text-right">Stuck</TableHead>
                    {/* The window must stay in the header — "0 / 0" means nothing
                        without knowing it covers 24h. */}
                    <TableHead className="whitespace-nowrap text-right">
                      Done / failed <span className="text-neutral-500">{data.window_hours}h</span>
                    </TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.runners.map((row) => {
                    const isOpen = open === row.service;
                    return (
                      // The key belongs on the Fragment, not the inner rows: the
                      // table is sorted by urgency and re-sorts on every refresh,
                      // so an unkeyed fragment lets React reuse the wrong row and
                      // the expanded detail can end up under a different worker.
                      <Fragment key={row.service}>
                        {/* Keyboard-operable, not just clickable: a row carrying the
                            only route to the detail panel must be reachable by Tab
                            and openable with Enter/Space, or keyboard and
                            screen-reader users cannot see any of it. */}
                        <TableRow
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          aria-label={`${row.label}: ${STATUS[row.status].label}. Activate for details.`}
                          className="cursor-pointer border-white/5 hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-purple-400/60"
                          onClick={() => setOpen(isOpen ? null : row.service)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault(); // Space would scroll the page
                              setOpen(isOpen ? null : row.service);
                            }
                          }}
                        >
                          <TableCell>
                            <p className="font-medium text-white">{row.label}</p>
                            <p className="mt-0.5 text-xs text-neutral-500">{row.purpose}</p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Count n={row.queued} tone="warn" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Count n={row.in_flight} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Count n={row.stuck} tone="bad" />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-neutral-400">
                            {row.completed_recent} /{" "}
                            <span className={row.failed_recent > 0 ? "text-red-400" : ""}>{row.failed_recent}</span>
                          </TableCell>
                          <TableCell className="text-xs text-neutral-400">
                            {/* Bounded and breakable so a long reason wraps rather
                                than widening the table. The not_deployed detail
                                embeds a 68-char cluster URL as one unbreakable
                                token, which would otherwise force horizontal
                                scrolling on its own. */}
                            <span className="block max-w-[260px] whitespace-normal break-words">{row.detail}</span>
                          </TableCell>
                          <TableCell>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-neutral-500 transition-transform",
                                isOpen && "rotate-180"
                              )}
                            />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="border-white/5 hover:bg-transparent">
                            <TableCell colSpan={8} className="p-0">
                              <RunnerDetail
                                row={row}
                                stuckAfter={data.stuck_after_minutes}
                                windowHours={data.window_hours}
                                probingEnabled={data.probing.enabled}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" />
              Click a row for what it means and what to do
            </span>
            {(Object.keys(STATUS) as FleetStatus[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[STATUS[k].tone])} />
                {STATUS[k].label}
              </span>
            ))}
          </div>

          <p className="text-xs text-neutral-500">
            Checked when this page opened, not polled in the background. A job counts as stuck when its
            heartbeat is older than {data.stuck_after_minutes} minutes.
            {/* default_on and forced are independent: probing can be on by env AND
                this response can be a forced one-off. Reporting "not enabled by
                default" from client state alone got this wrong. */}
            {data.probing.default_on
              ? " Health probing is enabled for this environment, so every load probes."
              : data.probing.forced
                ? " Health was probed once for this check; it is not enabled by default."
                : null}
          </p>

          {s.total_stuck > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">
                <strong>{s.total_stuck} job(s) are stuck</strong> — claimed by a worker that then stopped touching
                them. They will not finish on their own and no screen can currently clear them; reaping still needs
                SQL or <Badge variant="outline" className="border-white/15 font-mono text-[10px]">kubectl</Badge>.
                Retry / cancel / force-reap actions are the next piece of this section.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
