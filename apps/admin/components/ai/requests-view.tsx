"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
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

type Row = {
  id: string;
  requestId: string | null;
  at: string;
  org: { id: string | null; label: string } | null;
  key: { id: string | null; label: string; revoked: boolean } | null;
  model: string | null;
  modelLabel: string | null;
  provider: string | null;
  modality: string | null;
  status: string;
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  cacheKind: string | null;
  costUsd: number;
  upstreamUsd: number;
  marginUsd: number | null;
  latencyMs: number | null;
  ttftMs: number | null;
  billedTo: string | null;
  isBatch: boolean;
  isOffPeak: boolean;
  units: number | null;
  unitLabel: string | null;
};

type Feed = {
  days: number;
  page: number;
  limit: number;
  total: number | null;
  rows: Row[];
  summary: {
    truncated: boolean;
    requests: number;
    errors: number;
    errorRatePct: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
    cacheHitRatePct: number | null;
    revenueUsd: number;
    upstreamUsd: number;
    marginUsd: number;
    marginPct: number | null;
    byokRequests: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    p50TtftMs: number | null;
  };
  facets: {
    orgs: { id: string; label: string }[];
    keys: { id: string; label: string }[];
    models: { id: string; label: string }[];
  };
};

const STATUSES = [
  "success",
  "error_upstream",
  "error_rate_limit",
  "error_budget",
  "error_auth",
  "error_validation",
  "error_internal",
  "cancelled",
];
const MODALITIES = [
  "chat",
  "embedding",
  "image",
  "video",
  "tts",
  "stt",
  "ocr",
  "rerank",
  "moderation",
  "music",
  "agent_tool",
];

const money = (n: number, places = 4) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
const ms = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;

function statusTone(status: string) {
  if (status === "success")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "cancelled")
    return "border-white/[0.12] bg-white/[0.04] text-white/50";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

export function AiRequestsView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [days, setDays] = useState("30");
  const [status, setStatus] = useState("all");
  const [model, setModel] = useState("all");
  const [org, setOrg] = useState("all");
  const [keyId, setKeyId] = useState("all");
  const [modality, setModality] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/requests", {
        params: {
          days,
          page,
          limit: 50,
          status: status === "all" ? undefined : status,
          model: model === "all" ? undefined : model,
          org: org === "all" ? undefined : org,
          key: keyId === "all" ? undefined : keyId,
          modality: modality === "all" ? undefined : modality,
          q: search || undefined,
        },
      });
      setFeed(res.data);
      setError(null);
    } catch {
      setError("Could not load the request log");
    } finally {
      setLoading(false);
    }
  }, [days, page, status, model, org, keyId, modality, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any filter change returns to the first page — page 7 of a different
  // result set is a different question than the one just asked.
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const s = feed?.summary;
  const hasFilters =
    status !== "all" ||
    model !== "all" ||
    org !== "all" ||
    keyId !== "all" ||
    modality !== "all" ||
    search !== "";
  const totalPages =
    feed?.total && feed.limit ? Math.ceil(feed.total / feed.limit) : 1;

  return (
    <div>
      <PageHeader
        title="Inference requests"
        description="Every gateway call — tokens, cache, model, key, latency and cost. One row per request."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <AiTabs />

      {error && (
        <p className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* Summary over the FILTERED set, not the page */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Requests"
          value={s ? compact(s.requests) : "—"}
          hint={
            s
              ? s.truncated
                ? "≥ — aggregate budget hit"
                : `${s.errors} errored · ${s.errorRatePct.toFixed(1)}%`
              : undefined
          }
          tone={s && s.errorRatePct > 5 ? "critical" : undefined}
        />
        <StatCard
          label="Tokens in / out"
          value={s ? `${compact(s.inputTokens)} / ${compact(s.outputTokens)}` : "—"}
          hint={
            s?.cacheHitRatePct !== null && s?.cacheHitRatePct !== undefined
              ? `${s.cacheHitRatePct.toFixed(0)}% of input served from cache`
              : "no cached tokens"
          }
        />
        <StatCard
          label="Billed"
          value={s ? money(s.revenueUsd, 2) : "—"}
          hint={s ? `upstream ${money(s.upstreamUsd, 2)}` : undefined}
        />
        <StatCard
          label="Margin"
          value={s ? money(s.marginUsd, 2) : "—"}
          hint={
            s
              ? s.marginPct === null
                ? "nothing billed"
                : `${s.marginPct.toFixed(1)}% of billed${s.byokRequests > 0 ? ` · ${s.byokRequests} BYOK excluded` : ""}`
              : undefined
          }
          tone={s ? (s.marginUsd < 0 ? "critical" : "good") : undefined}
        />
        <StatCard
          label="Latency p50 / p95"
          value={s ? `${ms(s.p50LatencyMs)} / ${ms(s.p95LatencyMs)}` : "—"}
          hint={s?.p50TtftMs !== null ? `TTFT p50 ${ms(s?.p50TtftMs ?? null)}` : "no TTFT recorded"}
        />
        <StatCard
          label="Matching rows"
          value={feed?.total === null ? "?" : compact(feed?.total ?? 0)}
          hint={hasFilters ? "filtered" : `last ${days} days`}
        />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[210px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search request id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") reset(() => setSearch(q.trim()));
            }}
            className="h-9 pl-9 text-[13px]"
          />
        </div>
        <Select value={days} onValueChange={(v) => reset(() => setDays(v))}>
          <SelectTrigger className="h-9 w-[120px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
          <SelectTrigger className="h-9 w-[150px] text-[13px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="errors">Errors only</SelectItem>
            {STATUSES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={(v) => reset(() => setModel(v))}>
          <SelectTrigger className="h-9 w-[170px] text-[13px]">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            {(feed?.facets.models ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={org} onValueChange={(v) => reset(() => setOrg(v))}>
          <SelectTrigger className="h-9 w-[160px] text-[13px]">
            <SelectValue placeholder="Org" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orgs</SelectItem>
            {(feed?.facets.orgs ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={keyId} onValueChange={(v) => reset(() => setKeyId(v))}>
          <SelectTrigger className="h-9 w-[170px] text-[13px]">
            <SelectValue placeholder="API key" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All keys</SelectItem>
            {(feed?.facets.keys ?? []).map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modality} onValueChange={(v) => reset(() => setModality(v))}>
          <SelectTrigger className="h-9 w-[140px] text-[13px]">
            <SelectValue placeholder="Modality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modalities</SelectItem>
            {MODALITIES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              reset(() => {
                setStatus("all");
                setModel("all");
                setOrg("all");
                setKeyId("all");
                setModality("all");
                setQ("");
                setSearch("");
              })
            }
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Log table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Request time</th>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 font-semibold">In / Out</th>
                <th className="px-4 py-3 font-semibold">Cache R/W</th>
                <th className="px-4 py-3 font-semibold">Key</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Latency</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading && !feed ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    Loading request log…
                  </td>
                </tr>
              ) : (feed?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    No requests match these filters in the last {days} days.
                  </td>
                </tr>
              ) : (
                (feed?.rows ?? []).map((r) => {
                  const open = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : r.id)}
                        className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                      >
                        <td className={`${MONO} whitespace-nowrap px-4 py-2.5 text-[12px] text-muted-foreground`}>
                          {new Date(r.at).toLocaleString("en-US", {
                            month: "numeric",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className={`${MONO} px-4 py-2.5 text-[12px] text-muted-foreground`}>
                          {r.requestId ? r.requestId.slice(-6) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{r.modelLabel ?? "—"}</span>
                          {r.provider && (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              via {r.provider}
                            </span>
                          )}
                        </td>
                        <td className={`${MONO} px-4 py-2.5 text-[12px]`}>
                          {r.inputTokens.toLocaleString()}/{r.outputTokens.toLocaleString()}
                        </td>
                        <td className={`${MONO} px-4 py-2.5 text-[12px] text-muted-foreground`}>
                          {r.cachedTokens.toLocaleString()}/{r.cacheWriteTokens.toLocaleString()}
                        </td>
                        <td className="max-w-[150px] truncate px-4 py-2.5 text-[12px] text-muted-foreground">
                          {r.key?.label ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] ${statusTone(r.status)}`}
                          >
                            {r.status === "success" ? "ok" : (r.errorCode ?? r.status)}
                          </span>
                        </td>
                        <td className={`${MONO} px-4 py-2.5 text-right text-[12px] text-muted-foreground`}>
                          {ms(r.latencyMs)}
                        </td>
                        <td className={`${MONO} px-4 py-2.5 text-right text-[12px]`}>
                          {r.costUsd > 0 ? money(r.costUsd) : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground">
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-black/20">
                          <td colSpan={10} className="px-4 py-3">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] md:grid-cols-4">
                              <Detail k="Request id" v={r.requestId ?? "—"} mono />
                              <Detail k="Model id" v={r.model ?? "—"} mono />
                              <Detail k="Organisation" v={r.org?.label ?? "—"} />
                              <Detail
                                k="API key"
                                v={`${r.key?.label ?? "—"}${r.key?.revoked ? " (revoked)" : ""}`}
                              />
                              <Detail k="Modality" v={r.modality ?? "—"} />
                              <Detail k="Billed to" v={r.billedTo ?? "—"} />
                              <Detail k="Cache" v={r.cacheKind ?? "none"} />
                              <Detail
                                k="Flags"
                                v={
                                  [
                                    r.isBatch ? "batch" : null,
                                    r.isOffPeak ? "off-peak" : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"
                                }
                              />
                              <Detail k="TTFT" v={ms(r.ttftMs)} />
                              <Detail k="Total latency" v={ms(r.latencyMs)} />
                              <Detail k="Billed" v={money(r.costUsd)} />
                              <Detail
                                k="Upstream cost"
                                v={`${money(r.upstreamUsd)}${
                                  r.marginUsd === null
                                    ? " · BYOK, margin not ours"
                                    : ` · margin ${money(r.marginUsd)}`
                                }`}
                              />
                              {r.units !== null && (
                                <Detail
                                  k="Units"
                                  v={`${r.units} ${r.unitLabel ?? ""}`.trim()}
                                />
                              )}
                              {r.errorCode && <Detail k="Error code" v={r.errorCode} mono />}
                            </dl>
                            {r.org?.id && (
                              <Link
                                href={`/ai/accounts?org=${r.org.id}`}
                                className="mt-2 inline-block text-[11.5px] text-[#3987e5] underline-offset-2 hover:underline"
                              >
                                View org &amp; keys →
                              </Link>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {feed && (feed.total ?? 0) > feed.limit && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {feed.page} of {totalPages.toLocaleString()} ·{" "}
              {(feed.total ?? 0).toLocaleString()} requests
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={feed.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={feed.page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10.5px] text-muted-foreground">
        Rows come from inference.usage — one per gateway call. Summary tiles
        aggregate the whole filtered set (not just this page); past the
        aggregate budget they say so rather than under-report. BYOK requests
        bill against the customer&apos;s own upstream key, so their margin is
        excluded rather than counted as zero.
      </p>
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {k}
      </dt>
      <dd className={`mt-0.5 ${mono ? MONO : ""} break-all`}>{v}</dd>
    </div>
  );
}
