"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
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

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

type Row = {
  id: string;
  at: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  org: { id: string; label: string } | null;
  actor: { kind: "user" | "key" | "system"; label: string };
  ip: string | null;
  metadata: Record<string, unknown> | null;
};

type Feed = {
  days: number;
  page: number;
  limit: number;
  total: number | null;
  rows: Row[];
};

const TARGETS = [
  "api_key",
  "model",
  "model_catalog",
  "org",
  "byok_key",
  "finetune",
  "batch",
  "connector",
  "vector_collection",
  "vector_row",
  "file",
  "prompt",
  "guardrail_policy",
  "notification_settings",
  "feature_switch",
];

function actionTone(action: string) {
  if (action.includes("revoked") || action.includes("removed") || action.includes("deleted"))
    return "border-red-500/30 bg-red-500/10 text-red-300";
  if (action.startsWith("admin."))
    return "border-purple-500/40 bg-purple-500/10 text-purple-300";
  if (action.includes("created") || action.includes("added"))
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-white/[0.12] bg-white/[0.04] text-white/60";
}

export function AiActivityView() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("90");
  const [target, setTarget] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Feed>("/admin/ai/activity", {
        params: {
          days,
          page,
          limit: 50,
          target: target === "all" ? undefined : target,
        },
      });
      setFeed(res.data);
      setError(null);
    } catch {
      setError("Could not load the activity log");
    } finally {
      setLoading(false);
    }
  }, [days, page, target]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages =
    feed?.total && feed.limit ? Math.ceil(feed.total / feed.limit) : 1;

  return (
    <div>
      <PageHeader
        title="Gateway activity"
        description="Control-plane events inside the AI gateway — keys issued and revoked, models repriced, limits changed, BYOK and connectors edited."
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={target}
          onValueChange={(v) => {
            setTarget(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[190px] text-[13px]">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All targets</SelectItem>
            {TARGETS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={days}
          onValueChange={(v) => {
            setDays(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[140px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
        {feed?.total !== null && feed?.total !== undefined && (
          <span className="text-xs text-muted-foreground">
            {feed.total.toLocaleString()} events
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Target</th>
                <th className="px-4 py-2.5 font-semibold">Org</th>
                <th className="px-4 py-2.5 font-semibold">Actor</th>
                <th className="px-4 py-2.5 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(feed?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No gateway events in this window."}
                  </td>
                </tr>
              ) : (
                (feed?.rows ?? []).map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                    >
                      <td className={`${MONO} whitespace-nowrap px-4 py-2.5 text-[12px] text-muted-foreground`}>
                        {r.at.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10.5px] ${actionTone(r.action)}`}
                        >
                          {r.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                        {r.targetType ?? "—"}
                        {r.targetId && (
                          <span className={`${MONO} ml-1.5 text-[11px] text-muted-foreground/70`}>
                            {r.targetId.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                        {r.org?.label ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[12px]">
                        {r.actor.label}
                        <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                          {r.actor.kind}
                        </span>
                      </td>
                      <td className={`${MONO} px-4 py-2.5 text-[11.5px] text-muted-foreground`}>
                        {r.ip ?? "—"}
                      </td>
                    </tr>
                    {open === r.id && r.metadata && (
                      <tr className="bg-black/20">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className={`${MONO} overflow-x-auto text-[11.5px] text-muted-foreground`}>
                            {JSON.stringify(r.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {feed && (feed.total ?? 0) > feed.limit && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {feed.page} of {totalPages}
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
        This is the gateway&apos;s own trail (inference.audit_log) — separate
        from the platform audit log under Audit Logs, which records admin
        actions taken in this panel. Click a row for its full metadata.
      </p>
    </div>
  );
}
