"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Server } from "lucide-react";
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

type Uptime = { probes: number; ok: number; pct: number | null };

type Endpoint = {
  endpointId: string;
  modelId: string;
  baseUrl: string;
  label: string | null;
  enabled: boolean;
  weight: number | null;
  ok: boolean;
  reason: string | null;
  reasonText: string;
  statusCode: number | null;
  latencyMs: number | null;
  checkedAt: string;
  ageSec: number;
  consecutiveFailures: number;
  lastOkAt: string | null;
  lastFailAt: string | null;
  error: string | null;
  servedIds: string[];
  expectedName: string | null;
  nameMismatch: boolean;
  uptime: { h24: Uptime; d7: Uptime };
  failures: { at: string; reason: string }[];
  failuresTruncated: boolean;
};

type ModelGroup = {
  modelId: string;
  modelActive: boolean;
  status: "healthy" | "degraded" | "down" | "no_enabled_endpoint" | "parked";
  enabledEndpoints: number;
  okEndpoints: number;
  stagedEndpoints: number;
  endpoints: Endpoint[];
};

type Feed = {
  windowHours: number;
  probe: {
    lastCheckedAt: string | null;
    ageSec: number | null;
    staleAfterSec: number;
    stale: boolean;
  };
  totals: {
    endpoints: number;
    enabled: number;
    up: number;
    parkedEndpoints: number;
    modelsDown: number;
    modelsDegraded: number;
    modelsParked: number;
  };
  alerts: { endpointId: string; modelId: string; label: string | null; text: string }[];
  models: ModelGroup[];
};

const ago = (sec: number | null) => {
  if (sec === null) return "never";
  if (sec < 90) return `${sec}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)}m ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
};
const agoFrom = (iso: string | null) =>
  iso === null ? "never" : ago(Math.round((Date.now() - Date.parse(iso)) / 1000));

const MODEL_STATUS: Record<
  ModelGroup["status"],
  { label: string; cls: string }
> = {
  healthy: {
    label: "healthy",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  degraded: {
    label: "degraded",
    cls: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  },
  down: { label: "DOWN", cls: "border-red-500/60 bg-red-500/15 text-red-300" },
  no_enabled_endpoint: {
    label: "no enabled pod",
    cls: "border-red-500/60 bg-red-500/15 text-red-300",
  },
  // Delisted in the catalog: unroutable, so its pods cannot be failing
  // anyone. Grey, never red — a parked model that shouts DOWN forever is
  // how operators learn to ignore red.
  parked: {
    label: "delisted",
    cls: "border-white/[0.15] bg-white/[0.04] text-white/50",
  },
};

/** 24h strip: one cell per 30 minutes, red where a probe failed. */
function UptimeStrip({ ep, hours }: { ep: Endpoint; hours: number }) {
  const buckets = 48;
  const now = Date.now();
  const span = hours * 3600 * 1000;
  const failed = new Set<number>();
  for (const f of ep.failures) {
    const idx = Math.floor(((Date.parse(f.at) - (now - span)) / span) * buckets);
    if (idx >= 0 && idx < buckets) failed.add(idx);
  }
  const covered = ep.uptime.h24.probes > 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-3 flex-1 gap-[1px] overflow-hidden rounded-sm">
        {Array.from({ length: buckets }, (_, i) => (
          <span
            key={i}
            className={`flex-1 ${
              !covered
                ? "bg-white/[0.06]"
                : failed.has(i)
                  ? "bg-red-500/70"
                  : "bg-emerald-500/40"
            }`}
          />
        ))}
      </div>
      <span className={`${MONO} w-14 shrink-0 text-right text-[11px] text-muted-foreground`}>
        {ep.uptime.h24.pct === null ? "—" : `${ep.uptime.h24.pct.toFixed(1)}%`}
      </span>
    </div>
  );
}

export function AiPodsView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("24");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/pods", { params: { hours } });
      setFeed(res.data);
      setError(null);
    } catch {
      setError("Could not load pod health");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
    // The prober runs every minute; match it so the page is never more than
    // one cycle behind what the worker knows.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const t = feed?.totals;

  return (
    <div>
      <PageHeader
        title="Hosted pods"
        description="Every self-hosted pod, probed each minute by the gateway. A pod that answers but does not serve the name we send it counts as down."
        actions={
          <div className="flex items-center gap-2">
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="h-9 w-[130px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">Last 24 hours</SelectItem>
                <SelectItem value="168">Last 7 days</SelectItem>
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

      {/* The prober's own liveness outranks everything below it. */}
      {feed?.probe.stale && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-purple-500/50 bg-purple-500/10 px-3 py-2 text-[12.5px] text-purple-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Probe is stale</span> — the last
            check was {ago(feed.probe.ageSec)} and it should run every minute.
            The statuses below are whatever was true then, not now. Check the
            gateway worker before trusting any green on this page.
          </span>
        </div>
      )}

      {(feed?.alerts.length ?? 0) > 0 && (
        <div className="mb-4 space-y-1.5">
          {feed?.alerts.map((a) => (
            <div
              key={a.endpointId}
              className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Pods serving"
          value={t ? `${t.up} / ${t.enabled}` : "—"}
          hint={
            t
              ? `${t.endpoints - t.enabled - t.parkedEndpoints} staged · ${t.parkedEndpoints} on delisted models`
              : undefined
          }
          icon={Server}
          tone={t && t.up < t.enabled ? "critical" : "good"}
        />
        <StatCard
          label="Models down"
          value={t ? t.modelsDown : "—"}
          hint={
            t && t.modelsParked > 0
              ? `${t.modelsParked} delisted model(s) excluded`
              : "no enabled pod serving"
          }
          tone={t && t.modelsDown > 0 ? "critical" : "good"}
        />
        <StatCard
          label="Models degraded"
          value={t ? t.modelsDegraded : "—"}
          hint="running on fewer pods than configured"
          tone={t && t.modelsDegraded > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Last probe"
          value={feed ? ago(feed.probe.ageSec) : "—"}
          hint={feed?.probe.stale ? "prober may have stopped" : "runs every minute"}
          tone={feed?.probe.stale ? "critical" : "good"}
        />
      </div>

      <div className="space-y-4">
        {(feed?.models.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {loading ? "Loading pod health…" : "No hosted pods are being probed yet."}
          </p>
        ) : (
          feed?.models.map((m) => {
            const s = MODEL_STATUS[m.status];
            return (
              <div key={m.modelId} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                      {s.label}
                    </span>
                    <span className={`${MONO} text-[13px] font-medium`}>{m.modelId}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {m.modelActive ? (
                      <>
                        {m.okEndpoints}/{m.enabledEndpoints} pods serving
                        {m.stagedEndpoints > 0 && ` · ${m.stagedEndpoints} staged`}
                      </>
                    ) : (
                      "not listed in the catalog — no request can reach it"
                    )}
                  </span>
                </div>

                <div className="divide-y divide-border/60">
                  {m.endpoints.map((ep) => (
                    <div key={ep.endpointId} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 text-[10.5px] font-semibold ${
                                !m.modelActive || !ep.enabled
                                  ? "border-white/[0.15] bg-white/[0.04] text-white/50"
                                  : ep.ok
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                    : "border-red-500/50 bg-red-500/15 text-red-300"
                              }`}
                            >
                              {!m.modelActive
                                ? ep.ok
                                  ? "UP"
                                  : "OFFLINE"
                                : !ep.enabled
                                  ? "STAGED"
                                  : ep.ok
                                    ? "UP"
                                    : "DOWN"}
                            </span>
                            <span className="text-[13px] font-medium">
                              {ep.label ?? "(unlabelled pod)"}
                            </span>
                            {ep.weight !== null && (
                              <span className="text-[11px] text-muted-foreground">
                                weight {ep.weight}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[12px] text-muted-foreground">
                            {ep.reasonText}
                            {ep.latencyMs !== null && ep.ok && ` · ${ep.latencyMs}ms`}
                            {" · checked "}
                            {ago(ep.ageSec)}
                            {ep.consecutiveFailures > 0 &&
                              ` · ${ep.consecutiveFailures} consecutive failures`}
                          </div>
                          <div className={`${MONO} mt-0.5 truncate text-[11px] text-muted-foreground/70`}>
                            {ep.baseUrl}
                          </div>

                          {/* The failure that looks like success. */}
                          {ep.nameMismatch && (
                            <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-200">
                              Pod is up but serves{" "}
                              <span className={MONO}>{ep.servedIds.join(", ")}</span> — we
                              route <span className={MONO}>{ep.expectedName}</span> to it,
                              so every real request 404s.
                            </div>
                          )}
                          {!ep.ok && ep.error && (
                            <div className={`${MONO} mt-1.5 truncate text-[11px] text-red-300/80`}>
                              {ep.error}
                            </div>
                          )}
                        </div>

                        <div className="w-full max-w-[280px] shrink-0">
                          <UptimeStrip ep={ep} hours={feed.windowHours} />
                          <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
                            <span>
                              7d{" "}
                              {ep.uptime.d7.pct === null
                                ? "—"
                                : `${ep.uptime.d7.pct.toFixed(1)}%`}
                            </span>
                            <span>last ok {agoFrom(ep.lastOkAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="mt-4 text-[10.5px] text-muted-foreground">
        Probed by the gateway worker every minute — the panel reads the result
        and never contacts a pod or holds a pod key. A pod counts as serving
        only when it answers 200 <em>and</em> lists the model name we route to
        it. Staged (disabled) pods are probed so they are visible the moment
        they come up, but they do not count against a model&apos;s health —
        and neither do pods belonging to a delisted model, which no request
        can reach.
        Uptime percentages are exact probe counts; the strip marks the
        half-hours that contained a failure.
      </p>
    </div>
  );
}
