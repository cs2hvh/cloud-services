"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { GAME_ICONS, GAME_LABELS } from "@/components/dashboard/game/types";

interface AdminServer {
  id: number;
  name: string;
  game_type: string;
  status: string | null;
  owner_email: string | null;
  ip: string | null;
  port: number | null;
  plan_slug: string | null;
  region: string | null;
  monthly_price: number | null;
  auto_renew: boolean;
  ends_at: string | null;
}

interface Detail {
  server: AdminServer & { identifier: string | null; host_id: string | null; last_error: string | null; suspended_at: string | null; grace_until: string | null };
  events: Array<{ event_type: string; message: string | null; created_at: string }>;
}

const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  provisioning: "border-[#0095FF]/30 bg-[#0095FF]/10 text-[#82adfb]",
  installing: "border-[#0095FF]/30 bg-[#0095FF]/10 text-[#82adfb]",
  suspended: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-400",
};

const STATUSES = ["active", "suspended", "installing", "provisioning", "failed"];

export default function ServersTab() {
  const [servers, setServers] = useState<AdminServer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch] = useState("");
  const [game, setGame] = useState("");
  const [status, setStatus] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) qs.set("search", search.trim());
    if (game) qs.set("game", game);
    if (status) qs.set("status", status);
    const res = await fetch(`/api/admin/game/servers?${qs}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setServers(data.servers);
      setTotal(data.total);
    }
  }, [page, search, game, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), void load())}
            placeholder="Search name, IP, identifier…"
            className="h-9 w-full border border-white/[0.1] bg-[#0d0e11] pl-9 pr-3 text-[13px] text-white placeholder:text-white/30 focus:border-[#0095FF]/50 focus:outline-none"
          />
        </div>
        <select value={game} onChange={(e) => (setGame(e.target.value), setPage(1))} className="h-9 border border-white/[0.1] bg-[#0d0e11] px-2 text-[13px] text-white focus:outline-none">
          <option value="">All games</option>
          {Object.keys(GAME_LABELS).map((g) => (
            <option key={g} value={g}>{GAME_LABELS[g]}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="h-9 border border-white/[0.1] bg-[#0d0e11] px-2 text-[13px] text-white focus:outline-none">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 border border-white/[0.08] bg-white/[0.02] px-3 text-xs text-white/60 hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden border border-white/[0.08] bg-[#111216]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/35">
                <th className="px-4 py-3 font-semibold">Server</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Region</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Renewal</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {servers === null ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-white/40"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…</td></tr>
              ) : servers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-white/40">No servers match.</td></tr>
              ) : (
                servers.map((s) => (
                  <tr key={s.id} className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{GAME_ICONS[s.game_type] ?? "🎮"}</span>
                        <div className="min-w-0">
                          <button onClick={() => setDetailId(s.id)} className="block truncate font-medium text-white hover:text-[#82adfb]">{s.name}</button>
                          <span className="font-[var(--font-geist-mono),monospace] text-[11px] text-white/35">{s.ip && s.port ? `${s.ip}:${s.port}` : "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/55">{s.owner_email ?? "—"}</td>
                    <td className="px-4 py-3 text-white/55">{s.plan_slug ?? "—"}</td>
                    <td className="px-4 py-3 text-white/55">{s.region ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-6 items-center border px-2 text-[11px] font-medium ${STATUS_STYLE[s.status ?? ""] ?? "border-white/[0.1] bg-white/[0.04] text-white/50"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/55">
                      {s.ends_at ? new Date(s.ends_at).toLocaleDateString() : "—"}
                      <span className="ml-1.5 text-[11px] text-white/30">{s.auto_renew ? "auto" : "off"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailId(s.id)} className="inline-flex h-7 items-center border border-white/[0.08] px-2.5 text-[11.5px] text-white/60 hover:border-white/[0.18] hover:text-white">Manage</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-[12.5px] text-white/50">
            <span>{total} servers · page {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex h-8 items-center gap-1 border border-white/[0.08] px-2.5 text-white/60 disabled:opacity-40 hover:text-white">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="inline-flex h-8 items-center gap-1 border border-white/[0.08] px-2.5 text-white/60 disabled:opacity-40 hover:text-white">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailId !== null && <ServerDetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} />}
    </div>
  );
}

function ServerDetailDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plans, setPlans] = useState<Array<{ slug: string; name: string; game_type: string; monthly_price: number | string }>>([]);
  const [newPlan, setNewPlan] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/game/servers/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.ok) setDetail(data);
  }, [id]);

  useEffect(() => {
    void load();
    fetch("/api/admin/pricing/game", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setPlans(d.plans))
      .catch(() => {});
  }, [load]);

  const act = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label);
    try {
      const res = await fn();
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        toast.success(`${label} done`);
        await load();
        onChanged();
      } else {
        toast.error(data?.error || `${label} failed`);
      }
    } finally {
      setBusy(null);
    }
  };

  const action = (a: string, body?: Record<string, unknown>) =>
    act(a, () => fetch(`/api/admin/game/servers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...body }) }));

  const s = detail?.server;
  const gamePlans = plans.filter((p) => p.game_type === s?.game_type);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-[520px] overflow-y-auto border-l border-white/[0.1] bg-[#0d0e12] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{s ? GAME_ICONS[s.game_type] ?? "🎮" : ""}</span>
              <h2 className="text-[18px] font-semibold text-white">{s?.name ?? "…"}</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-white/45">{s?.owner_email} · {s?.plan_slug} · {s?.region}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {!detail ? (
          <div className="py-16 text-center text-white/40"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
        ) : (
          <>
            <div className="space-y-2 border border-white/[0.08] bg-[#111216] p-4 text-[12.5px]">
              <Row label="Status" value={s?.status ?? "—"} />
              <Row label="Connect" value={s?.ip && s?.port ? `${s.ip}:${s.port}` : "—"} copy={s?.ip && s?.port ? `${s.ip}:${s.port}` : undefined} />
              <Row label="Host" value={s?.host_id ?? "—"} />
              <Row label="Panel id" value={s?.identifier ?? "—"} />
              <Row label="Price" value={`$${Number(s?.monthly_price ?? 0).toFixed(2)}/mo`} />
              <Row label="Paid until" value={s?.ends_at ? new Date(s.ends_at).toUTCString() : "—"} />
              {s?.suspended_at && <Row label="Suspended" value={new Date(s.suspended_at).toUTCString()} />}
              {s?.last_error && <Row label="Last error" value={s.last_error} />}
            </div>

            {/* Actions */}
            <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {s?.status === "active" && (
                <ActionBtn busy={busy === "suspend"} onClick={() => action("suspend")} tone="amber">Suspend</ActionBtn>
              )}
              {s?.status === "suspended" && (
                <ActionBtn busy={busy === "unsuspend"} onClick={() => action("unsuspend")} tone="green">Unsuspend</ActionBtn>
              )}
              <ActionBtn busy={busy === "power-restart"} onClick={() => act("power-restart", () => fetch(`/api/admin/game/servers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "power", signal: "restart" }) }))}>
                <RotateCw className="mr-1 inline h-3 w-3" /> Restart
              </ActionBtn>
              <ActionBtn busy={busy === "power-start"} onClick={() => act("power-start", () => fetch(`/api/admin/game/servers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "power", signal: "start" }) }))}>
                <Play className="mr-1 inline h-3 w-3" /> Start
              </ActionBtn>
              <ActionBtn busy={busy === "reinstall"} onClick={() => confirm("Reinstall wipes the server files. Continue?") && action("reinstall")}>Reinstall</ActionBtn>
              <ActionBtn busy={busy === "extend"} onClick={() => act("extend", () => fetch(`/api/admin/game/servers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extendDays: 30 }) }))}>+30 days</ActionBtn>
            </div>

            {/* Change plan */}
            <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Change plan (upgrade / downgrade)</p>
            <div className="flex gap-2">
              <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)} className="h-9 flex-1 border border-white/[0.1] bg-[#0d0e11] px-2 text-[12.5px] text-white focus:outline-none">
                <option value="">Select plan…</option>
                {gamePlans.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name} — ${Number(p.monthly_price).toFixed(2)}/mo</option>
                ))}
              </select>
              <button
                disabled={!newPlan || busy === "change_plan"}
                onClick={() => action("change_plan", { planSlug: newPlan })}
                className="inline-flex h-9 items-center gap-1 border border-[#0095FF]/30 bg-[#0095FF] px-4 text-[12.5px] font-semibold text-white hover:bg-[#33adff] disabled:opacity-40"
              >
                {busy === "change_plan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
              </button>
            </div>

            {/* Danger */}
            <div className="mt-6 border border-red-500/[0.18] bg-red-500/[0.03] p-4">
              <p className="text-[12.5px] font-medium text-white">Delete server</p>
              <p className="mt-0.5 text-[11.5px] text-white/40">Permanent. Forfeits the remaining prepaid period.</p>
              <button
                disabled={busy === "delete"}
                onClick={() => confirm(`Delete "${s?.name}" permanently?`) && act("delete", () => fetch(`/api/admin/game/servers/${id}`, { method: "DELETE" })).then(() => onClose())}
                className="mt-3 inline-flex h-8 items-center gap-2 border border-red-500/40 bg-red-500/80 px-3 text-[12px] font-semibold text-white hover:bg-red-500"
              >
                {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
              </button>
            </div>

            {/* Events */}
            <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-wider text-white/40">Activity</p>
            <div className="space-y-1.5">
              {detail.events.length === 0 && <p className="text-[12px] text-white/35">No events.</p>}
              {detail.events.map((e, i) => (
                <div key={i} className="flex items-baseline gap-3 text-[12px]">
                  <span className="shrink-0 font-[var(--font-geist-mono),monospace] text-[10.5px] text-white/30">{new Date(e.created_at).toISOString().slice(5, 16).replace("T", " ")}</span>
                  <span className="text-white/65">{e.message ?? e.event_type}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/40">{label}</span>
      {copy ? (
        <button onClick={() => { void navigator.clipboard.writeText(copy); toast.success("Copied"); }} className="inline-flex items-center gap-1.5 text-right text-white/75 hover:text-white">
          {value} <Copy className="h-3 w-3 text-white/30" />
        </button>
      ) : (
        <span className="text-right text-white/75 break-all">{value}</span>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, busy, tone }: { children: React.ReactNode; onClick: () => void; busy?: boolean; tone?: "amber" | "green" }) {
  const toneCls = tone === "amber" ? "hover:border-amber-500/40 hover:text-amber-300" : tone === "green" ? "hover:border-emerald-500/40 hover:text-emerald-300" : "hover:border-white/[0.2] hover:text-white";
  return (
    <button onClick={onClick} disabled={busy} className={`inline-flex h-9 items-center justify-center border border-white/[0.1] bg-white/[0.02] px-3 text-[12.5px] text-white/70 transition-colors disabled:opacity-40 ${toneCls}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}
