"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ScrollText, Search, ShieldAlert, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import {
  actorKind,
  applyFilter,
  changesOf,
  describe,
  eventScope,
  isSensitive,
  type AuditRow,
  type AuditSummary,
  type EventScope,
} from "@/lib/admin/audit-view";

type Row = AuditRow & { actor_name: string | null; actor_email: string | null; org_name: string | null };

interface Payload {
  window: { days: number; rows: number; limit: number; truncated: boolean };
  summary: AuditSummary;
  actions: Array<{ action: string; count: number }>;
  rows: Row[];
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

function ActorBadge({ row }: { row: Row }) {
  const kind = actorKind(row);
  const label = row.actor_email ?? row.actor_name ?? (kind === "system" ? "system" : row.actor_user_id?.slice(0, 8) ?? "—");
  if (kind === "admin") return <Badge variant="secondary" className="bg-purple-500/15 text-purple-300">{label}</Badge>;
  if (kind === "api_key") return <Badge variant="outline" className="border-white/15 text-neutral-300">api key</Badge>;
  if (kind === "system") return <Badge variant="outline" className="border-white/15 text-neutral-500">system</Badge>;
  return <span className="text-xs text-neutral-300">{label}</span>;
}

/**
 * Section A6 — the audit trail, readable at last.
 *
 * Staff actions (admin.*) and customer actions live in one table but stay
 * visually distinct, because an incident review is almost always looking for
 * one or the other, never an undifferentiated mix.
 */
export default function InferenceAuditAdmin() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [scope, setScope] = useState<EventScope | "any">("any");
  const [action, setAction] = useState("any");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (windowDays: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/inference/audit?days=${windowDays}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load the audit trail");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const visible = useMemo(() => {
    if (!data) return [];
    return applyFilter(data.rows, {
      scope,
      action: action === "any" ? undefined : action,
      sensitiveOnly,
      search,
    }) as Row[];
  }, [data, scope, action, sensitiveOnly, search]);

  const s = data?.summary;
  const cards = s
    ? [
        { label: "Events", value: String(s.total), hint: `last ${data!.window.days} days`, icon: ScrollText, accent: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400" },
        { label: "Staff actions", value: String(s.admin_events), hint: "admin.* events", icon: UserCog, accent: "from-purple-500/20 to-blue-500/20 border-purple-500/30 text-purple-400" },
        { label: "Sensitive", value: String(s.sensitive), hint: "money or access changes", icon: ShieldAlert, accent: "from-amber-500/20 to-yellow-500/20 border-amber-500/30 text-amber-400" },
        { label: "Actors", value: String(s.distinct_actors), hint: `${s.system_events} system events`, icon: UserCog, accent: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-2">
            <ScrollText className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Inference Audit</h1>
            <p className="mt-0.5 text-sm text-neutral-400">Who changed what — staff actions and customer activity</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-[140px] border-white/10 bg-black/40">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data || !s ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load the audit trail.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-neutral-400">{card.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{card.value}</p>
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

          {s.admin_events === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400 backdrop-blur-xl">
              No staff actions recorded in this window. Admin audit begins once migration{" "}
              <span className="font-mono text-xs text-neutral-300">20260729000001</span> is applied — changes made
              before that were not recorded and cannot be reconstructed.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events…"
                className="h-9 border-white/10 bg-black/40 pl-8"
              />
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as EventScope | "any")}>
              <SelectTrigger className="h-9 w-[150px] border-white/10 bg-black/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All events</SelectItem>
                <SelectItem value="admin">Staff only</SelectItem>
                <SelectItem value="customer">Customer only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-9 w-[220px] border-white/10 bg-black/40">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All actions</SelectItem>
                {data.actions.map((a) => (
                  <SelectItem key={a.action} value={a.action}>
                    {a.action} ({a.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={sensitiveOnly ? "secondary" : "outline"}
              size="sm"
              className={sensitiveOnly ? "" : "border-white/10"}
              onClick={() => setSensitiveOnly((v) => !v)}
            >
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              Sensitive only
            </Button>
            <span className="ml-auto text-sm tabular-nums text-neutral-400">
              {visible.length} of {data.rows.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <Table>
              <TableHeader className="[&_tr]:border-white/10">
                <TableRow>
                  <TableHead className="w-[110px]">When</TableHead>
                  <TableHead className="w-[180px]">Actor</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="w-[160px]">Org</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-neutral-400">
                      No events match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((row) => {
                  const changes = changesOf(row);
                  const staff = eventScope(row) === "admin";
                  return (
                    <TableRow
                      key={row.id}
                      className={cn("border-white/5 hover:bg-white/[0.03]", staff && "bg-purple-500/[0.04]")}
                    >
                      <TableCell className="text-xs text-neutral-500" title={row.created_at}>
                        {ago(row.created_at)}
                      </TableCell>
                      <TableCell>
                        <ActorBadge row={row} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">{describe(row)}</span>
                          {isSensitive(row) && (
                            <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-400">
                              sensitive
                            </Badge>
                          )}
                        </div>
                        {changes.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-neutral-500">
                            {/* A bulk reprice repeats the same `field` across
                                many models, so field alone is not unique. */}
                            {changes.map((c, i) => (
                              <span key={`${(c as { model_id?: string }).model_id ?? ""}-${c.field}-${i}`}>
                                {c.field}: {String(c.from ?? "none")} → <span className="text-neutral-300">{String(c.to ?? "none")}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-400">
                        {row.org_name ?? (row.org_id ? row.org_id.slice(0, 8) : <span className="text-neutral-600">platform</span>)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-neutral-500">
            {data.window.rows} event(s) in the last {data.window.days} days
            {data.window.truncated && ` · capped at ${data.window.limit}`}
          </p>
        </>
      )}
    </div>
  );
}
