"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, DollarSign, Percent, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import type { UsageBucket, UsageSummary, ErrorBucket } from "@/lib/admin/inference-usage";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

interface Payload {
  window: { days: number; rows: number; limit: number; truncated: boolean };
  summary: UsageSummary;
  by_day: UsageBucket[];
  by_model: UsageBucket[];
  by_modality: UsageBucket[];
  by_org: Array<UsageBucket & { label: string }>;
  errors: ErrorBucket[];
}

/** Daily revenue as a bar strip — enough to see a trend without a chart library. */
function DayStrip({ days }: { days: UsageBucket[] }) {
  if (days.length === 0) return null;
  const max = Math.max(...days.map((d) => d.revenue_cents), 1);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-white">Revenue by day</p>
        <p className="text-xs text-neutral-500">{days.length} day(s) with traffic</p>
      </div>
      <div className="flex h-28 items-end gap-1">
        {days.map((day) => (
          <div
            key={day.key}
            className="group relative flex-1 rounded-t bg-gradient-to-t from-purple-600/40 to-purple-400/70 transition-colors hover:from-purple-500/60 hover:to-purple-300"
            style={{ height: `${Math.max((day.revenue_cents / max) * 100, 2)}%` }}
            title={`${day.key} · ${money(day.revenue_cents)} · ${day.requests} requests · ${day.error_rate_pct.toFixed(0)}% errors`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
        <span>{days[0]?.key}</span>
        <span>{days[days.length - 1]?.key}</span>
      </div>
    </div>
  );
}

function BucketTable({ buckets, label }: { buckets: Array<UsageBucket & { label?: string }>; label: string }) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
        No traffic in this window.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <Table>
        <TableHeader className="[&_tr]:border-white/10">
          <TableRow>
            <TableHead className="min-w-[240px]">{label}</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Errors</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead className="text-right">Avg latency</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.map((b) => (
            <TableRow key={b.key} className="border-white/5 hover:bg-white/[0.03]">
              <TableCell className="font-mono text-xs">{b.label ?? b.key}</TableCell>
              <TableCell className="text-right tabular-nums">{b.requests}</TableCell>
              <TableCell className="text-right tabular-nums">
                {b.errors > 0 ? (
                  <span className={b.error_rate_pct >= 10 ? "text-red-400" : "text-amber-400"}>
                    {b.errors} ({b.error_rate_pct.toFixed(0)}%)
                  </span>
                ) : (
                  <span className="text-neutral-600">0</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(b.revenue_cents)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {b.margin_pct === null ? (
                  <span className="text-xs text-neutral-500">not measured</span>
                ) : (
                  <span className={b.margin_pct <= 0 ? "text-red-400" : "text-emerald-400"}>{b.margin_pct.toFixed(0)}%</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-neutral-400">
                {b.avg_latency_ms === null ? "—" : `${b.avg_latency_ms}ms`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Section A3 — the usage explorer. Built around the two questions an operator
 * asks: where is the money, and what is failing.
 */
export default function InferenceUsageAdmin() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const load = useCallback(async (windowDays: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/inference/usage?days=${windowDays}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const s = data?.summary;
  const cards = s
    ? [
        { label: "Requests", value: compact(s.requests), hint: `${data!.window.days}d window`, icon: Activity, accent: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400" },
        { label: "Revenue", value: money(s.revenue_cents), hint: "what we charged", icon: DollarSign, accent: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400" },
        {
          label: "Margin",
          value: s.margin_pct === null ? "not measured" : `${s.margin_pct.toFixed(0)}%`,
          hint: `${s.margin_coverage_pct.toFixed(0)}% of revenue has a cost basis`,
          icon: Percent,
          accent: "from-purple-500/20 to-blue-500/20 border-purple-500/30 text-purple-400",
          danger: s.margin_coverage_pct < 50,
        },
        {
          label: "Error rate",
          value: s.error_rate_pct === null ? "—" : `${s.error_rate_pct.toFixed(1)}%`,
          hint: `${s.errors} failed requests`,
          icon: AlertTriangle,
          accent: (s.error_rate_pct ?? 0) >= 5 ? "from-red-500/20 to-orange-500/20 border-red-500/30 text-red-400" : "from-neutral-500/20 to-neutral-600/20 border-white/10 text-neutral-400",
          danger: (s.error_rate_pct ?? 0) >= 5,
        },
        { label: "Avg latency", value: s.avg_latency_ms === null ? "—" : `${s.avg_latency_ms}ms`, hint: `${compact(s.input_tokens + s.output_tokens)} tokens`, icon: Timer, accent: "from-amber-500/20 to-yellow-500/20 border-amber-500/30 text-amber-400" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
            <BarChart3 className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Inference Usage</h1>
            <p className="mt-0.5 text-sm text-neutral-400">Where the money is, and what is failing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-[150px] border-white/10 bg-black/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load(days)} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data || !s ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load usage.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-neutral-400">{card.label}</p>
                      <p className={cn("mt-1 text-2xl font-semibold tabular-nums text-white", card.danger && "text-amber-400")}>
                        {card.value}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{card.hint}</p>
                    </div>
                    <div className={cn("rounded-lg border bg-gradient-to-br p-2", card.accent)}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {s.margin_coverage_pct < 100 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-100">
                Only <strong>{s.margin_coverage_pct.toFixed(0)}%</strong> of revenue in this window has a real cost
                basis. For the rest, the biller recorded upstream cost as equal to what we charged — a placeholder, not
                a measurement — so those requests are excluded from the margin figure rather than dragging it to zero.
                Coverage grows as traffic flows on models with synced upstream pricing.
              </p>
            </div>
          )}

          <DayStrip days={data.by_day} />

          <Tabs defaultValue="models" className="space-y-4">
            <TabsList className="border border-white/10 bg-black/40 p-1">
              <TabsTrigger value="models" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Models ({data.by_model.length})
              </TabsTrigger>
              <TabsTrigger value="orgs" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Customers ({data.by_org.length})
              </TabsTrigger>
              <TabsTrigger value="modality" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Modality ({data.by_modality.length})
              </TabsTrigger>
              <TabsTrigger value="errors" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Errors ({data.errors.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="models">
              <BucketTable buckets={data.by_model} label="Model" />
            </TabsContent>
            <TabsContent value="orgs">
              <BucketTable buckets={data.by_org} label="Customer" />
            </TabsContent>
            <TabsContent value="modality">
              <BucketTable buckets={data.by_modality} label="Modality" />
            </TabsContent>
            <TabsContent value="errors">
              {data.errors.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
                  No failures in this window.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
                  <Table>
                    <TableHeader className="[&_tr]:border-white/10">
                      <TableRow>
                        <TableHead>Error</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                        <TableHead>Models affected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.errors.map((e) => (
                        <TableRow key={e.code} className="border-white/5 hover:bg-white/[0.03]">
                          <TableCell className="font-mono text-xs text-red-300">{e.code}</TableCell>
                          <TableCell className="text-right tabular-nums">{e.count}</TableCell>
                          <TableCell className="text-right tabular-nums text-neutral-400">{e.share_pct.toFixed(0)}%</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {e.models.slice(0, 4).map((m) => (
                                <Badge key={m} variant="outline" className="border-white/15 text-[10px]">
                                  {m}
                                </Badge>
                              ))}
                              {e.models.length > 4 && (
                                <span className="text-xs text-neutral-500">+{e.models.length - 4} more</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <p className="text-xs text-neutral-500">
            {data.window.rows} request(s) in the last {data.window.days} days
            {data.window.truncated && ` · capped at ${data.window.limit}, older rows in this window are not included`}
          </p>
        </>
      )}
    </div>
  );
}
