"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, KeyRound, RefreshCw, Search, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import api from "@/lib/axios/axios";
import { OrgDetailDialog } from "./org-detail-dialog";
import type { OrgView, OrgsPayload } from "./types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function CapBadge({ state }: { state: OrgView["summary"]["cap_state"] }) {
  if (state === "none") return <Badge variant="outline" className="border-amber-500/30 text-amber-400">no cap</Badge>;
  if (state === "over") return <Badge variant="destructive">over cap</Badge>;
  if (state === "near") return <Badge variant="secondary" className="bg-amber-500/15 text-amber-400">near cap</Badge>;
  return <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400">under cap</Badge>;
}

/**
 * Section A2 — orgs & customers. The screen support lives in: find a customer,
 * see their members, keys and limits, and change the limits without SQL.
 *
 * Org-scoped by the decision in doc 21 §5.1 — every AI resource hangs off
 * org_id, so the org is the unit that carries quotas, caps and bills.
 */
export default function InferenceOrgsAdmin() {
  const params = useSearchParams();
  const [data, setData] = useState<OrgsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  // Seeded from ?q= so other admin pages can deep-link a specific customer here.
  // The existing filter already matches on id, name and slug, so an org uuid in
  // the URL lands on exactly one row instead of an unfiltered list.
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<OrgView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/inference/orgs");
      setData(res.data);
      // Keep the open dialog in sync after a write.
      setSelected((prev) => (prev ? res.data.orgs.find((o: OrgView) => o.id === prev.id) ?? null : null));
    } catch {
      toast.error("Failed to load orgs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.orgs
      .filter((o) => !term || `${o.name ?? ""} ${o.slug ?? ""} ${o.id}`.toLowerCase().includes(term))
      .sort((a, b) => b.summary.spend_cents - a.summary.spend_cents);
  }, [data, search]);

  const cards = data
    ? [
        { label: "Orgs", value: String(data.overview.active_orgs), hint: `${data.overview.members} members`, icon: Building2, accent: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400" },
        { label: "Live API keys", value: String(data.overview.keys_live), hint: `of ${data.overview.keys} total`, icon: KeyRound, accent: "from-purple-500/20 to-blue-500/20 border-purple-500/30 text-purple-400" },
        { label: "Uncapped keys", value: String(data.overview.keys_uncapped), hint: "no spend limit", icon: ShieldAlert, accent: data.overview.keys_uncapped > 0 ? "from-red-500/20 to-orange-500/20 border-red-500/30 text-red-400" : "from-neutral-500/20 to-neutral-600/20 border-white/10 text-neutral-400", danger: data.overview.keys_uncapped > 0 },
        { label: "Orgs without a cap", value: String(data.overview.orgs_without_cap), hint: "unbounded spend", icon: ShieldAlert, accent: data.overview.orgs_without_cap > 0 ? "from-amber-500/20 to-yellow-500/20 border-amber-500/30 text-amber-400" : "from-neutral-500/20 to-neutral-600/20 border-white/10 text-neutral-400", danger: data.overview.orgs_without_cap > 0 },
        { label: "Internal keys", value: String(data.overview.internal_keys_live), hint: "bill the customer org", icon: Users, accent: "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-2">
            <Building2 className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Inference Orgs</h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              Customers, their members, API keys and spend limits
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-white/10" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl bg-white/5" />
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center text-sm text-neutral-400 backdrop-blur-xl">
          Could not load orgs.
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
                      <p className={cn("mt-1 text-2xl font-semibold tabular-nums text-white", card.danger && "text-red-400")}>
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

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an org by name, slug or id…"
                className="h-9 border-white/10 bg-black/40 pl-8"
              />
            </div>
            <span className="text-sm tabular-nums text-neutral-400">
              {visible.length} of {data.orgs.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
            <Table>
              <TableHeader className="[&_tr]:border-white/10">
                <TableRow>
                  <TableHead className="min-w-[240px]">Org</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Keys</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Hard cap</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((org) => (
                  <TableRow
                    key={org.id}
                    className={cn("border-white/5 hover:bg-white/[0.03]", org.deleted_at && "opacity-50")}
                  >
                    <TableCell>
                      <div className="text-sm text-white">{org.name ?? org.slug ?? "Untitled"}</div>
                      <div className="font-mono text-[10px] text-neutral-500">{org.id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{org.summary.members}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {org.summary.keys_active}
                      {org.summary.keys_total > org.summary.keys_active && (
                        <span className="text-neutral-500"> / {org.summary.keys_total}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(org.summary.spend_cents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-neutral-400">
                      {org.hard_cap_cents == null ? "—" : money(org.hard_cap_cents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CapBadge state={org.summary.cap_state} />
                        {org.deleted_at && <Badge variant="outline" className="border-white/15 text-[10px]">deleted</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="border-white/15" onClick={() => setSelected(org)}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-neutral-500">
            Spend is over the most recent {data.usage_window.rows} usage rows, not all history.
          </p>
        </>
      )}

      <OrgDetailDialog org={selected} onOpenChange={(open) => !open && setSelected(null)} onSaved={() => void load()} />
    </div>
  );
}
