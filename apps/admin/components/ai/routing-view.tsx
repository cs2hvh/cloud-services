"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cpu, RefreshCw, Route as RouteIcon, Server, Zap } from "lucide-react";
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

type Provider = {
  name: string;
  traffic: {
    requests: number;
    errors: number;
    errorRatePct: number;
    revenueUsd: number;
    upstreamUsd: number;
    marginUsd: number;
    avgLatencyMs: number | null;
  } | null;
  models: { total: number; active: number } | null;
  routes: {
    total: number;
    enabled: number;
    present: number;
    available: number;
  } | null;
};

type Feed = {
  days: number;
  truncated: boolean;
  attribution: {
    basis: string;
    unmappedRequests: number;
    mislabeledRequests: number;
    totalRequests: number;
    recordedProviders: string[];
  };
  providers: Provider[];
  servingTypes: { type: string; count: number }[];
  runpod: {
    finetuneJobs: number;
    finetuneJobsWithRunpodId: number;
    trainingSpendUsd: number;
    gpuSkus: { sku: string; count: number }[];
    livePods: number;
    deployments: number;
    activeDeployments: number;
    pods: {
      id: string;
      name: string;
      org: string;
      state: string | null;
      gpu: string | null;
      hourlyUsd: number | null;
      startedAt: string | null;
      autoStopAt: string | null;
    }[];
    recentJobs: {
      id: string;
      name: string;
      org: string;
      baseModel: string | null;
      status: string;
      gpu: string | null;
      runpodJobId: string | null;
      costUsd: number;
      trainingSeconds: number | null;
      createdAt: string;
    }[];
    deploymentRows: {
      id: string;
      name: string;
      org: string;
      status: string;
      gpu: string | null;
      endpointId: string | null;
      lastMeteredAt: string | null;
    }[];
  };
};

const money = (n: number, p = 2) => `$${n.toFixed(p)}`;
const dur = (s: number | null) =>
  s === null ? "—" : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`;

function jobTone(status: string) {
  if (status === "completed")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "running" || status === "preparing" || status === "queued")
    return "border-[#3987e5]/40 bg-[#3987e5]/10 text-[#82adfb]";
  return "border-white/[0.12] bg-white/[0.04] text-white/50";
}

export function AiRoutingView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/routing", { params: { days } });
      setFeed(res.data);
      setError(null);
    } catch {
      setError("Could not load provider routing");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const rp = feed?.runpod;

  return (
    <div>
      <PageHeader
        title="Providers & GPU"
        description="Where inference is configured to run, where it actually ran, and the GPU footprint behind it."
        actions={
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-9 w-[130px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
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

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Upstream providers"
          value={feed ? feed.providers.length : "—"}
          hint={
            feed
              ? feed.providers
                  .filter((p) => (p.traffic?.requests ?? 0) > 0)
                  .map((p) => p.name)
                  .join(", ") || "none carried traffic"
              : undefined
          }
          icon={RouteIcon}
        />
        <StatCard
          label="Fine-tune jobs"
          value={rp ? rp.finetuneJobs : "—"}
          hint={rp ? `${rp.finetuneJobsWithRunpodId} ran on RunPod` : undefined}
          icon={Cpu}
        />
        <StatCard
          label="Live serving pods"
          value={rp ? rp.livePods : "—"}
          hint={rp ? `${rp.activeDeployments} active deployments` : undefined}
          icon={Server}
          tone={rp && rp.livePods > 0 ? "good" : undefined}
        />
        <StatCard
          label="Training spend"
          value={rp ? money(rp.trainingSpendUsd) : "—"}
          hint="all fine-tune jobs on record"
          icon={Zap}
        />
      </div>

      {/* Providers */}
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Upstream providers
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Requests are attributed by the model catalog — which upstream each
            model_id belongs to — not by the provider stamped on the usage row.
          </p>
        </div>
        {feed && feed.attribution.mislabeledRequests > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {feed.attribution.mislabeledRequests.toLocaleString()} of{" "}
              {feed.attribution.totalRequests.toLocaleString()} usage rows record a
              provider that does not match the model&apos;s catalog entry
              {feed.attribution.recordedProviders.length === 1 && (
                <> — every row is stamped &ldquo;{feed.attribution.recordedProviders[0]}&rdquo;</>
              )}
              . The table below attributes by catalog; the stamped column is a
              gateway-side bug and should not be used for billing attribution
              until it is fixed.
              {feed.attribution.unmappedRequests > 0 && (
                <>
                  {" "}
                  A further {feed.attribution.unmappedRequests.toLocaleString()} rows
                  name a model that is not in the catalog at all.
                </>
              )}
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Provider</th>
                <th className="px-4 py-2.5 font-semibold">Models</th>
                <th className="px-4 py-2.5 font-semibold">Routes</th>
                <th className="px-4 py-2.5 text-right font-semibold">Requests</th>
                <th className="px-4 py-2.5 text-right font-semibold">Errors</th>
                <th className="px-4 py-2.5 text-right font-semibold">Avg latency</th>
                <th className="px-4 py-2.5 text-right font-semibold">Billed</th>
                <th className="px-4 py-2.5 text-right font-semibold">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(feed?.providers ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No providers configured."}
                  </td>
                </tr>
              ) : (
                (feed?.providers ?? []).map((p) => (
                  <tr key={p.name} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{p.name}</span>
                      {/* Active models with no enabled route and no traffic
                          means the catalog advertises what the gateway
                          cannot currently serve — worth saying on the row. */}
                      {(p.models?.active ?? 0) > 0 &&
                        (p.routes?.enabled ?? 0) === 0 &&
                        (p.traffic?.requests ?? 0) === 0 && (
                          <span className="ml-2 inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                            {p.models?.active} models listed · never served
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {p.models ? `${p.models.active} active / ${p.models.total}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {p.routes
                        ? `${p.routes.enabled} on / ${p.routes.total}${
                            p.routes.available < p.routes.total
                              ? ` · ${p.routes.available} available upstream`
                              : ""
                          }`
                        : "—"}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {p.traffic ? p.traffic.requests.toLocaleString() : "0"}
                    </td>
                    <td
                      className={`${MONO} px-4 py-2.5 text-right text-[12px] ${
                        (p.traffic?.errors ?? 0) > 0 ? "text-red-300" : "text-muted-foreground"
                      }`}
                    >
                      {p.traffic
                        ? `${p.traffic.errors} (${p.traffic.errorRatePct.toFixed(1)}%)`
                        : "—"}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px] text-muted-foreground`}>
                      {p.traffic?.avgLatencyMs ? `${p.traffic.avgLatencyMs}ms` : "—"}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {p.traffic ? money(p.traffic.revenueUsd) : "—"}
                    </td>
                    <td
                      className={`${MONO} px-4 py-2.5 text-right text-[12px] ${
                        (p.traffic?.marginUsd ?? 0) < 0 ? "text-red-300" : "text-muted-foreground"
                      }`}
                    >
                      {p.traffic ? money(p.traffic.marginUsd) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {feed && feed.servingTypes.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {feed.servingTypes.map((s) => (
              <span
                key={s.type}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {s.type}
                <span className="ml-1.5 text-foreground">{s.count}</span>
              </span>
            ))}
            {(rp?.gpuSkus ?? []).map((g) => (
              <span
                key={g.sku}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {g.sku}
                <span className="ml-1.5 text-foreground">{g.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Live pods + deployments */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-semibold tracking-tight">
              Live serving pods
            </h2>
          </div>
          <div className="p-4">
            {(rp?.pods.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                No serving pod is running. Fine-tunes serve on demand; a pod
                appears here between start and auto-stop.
              </p>
            ) : (
              <div className="space-y-2">
                {rp?.pods.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[12px]"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.org} · {p.gpu ?? "gpu ?"} · {p.state}
                      </div>
                    </div>
                    <div className={`${MONO} text-right text-[11.5px]`}>
                      {p.hourlyUsd !== null ? `${money(p.hourlyUsd)}/hr` : "—"}
                      {p.autoStopAt && (
                        <div className="text-muted-foreground">
                          stops {p.autoStopAt.slice(5, 16).replace("T", " ")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-semibold tracking-tight">
              Deployments
            </h2>
          </div>
          <div className="p-4">
            {(rp?.deploymentRows.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                No always-on deployments exist. Models are served through the
                proxy providers above.
              </p>
            ) : (
              <div className="space-y-2">
                {rp?.deploymentRows.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[12px]"
                  >
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {d.org} · {d.gpu ?? "gpu ?"} · {d.endpointId ?? "no endpoint"}
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{d.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fine-tune jobs */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Recent fine-tune jobs
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Job</th>
                <th className="px-4 py-2.5 font-semibold">Org</th>
                <th className="px-4 py-2.5 font-semibold">Base model</th>
                <th className="px-4 py-2.5 font-semibold">GPU</th>
                <th className="px-4 py-2.5 font-semibold">RunPod job</th>
                <th className="px-4 py-2.5 text-right font-semibold">Trained</th>
                <th className="px-4 py-2.5 text-right font-semibold">Cost</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(rp?.recentJobs.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No fine-tune jobs on record."}
                  </td>
                </tr>
              ) : (
                rp?.recentJobs.map((j) => (
                  <tr key={j.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="max-w-[200px] truncate px-4 py-2.5 font-medium">
                      {j.name}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {j.org}
                    </td>
                    <td className={`${MONO} max-w-[180px] truncate px-4 py-2.5 text-[11.5px] text-muted-foreground`}>
                      {j.baseModel ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {j.gpu ?? "—"}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-[11.5px] text-muted-foreground`}>
                      {j.runpodJobId ? `${j.runpodJobId.slice(0, 10)}…` : "—"}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px] text-muted-foreground`}>
                      {dur(j.trainingSeconds)}
                    </td>
                    <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                      {j.costUsd > 0 ? money(j.costUsd) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10.5px] ${jobTone(j.status)}`}
                      >
                        {j.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[10.5px] text-muted-foreground">
        Provider traffic covers the last {days} days
        {feed?.truncated && " (aggregate budget reached — totals are a floor)"}.
        Configured-vs-served are separate columns on purpose: the catalog says
        where a model should run, usage says where it did.
      </p>
    </div>
  );
}
