"use client";

// Game server detail — live status/provisioning progress, connect info,
// power controls, billing (renewal + auto-renew toggle), panel access,
// event log, and delete.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Power,
  RotateCw,
  Trash2,
} from "lucide-react";

import {
  GAME_ICONS,
  GAME_LABELS,
  type GameServerDetailClient,
  type GameServerEventClient,
  type PanelAccessClient,
} from "./types";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const SERIF: React.CSSProperties = { fontFamily: "var(--font-nunito), system-ui, sans-serif" };

export default function GameServerDetail({ serverId }: { serverId: number }) {
  const router = useRouter();
  const [server, setServer] = useState<GameServerDetailClient | null>(null);
  const [events, setEvents] = useState<GameServerEventClient[]>([]);
  const [panel, setPanel] = useState<PanelAccessClient | null>(null);
  const [showPanelPassword, setShowPanelPassword] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [powerBusy, setPowerBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/game/servers/${serverId}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setServer(data.server);
        setEvents(data.events);
      }
    } catch {
      /* transient */
    }
  }, [serverId]);

  useEffect(() => {
    void load();
    void fetch("/api/services/game/panel-access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.ok && setPanel(d.access))
      .catch(() => {});
  }, [load]);

  const inFlight = server?.status === "provisioning" || server?.status === "installing";
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, [inFlight, load]);

  const prov = server?.details?.provisioning;
  const ports = server?.details?.ports ?? {};
  const connect = server?.ip && server?.port ? `${server.ip}:${server.port}` : null;

  const statusBadge = useMemo(() => {
    switch (server?.status) {
      case "active":
        return { label: "Active", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
      case "provisioning":
      case "installing":
        return { label: server.status === "installing" ? "Installing" : "Provisioning", cls: "border-[#0095FF]/30 bg-[#0095FF]/10 text-[#82adfb]" };
      case "suspended":
        return { label: "Suspended", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
      case "failed":
        return { label: "Failed", cls: "border-red-500/30 bg-red-500/10 text-red-400" };
      default:
        return { label: server?.status ?? "…", cls: "border-white/[0.1] bg-white/[0.04] text-white/50" };
    }
  }, [server?.status]);

  const copy = (value: string, label: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const power = async (signal: "start" | "stop" | "restart") => {
    setPowerBusy(signal);
    try {
      const res = await fetch(`/api/services/game/servers/${serverId}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) toast.error(data?.error || "Power action failed");
      else toast.success(`Sent ${signal}`);
    } finally {
      setPowerBusy(null);
    }
  };

  const toggleAutoRenew = async () => {
    if (!server) return;
    const next = !server.autoRenew;
    const res = await fetch(`/api/services/game/servers/${serverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoRenew: next }),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setServer({ ...server, autoRenew: next });
      toast.success(next ? "Auto-renew enabled" : "Auto-renew disabled — server stops at period end");
    } else {
      toast.error(data?.error || "Update failed");
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/services/game/servers/${serverId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        toast.success("Server deleted");
        router.push("/dashboard/services/game");
      } else {
        toast.error(data?.error || "Delete failed");
        setDeleting(false);
      }
    } catch {
      toast.error("Delete failed");
      setDeleting(false);
    }
  };

  if (notFound) {
    return (
      <div className="py-24 text-center">
        <p className="text-white/60">Server not found.</p>
        <Link href="/dashboard/services/game" className="mt-3 inline-block text-[#82adfb] hover:underline">
          Back to game servers
        </Link>
      </div>
    );
  }
  if (!server) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link
        href="/dashboard/services/game"
        className={`${MONO} mb-6 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/45 transition-colors hover:text-white`}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Game servers
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="text-4xl">{GAME_ICONS[server.gameType] ?? "🎮"}</span>
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-white sm:text-[34px]">{server.name}</h1>
            <p className={`${MONO} mt-1 text-[11px] uppercase tracking-[0.1em] text-white/45`}>
              {GAME_LABELS[server.gameType] ?? server.gameType} · {server.planSlug} · {server.region}
            </p>
          </div>
        </div>
        <span className={`inline-flex h-7 items-center rounded-[4px] border px-2.5 text-[11.5px] font-medium ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Stat strip */}
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DStat label="Status" value={statusBadge.label} />
        <DStat
          label="Connect"
          value={connect ?? "pending"}
          onCopy={connect ? () => copy(connect, "Address") : undefined}
        />
        <DStat label="Plan" value={`$${Number(server.monthlyPrice ?? 0).toFixed(2)}`} suffix="/mo" serif />
        <DStat
          label="Renewal"
          value={
            server.endsAt
              ? (() => {
                  const ms = new Date(server.endsAt).getTime() - Date.now();
                  return ms <= 0 ? "expired" : `${Math.max(1, Math.floor(ms / 86_400_000))}d`;
                })()
              : "—"
          }
          suffix={server.autoRenew ? "auto" : "off"}
        />
      </div>

      {/* Provisioning progress */}
      {inFlight && prov && (
        <div className="mt-6 rounded-[8px] border border-[#0095FF]/25 bg-[#0095FF]/[0.05] px-5 py-4">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-white/80">{prov.message}</span>
            <span className={`${MONO} text-white/50`}>{prov.progress}%</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden bg-white/[0.06]">
            <div className="h-full bg-[#0095FF] transition-all duration-700" style={{ width: `${prov.progress}%` }} />
          </div>
        </div>
      )}

      {server.status === "suspended" && (
        <div className="mt-6 rounded-[8px] border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4 text-[13px] text-amber-200">
          This server is suspended{server.graceUntil ? ` — it will be deleted after ${new Date(server.graceUntil).toUTCString()} unless renewed` : ""}.
          Top up your balance and it will resume automatically within the hour.
        </div>
      )}

      {/* Grid: connection + billing */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {/* Connection */}
        <div className="rounded-[8px] border border-white/[0.08] bg-[#111216] p-5">
          <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40`}>Connection</p>
          <div className="mt-3 space-y-2.5">
            {connect ? (
              <Row label="Connect">
                <button type="button" onClick={() => copy(connect, "Address")} className={`${MONO} inline-flex items-center gap-1.5 text-[13px] text-white hover:text-[#82adfb]`}>
                  {connect} <Copy className="h-3 w-3 text-white/30" />
                </button>
              </Row>
            ) : (
              <Row label="Connect"><span className="text-white/35">assigned after install</span></Row>
            )}
            {Object.entries(ports)
              .filter(([k]) => k !== "game")
              .map(([k, v]) => (
                <Row key={k} label={k}>
                  <span className={`${MONO} text-[12.5px] text-white/60`}>{v.ip}:{v.port}</span>
                </Row>
              ))}
          </div>

          {/* Power */}
          <div className="mt-5 flex items-center gap-2 border-t border-white/[0.06] pt-4">
            {([
              { signal: "start" as const, icon: Play, label: "Start" },
              { signal: "restart" as const, icon: RotateCw, label: "Restart" },
              { signal: "stop" as const, icon: Power, label: "Stop" },
            ]).map(({ signal, icon: Icon, label }) => (
              <button
                key={signal}
                type="button"
                disabled={server.status !== "active" || powerBusy !== null}
                onClick={() => void power(signal)}
                className="inline-flex h-8 items-center gap-1.5 border border-white/[0.1] bg-white/[0.02] px-3 text-[12px] text-white/70 transition-colors hover:border-white/[0.2] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {powerBusy === signal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Billing */}
        <div className="rounded-[8px] border border-white/[0.08] bg-[#111216] p-5">
          <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40`}>Billing</p>
          <div className="mt-3 space-y-2.5">
            <Row label="Plan price">
              <span className={`${MONO} text-[13px] text-white`}>${Number(server.monthlyPrice ?? 0).toFixed(2)}/month</span>
            </Row>
            <Row label="Paid until">
              <span className={`${MONO} text-[12.5px] text-white/70`}>
                {server.endsAt ? new Date(server.endsAt).toUTCString().replace(" GMT", " UTC") : "—"}
              </span>
            </Row>
            <Row label="Auto-renew">
              <button
                type="button"
                onClick={() => void toggleAutoRenew()}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${server.autoRenew ? "bg-[#0095FF]" : "bg-white/[0.12]"}`}
                aria-label="Toggle auto-renew"
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${server.autoRenew ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
              </button>
            </Row>
          </div>

          {/* Panel access */}
          {panel && (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-white/50">Console, files &amp; mods live in the game panel</p>
                <a
                  href={server.identifier ? `${panel.panelUrl}/server/${server.identifier}` : panel.panelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-white/[0.1] bg-white/[0.03] px-3 text-[12px] text-white transition-colors hover:border-[#0095FF]/40 hover:bg-[#0095FF]/[0.08]"
                >
                  Open panel <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="mt-3 space-y-2">
                <Row label="Panel user">
                  <button
                    type="button"
                    onClick={() => copy(panel.username, "Username")}
                    className={`${MONO} inline-flex items-center gap-1.5 text-[12.5px] text-white/70 hover:text-white`}
                  >
                    {panel.username} <Copy className="h-3 w-3 text-white/30" />
                  </button>
                </Row>
                <Row label="Panel password">
                  {panel.password ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`${MONO} text-[12.5px] text-white/70`}>
                        {showPanelPassword ? panel.password : "••••••••••"}
                      </span>
                      <button type="button" className="text-white/35 hover:text-white" onClick={() => setShowPanelPassword((v) => !v)}>
                        {showPanelPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button type="button" className="text-white/35 hover:text-white" onClick={() => copy(panel.password!, "Password")}>
                        <Copy className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-[12px] text-white/35">use reset on the Game Servers page</span>
                  )}
                </Row>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="mt-4 rounded-[8px] border border-white/[0.08] bg-[#111216] p-5">
        <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40`}>Activity</p>
        <div className="mt-3 space-y-2">
          {events.length === 0 && <p className="text-[12.5px] text-white/35">No events yet.</p>}
          {events.map((e, i) => (
            <div key={i} className="flex items-baseline gap-3 text-[12.5px]">
              <span className={`${MONO} shrink-0 text-[11px] text-white/30`}>
                {new Date(e.created_at).toISOString().slice(5, 16).replace("T", " ")}
              </span>
              <span className="text-white/70">{e.message ?? e.event_type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-4 rounded-[8px] border border-red-500/[0.18] bg-red-500/[0.03] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-white">Delete this server</p>
            <p className="mt-0.5 text-[12px] text-white/40">
              Permanent — world data and files are destroyed. No refund for the remaining period.
            </p>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-9 items-center gap-2 border border-red-500/30 bg-red-500/10 px-4 text-[12.5px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="inline-flex h-9 items-center border border-white/[0.1] px-3 text-[12.5px] text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void doDelete()}
                className="inline-flex h-9 items-center gap-2 border border-red-500/40 bg-red-500/80 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-500"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Yes, delete permanently
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DStat({ label, value, suffix, serif, onCopy }: { label: string; value: string; suffix?: string; serif?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border border-white/[0.06] bg-[#111216] px-4 py-3.5">
      <span className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45`}>{label}</span>
      <div className="flex items-baseline gap-1">
        {onCopy ? (
          <button onClick={onCopy} className={`${MONO} inline-flex items-center gap-1.5 truncate text-[15px] text-white hover:text-[#82adfb]`}>
            {value} <Copy className="h-3 w-3 shrink-0 text-white/30" />
          </button>
        ) : serif ? (
          <span style={SERIF} className="text-[26px] font-bold leading-none tabular-nums text-white">{value}</span>
        ) : (
          <span className="truncate text-[15px] font-medium text-white">{value}</span>
        )}
        {suffix && <span className={`${MONO} text-[10px] uppercase tracking-wider text-white/40`}>{suffix}</span>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] capitalize text-white/40">{label}</span>
      {children}
    </div>
  );
}
