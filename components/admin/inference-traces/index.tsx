"use client";

/**
 * Observability — §4 A6 of nextstespsAI/21-admin-platform.md. The audit trail got
 * a surface; trace_spans did not. This answers "which model is slow", "what is
 * failing and why", and "are guardrails blocking real traffic".
 *
 * It states its own instrumentation gaps (TTFT barely recorded, spans are flat,
 * A/B columns unused) rather than rendering a confident-looking empty chart.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, Gauge, Info, RefreshCw, ShieldAlert, Timer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import { humanLatency, type Bucket, type CountBucket, type TraceSummary } from "@/lib/admin/traces-ops";

interface SlowSpan {
  id: string;
  trace_id: string | null;
  name: string | null;
  model_id: string | null;
  org: string | null;
  status: string | null;
  latency_ms: number | null;
  guardrail_action: string | null;
  created_at: string | null;
}

interface Payload {
  window: { days: number; org: string | null; spans: number; total: number | null; truncated: boolean };
  caveats: {
    ttft_coverage_pct: number;
    ttft_usable: boolean;
    spans_are_flat: boolean;
    experiments_unused: boolean;
  };
  summary: TraceSummary;
  by_modality: Bucket[];
  by_model: Bucket[];
  by_org: Bucket[];
  errors: CountBucket[];
  guardrails: CountBucket[];
  slowest: SlowSpan[];
}

const errTone = (pct: number) => (pct >= 10 ? "text-red-400" : pct >= 2 ? "text-amber-400" : "text-neutral-400");

function BucketTable({
  buckets,
  label,
  onPick,
}: {
  buckets: Bucket[];
  label: string;
  /** When given, each row becomes a filter control. */
  onPick?: (key: string) => void;
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
        No spans in this window.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead className="min-w-[200px]">{label}</TableHead>
            <TableHead className="text-right">Spans</TableHead>
            <TableHead className="text-right">Errors</TableHead>
            <TableHead className="text-right">p50</TableHead>
            <TableHead className="text-right">p95</TableHead>
            <TableHead className="text-right">p99</TableHead>
            <TableHead className="text-right">Max</TableHead>
            <TableHead className="text-right">Guardrail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.map((b) => (
            <TableRow key={b.key} className="border-white/5 hover:bg-white/[0.03]">
              <TableCell className="break-all font-mono text-xs">
              {onPick ? (
                <button type="button" className="text-left text-purple-200 underline-offset-2 hover:underline" onClick={() => onPick(b.key)} title="Filter to this customer">
                  {b.label}
                </button>
              ) : (
                b.label
              )}
            </TableCell>
              <TableCell className="text-right tabular-nums">{b.spans}</TableCell>
              <TableCell className="text-right tabular-nums">
                {b.errors === 0 ? (
                  <span className="text-neutral-600">0</span>
                ) : (
                  <span className={errTone(b.error_rate_pct)}>
                    {b.errors} ({b.error_rate_pct.toFixed(0)}%)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-neutral-400">{humanLatency(b.latency.p50)}</TableCell>
              <TableCell className="text-right tabular-nums">{humanLatency(b.latency.p95)}</TableCell>
              <TableCell className="text-right tabular-nums text-neutral-400">{humanLatency(b.latency.p99)}</TableCell>
              <TableCell className="text-right tabular-nums text-neutral-500">{humanLatency(b.latency.max)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {b.guardrail_hits === 0 ? (
                  <span className="text-neutral-600">0</span>
                ) : (
                  <span className="text-amber-400">{b.guardrail_hits}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function InferenceTracesAdmin() {
  const params = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("7");
  // Seeded from the URL so a link from another admin page lands on ONE customer.
  // The API already supported ?org= — until now nothing could send it.
  const [org, setOrg] = useState<string>(params.get("org") ?? "all");

  const load = useCallback(async (windowDays: string, orgId: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days: windowDays });
      if (orgId && orgId !== "all") qs.set("org", orgId);
      const res = await api.get(`/admin/inference/traces?${qs.toString()}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load traces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days, org);
  }, [load, days, org]);

  const s = data?.summary;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <Gauge className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Observability</h1>
            <p className="mt-0.5 text-sm text-neutral-400">Latency, failures and guardrail outcomes per request</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Customer filter — the whole point of the by-customer view is being able
              to isolate one. Options come from whoever actually has traffic. */}
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger className="h-9 w-[190px] border-white/10 bg-black/40">
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {(data?.by_org ?? []).map((b) => (
                <SelectItem key={b.key} value={b.key}>
                  {b.label} ({b.spans})
                </SelectItem>
              ))}
              {/* A deep link may name an org with no traffic in this window; keep it
                  selectable rather than silently resetting to All. */}
              {org !== "all" && !(data?.by_org ?? []).some((b) => b.key === org) && (
                <SelectItem value={org}>{org.slice(0, 8)} (no traffic in window)</SelectItem>
              )}
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
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load(days, org)} disabled={loading}>
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
          <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data || !s ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load traces.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Requests</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.spans.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {s.models} model(s), {s.orgs} org(s)
                  </p>
                </div>
                <div className="rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-2 text-blue-400">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Error rate</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", errTone(s.error_rate_pct))}>
                    {s.error_rate_pct.toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{s.errors} failed request(s)</p>
                </div>
                <div
                  className={cn(
                    "rounded-lg border bg-gradient-to-br p-2",
                    s.error_rate_pct >= 10
                      ? "border-red-500/30 from-red-500/20 to-orange-500/20 text-red-400"
                      : "border-white/10 from-neutral-500/20 to-neutral-600/20 text-neutral-400"
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Latency p95</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{humanLatency(s.latency.p95)}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    p50 {humanLatency(s.latency.p50)} · max {humanLatency(s.latency.max)}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-yellow-500/20 p-2 text-amber-400">
                  <Timer className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-400">Guardrail actions</p>
                  <p className={cn("mt-1 text-2xl font-semibold tabular-nums", s.guardrail_hits > 0 ? "text-amber-400" : "text-white")}>
                    {s.guardrail_hits}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{s.guardrail_blocked} blocked outright</p>
                </div>
                <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2 text-purple-400">
                  <ShieldAlert className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {/* What this data cannot tell you. Stated up front so nobody reads a
              missing signal as a healthy one. */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 backdrop-blur-xl">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <div className="space-y-1 text-sm text-blue-100">
              <p>Limits of the current instrumentation, measured over this window:</p>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-blue-200/85">
                {!data.caveats.ttft_usable && (
                  <li>
                    <strong>Time-to-first-token is recorded on {data.caveats.ttft_coverage_pct.toFixed(2)}%</strong> of
                    requests, so no TTFT percentile is shown — one sample is not a statistic.
                  </li>
                )}
                {data.caveats.spans_are_flat && (
                  <li>
                    Every span is a root span, so these are <strong>per-request records, not call trees</strong> — there
                    is no per-stage breakdown to drill into.
                  </li>
                )}
                {data.caveats.experiments_unused && (
                  <li>
                    The A/B columns (<code>arm</code>, <code>experiment_id</code>) exist but nothing writes them, so no
                    experiment comparison is possible.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {data.window.truncated && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">
                Showing {data.window.spans.toLocaleString()} of {data.window.total?.toLocaleString()} spans — the
                percentiles below cover only that slice, so treat them as indicative rather than exact. Narrow the
                window for precise figures.
              </p>
            </div>
          )}

          <Tabs defaultValue="modality" className="space-y-4">
            <TabsList className="border border-white/10 bg-black/40 p-1">
              <TabsTrigger value="modality" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                By modality ({data.by_modality.length})
              </TabsTrigger>
              <TabsTrigger value="model" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                By model ({data.by_model.length})
              </TabsTrigger>
              <TabsTrigger value="org" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                By customer ({data.by_org.length})
              </TabsTrigger>
              <TabsTrigger value="failures" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Failures ({data.errors.length})
              </TabsTrigger>
              <TabsTrigger value="slowest" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Slowest ({data.slowest.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="modality">
              <BucketTable buckets={data.by_modality} label="Modality" />
            </TabsContent>
            <TabsContent value="model">
              <BucketTable buckets={data.by_model} label="Model" />
            </TabsContent>
            <TabsContent value="org">
              <BucketTable buckets={data.by_org} label="Customer" onPick={setOrg} />
            </TabsContent>

            <TabsContent value="failures">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
                  <p className="border-b border-white/10 px-4 py-3 text-sm text-white">Failure reasons</p>
                  {data.errors.length === 0 ? (
                    <p className="p-6 text-center text-sm text-neutral-400">No failures in this window.</p>
                  ) : (
                    <Table>
                      <TableBody>
                        {data.errors.map((e) => (
                          <TableRow key={e.key} className="border-white/5">
                            <TableCell className="font-mono text-xs text-red-300">{e.key}</TableCell>
                            <TableCell className="text-right tabular-nums">{e.count}</TableCell>
                            <TableCell className="text-right tabular-nums text-neutral-500">
                              {e.share_pct.toFixed(0)}% of failures
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
                  <p className="border-b border-white/10 px-4 py-3 text-sm text-white">Guardrail outcomes</p>
                  <Table>
                    <TableBody>
                      {data.guardrails.map((g) => (
                        <TableRow key={g.key} className="border-white/5">
                          <TableCell className="font-mono text-xs">
                            <span className={g.key === "clean" ? "text-neutral-400" : "text-amber-300"}>{g.key}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                          <TableCell className="text-right tabular-nums text-neutral-500">
                            {g.share_pct.toFixed(1)}% of traffic
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="slowest">
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
                <Table>
                  <TableHeader className="[&_tr]:border-white/10">
                    <TableRow>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead>Modality</TableHead>
                      <TableHead className="min-w-[200px]">Model</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slowest.map((x) => (
                      <TableRow key={x.id} className="border-white/5 hover:bg-white/[0.03]">
                        <TableCell className="text-right font-semibold tabular-nums text-amber-400">
                          {humanLatency(x.latency_ms)}
                        </TableCell>
                        <TableCell className="text-xs text-neutral-400">
                          {(x.name ?? "—").replace(/^gen_ai\./, "")}
                        </TableCell>
                        <TableCell className="break-all font-mono text-xs">{x.model_id ?? "—"}</TableCell>
                        <TableCell className="text-xs text-neutral-400">{x.org ?? "—"}</TableCell>
                        <TableCell>
                          {x.status && x.status !== "success" ? (
                            <Badge variant="outline" className="border-red-500/30 text-[10px] text-red-300">
                              {x.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-neutral-500">success</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-neutral-500">
                          {x.created_at ? new Date(x.created_at).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-neutral-500">
            {data.window.spans.toLocaleString()} request(s) over the last {data.window.days} day(s)
            {data.window.org ? " for one customer" : " across all customers"}. Percentiles are nearest-rank, so every
            figure is a latency some request actually experienced.
            {data.window.org && (
              <>
                {" "}
                <button type="button" className="text-purple-300 underline-offset-2 hover:underline" onClick={() => setOrg("all")}>
                  Show all customers
                </button>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
