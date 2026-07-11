"use client";

// Game Servers — overview, matched to the VPS/GPU service look: hero, panel-access
// card, stats strip, status filter chips, search, and a server table. Live status
// via Supabase realtime + a poll fallback while anything is provisioning.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, ExternalLink, Gamepad2, Plus, RefreshCw, Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  GAME_ICONS,
  GAME_LABELS,
  type GameServerSummaryClient,
  type PanelAccessClient,
} from "./types";

const SERIF: React.CSSProperties = { fontFamily: "var(--font-nunito), system-ui, sans-serif" };
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

type Filter = "all" | "active" | "installing" | "suspended" | "failed";

function statusMeta(status: string | null): { dot: string; text: string; label: string } {
  switch (status) {
    case "active":
      return { dot: "#4ade80", text: "text-emerald-300", label: "Active" };
    case "provisioning":
    case "installing":
      return { dot: ACCENT, text: "text-[#82adfb]", label: status === "installing" ? "Installing" : "Deploying" };
    case "suspended":
      return { dot: "#fbbf24", text: "text-amber-300", label: "Suspended" };
    case "failed":
      return { dot: "#f87171", text: "text-red-400", label: "Failed" };
    default:
      return { dot: "rgba(255,255,255,0.3)", text: "text-white/50", label: status ?? "Unknown" };
  }
}

function daysLeft(endsAt: string | null): string {
  if (!endsAt) return "—";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days}d left` : `${Math.max(1, Math.floor(ms / 3_600_000))}h left`;
}

export default function GameDashboard() {
  const [servers, setServers] = useState<GameServerSummaryClient[] | null>(null);
  const [panel, setPanel] = useState<PanelAccessClient | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/services/game/servers", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.ok) setServers(data.servers);
    } catch {
      /* keep previous */
    }
  }, []);

  const fetchPanel = useCallback(async () => {
    try {
      const res = await fetch("/api/services/game/panel-access", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.ok) setPanel(data.access);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void fetchServers();
    void fetchPanel();
  }, [fetchServers, fetchPanel]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("game-servers-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_servers" }, () => void fetchServers())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchServers]);

  const anyInFlight = useMemo(
    () => (servers ?? []).some((s) => s.status === "provisioning" || s.status === "installing"),
    [servers],
  );
  useEffect(() => {
    if (!anyInFlight) return;
    const id = setInterval(() => void fetchServers(), 6_000);
    return () => clearInterval(id);
  }, [anyInFlight, fetchServers]);

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, installing: 0, suspended: 0, failed: 0 };
    for (const s of servers ?? []) {
      c.all++;
      if (s.status === "active") c.active++;
      else if (s.status === "installing" || s.status === "provisioning") c.installing++;
      else if (s.status === "suspended") c.suspended++;
      else if (s.status === "failed") c.failed++;
    }
    return c;
  }, [servers]);

  const totals = useMemo(() => {
    const games = new Set<string>();
    const regions = new Set<string>();
    for (const s of servers ?? []) {
      games.add(s.game_type);
      if (s.region) regions.add(s.region);
    }
    return { games: games.size, regions: regions.size };
  }, [servers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (servers ?? []).filter((s) => {
      if (filter !== "all") {
        if (filter === "installing") {
          if (s.status !== "installing" && s.status !== "provisioning") return false;
        } else if (s.status !== filter) return false;
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.ip ?? "").toLowerCase().includes(q) ||
        (s.plan_slug ?? "").toLowerCase().includes(q) ||
        (s.region ?? "").toLowerCase().includes(q) ||
        (GAME_LABELS[s.game_type] ?? s.game_type).toLowerCase().includes(q)
      );
    });
  }, [servers, filter, query]);

  const copy = (value: string, label: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]" style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }} />
        <div className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]" style={{ background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)", backgroundSize: "28px 28px" }} />
      </div>

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        {/* Hero */}
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] text-white sm:text-[44px]">
              Your <span style={SERIF} className="font-normal text-[#0095FF]">game servers</span>
            </h1>
            <p className={`${MONO} mt-3 max-w-xl text-[11.5px] leading-relaxed text-white/45`}>
              Prepaid monthly hosting across regions. Manage here, or dive into the game panel for console, files and mods.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => { setRefreshing(true); void Promise.all([fetchServers(), fetchPanel()]).finally(() => setRefreshing(false)); }}
              className={`${MONO} inline-flex h-10 items-center gap-2 rounded-[5px] border border-white/[0.08] bg-[#111216] px-3.5 text-[11px] uppercase tracking-[0.14em] text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white`}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <Link
              href="/dashboard/services/game/deploy"
              className={`${MONO} inline-flex h-10 items-center gap-2 rounded-[5px] px-4 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white transition-all`}
              style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`; }}
            >
              <Plus className="h-3.5 w-3.5" /> Deploy server
            </Link>
          </div>
        </header>

        {/* Panel access card */}
        {panel && (
          <div className="mb-8 overflow-hidden rounded-[6px] border border-white/[0.08] bg-[#111216]">
            <div className="h-px w-full bg-gradient-to-r from-[#0095FF]/40 via-[#0095FF]/10 to-transparent" />
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40`}>Game panel access</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px]">
                  <span className="text-white/45">
                    User <span className={`${MONO} ml-1 text-white`}>{panel.username}</span>
                    <button className="ml-1.5 text-white/35 hover:text-white" onClick={() => copy(panel.username, "Username")}><Copy className="inline h-3 w-3" /></button>
                  </span>
                  <span className="text-white/45">
                    Password{" "}
                    <span className={`${MONO} ml-1 text-white`}>{panel.password ? (showPassword ? panel.password : "••••••••••") : "set via reset"}</span>
                    {panel.password && (
                      <>
                        <button className="ml-1.5 text-white/35 hover:text-white" onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff className="inline h-3 w-3" /> : <Eye className="inline h-3 w-3" />}</button>
                        <button className="ml-1.5 text-white/35 hover:text-white" onClick={() => copy(panel.password!, "Password")}><Copy className="inline h-3 w-3" /></button>
                      </>
                    )}
                  </span>
                  <button
                    onClick={async () => {
                      const res = await fetch("/api/services/game/panel-access", { method: "POST" });
                      const data = await res.json().catch(() => null);
                      if (data?.ok) { setPanel(data.access); setShowPassword(true); toast.success("Panel password rotated"); }
                      else toast.error(data?.error || "Reset failed");
                    }}
                    className="text-[11.5px] text-white/40 underline-offset-2 hover:text-white hover:underline"
                  >
                    Reset password
                  </button>
                </div>
              </div>
              <a href={panel.panelUrl} target="_blank" rel="noopener noreferrer" className={`${MONO} inline-flex h-9 shrink-0 items-center gap-2 rounded-[5px] border border-white/[0.1] bg-white/[0.03] px-4 text-[11px] uppercase tracking-[0.12em] text-white transition-colors hover:border-[#0095FF]/40 hover:bg-[#0095FF]/[0.08]`}>
                Open panel <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Stats strip */}
        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Total" value={String(counts.all)} hint={`${counts.active} active · ${counts.suspended} suspended`} />
          <StatTile label="Active" value={String(counts.active)} hint="Running now" tone="green" />
          <StatTile label="Games" value={String(totals.games)} hint={totals.games === 1 ? "Game type" : "Game types"} tone="blue" />
          <StatTile label="Regions" value={String(totals.regions)} hint={totals.regions === 1 ? "Datacenter" : "Datacenters"} />
        </section>

        {/* Filters + search */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>All</Chip>
            <Chip active={filter === "active"} onClick={() => setFilter("active")} count={counts.active} dot="#4ade80">Active</Chip>
            <Chip active={filter === "installing"} onClick={() => setFilter("installing")} count={counts.installing} dot={ACCENT}>Deploying</Chip>
            <Chip active={filter === "suspended"} onClick={() => setFilter("suspended")} count={counts.suspended} dot="#fbbf24">Suspended</Chip>
            {counts.failed > 0 && <Chip active={filter === "failed"} onClick={() => setFilter("failed")} count={counts.failed} dot="#f87171">Failed</Chip>}
          </div>
          <div className="flex h-9 w-full items-center gap-2 rounded-[5px] border border-white/[0.08] bg-[#0d0e11] px-3 sm:w-72">
            <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, game, IP…" className={`${MONO} flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/30`} />
          </div>
        </div>

        {/* Table / states */}
        {servers === null ? (
          <div className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#111216]">
            {[1, 2, 3].map((i) => <div key={i} className="h-[60px] animate-pulse border-b border-white/[0.04] bg-white/[0.015] last:border-b-0" style={{ animationDelay: `${i * 80}ms` }} />)}
          </div>
        ) : servers.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-white/[0.1] bg-[#111216] px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-white">No servers match this filter</p>
            <p className={`${MONO} mt-2 text-[11px] text-white/45`}>Try a different status or clear your search.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#111216]">
            <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_84px] gap-3 border-b border-white/[0.06] px-5 py-2.5 md:grid">
              <ColHead>Server</ColHead><ColHead>Game</ColHead><ColHead>Connect</ColHead><ColHead>Region</ColHead><ColHead>Renewal</ColHead><ColHead align="right">Manage</ColHead>
            </div>
            {filtered.map((s) => {
              const st = statusMeta(s.status);
              const inFlight = s.status === "installing" || s.status === "provisioning";
              const prov = s.details?.provisioning;
              return (
                <div key={s.id} className="grid grid-cols-1 gap-3 border-b border-white/[0.04] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.02] md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_84px] md:items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg">{GAME_ICONS[s.game_type] ?? "🎮"}</span>
                    <div className="min-w-0">
                      <Link href={`/dashboard/services/game/${s.id}`} className="block truncate font-medium text-white hover:text-[#82adfb]">{s.name}</Link>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] ${st.text}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot, boxShadow: inFlight ? `0 0 6px ${st.dot}` : undefined }} />
                        {st.label}{inFlight && prov ? ` · ${prov.progress}%` : ""}
                      </span>
                    </div>
                  </div>
                  <div className={`${MONO} text-[12px] text-white/55`}>{GAME_LABELS[s.game_type] ?? s.game_type}</div>
                  <div>
                    {s.ip && s.port ? (
                      <button onClick={() => copy(`${s.ip}:${s.port}`, "Address")} className={`${MONO} inline-flex items-center gap-1.5 text-[12px] text-white/70 hover:text-white`}>{s.ip}:{s.port}<Copy className="h-3 w-3 text-white/30" /></button>
                    ) : <span className="text-white/30">—</span>}
                  </div>
                  <div className={`${MONO} text-[12px] text-white/55`}>{s.region ?? "—"}</div>
                  <div className={`${MONO} text-[12px] text-white/55`}>{daysLeft(s.ends_at)}<span className="ml-1.5 text-white/30">{s.auto_renew ? "auto" : "off"}</span></div>
                  <div className="md:text-right">
                    <Link href={`/dashboard/services/game/${s.id}`} className={`${MONO} inline-flex h-8 items-center rounded-[4px] border border-white/[0.08] px-3 text-[10.5px] uppercase tracking-[0.1em] text-white/60 transition-colors hover:border-white/[0.18] hover:text-white`}>Manage</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "blue" | "green" }) {
  const color = tone === "blue" ? ACCENT : tone === "green" ? "#4ade80" : "rgba(255,255,255,0.55)";
  return (
    <div className="flex flex-col gap-2.5 rounded-[6px] border border-white/[0.06] bg-[#111216] px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: color, boxShadow: color === "rgba(255,255,255,0.55)" ? "none" : `0 0 5px ${color}` }} />
        <span className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45`}>{label}</span>
      </div>
      <span style={SERIF} className="text-[36px] font-bold leading-none tracking-[-0.035em] tabular-nums text-white">{value}</span>
      {hint && <p className={`${MONO} mt-auto text-[10.5px] text-white/40`}>{hint}</p>}
    </div>
  );
}

function Chip({ active, onClick, count, children, dot }: { active?: boolean; onClick: () => void; count: number; children: React.ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MONO} inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-colors`}
      style={active ? { color: ACCENT, borderColor: "rgba(0,149,255,0.4)", background: ACCENT_DIM } : { color: "rgba(255,255,255,0.55)", borderColor: "rgba(255,255,255,0.08)", background: "#111216" }}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot, boxShadow: dot.startsWith("rgba(255") ? "none" : `0 0 5px ${dot}` }} />}
      <span>{children}</span>
      <span className="tabular-nums" style={{ color: active ? ACCENT : "rgba(255,255,255,0.35)" }}>{count}</span>
    </button>
  );
}

function ColHead({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <span className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 ${align === "right" ? "text-right" : ""}`}>{children}</span>;
}

function EmptyState() {
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-[#0F1114] px-8 py-16 text-center">
      <Gamepad2 className="mx-auto h-8 w-8 text-[#0095FF]" />
      <h3 className="mt-4 text-lg font-semibold text-white">No game servers yet</h3>
      <p className={`${MONO} mx-auto mt-2 max-w-[400px] text-[11.5px] leading-relaxed text-white/45`}>
        Deploy Minecraft, Rust, CS2 or FiveM in under two minutes — pick a plan and region and you get a connect address plus full panel access.
      </p>
      <Link href="/dashboard/services/game/deploy" className="mt-6 inline-flex h-10 items-center gap-2 rounded-[5px] border border-[#0095FF]/30 bg-[#0095FF] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#33adff]">
        <Plus className="h-4 w-4" /> Deploy your first server
      </Link>
    </div>
  );
}
