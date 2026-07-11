"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, DollarSign, Loader2, PauseCircle, Server } from "lucide-react";

import { GAME_ICONS, GAME_LABELS } from "@/components/dashboard/game/types";

interface Overview {
  totals: {
    servers: number;
    active: number;
    suspended: number;
    failed: number;
    provisioning: number;
    hosts: number;
    hostsOnline: number;
    mrr: number;
  };
  byGame: Record<string, number>;
  byRegion: Record<string, number>;
  regions: Array<{
    region: string;
    displayRegion: string;
    hosts: number;
    online: number;
    usedMemoryMB: number;
    totalMemoryMB: number;
    utilization: number;
  }>;
}

function Stat({ icon: Icon, label, value, tint }: { icon: typeof Server; label: string; value: string; tint: string }) {
  return (
    <div className="border border-white/[0.08] bg-[#111216] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${tint}22`, color: tint }}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
          <p className="mt-0.5 text-xl font-semibold text-white tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function OverviewTab({ onManageServers }: { onManageServers: () => void }) {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetch("/api/admin/game/overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setData(d))
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-white/40">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const t = data.totals;
  const games = Object.entries(data.byGame).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat icon={Server} label="Servers" value={String(t.servers)} tint="#0095FF" />
        <Stat icon={Activity} label="Active" value={String(t.active)} tint="#4ade80" />
        <Stat icon={PauseCircle} label="Suspended" value={String(t.suspended)} tint="#fbbf24" />
        <Stat icon={AlertTriangle} label="Failed" value={String(t.failed)} tint="#f87171" />
        <Stat icon={DollarSign} label="MRR (est.)" value={`$${t.mrr.toFixed(2)}`} tint="#33adff" />
        <Stat icon={Server} label="Hosts online" value={`${t.hostsOnline}/${t.hosts}`} tint="#a78bfa" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Region capacity */}
        <div className="border border-white/[0.08] bg-[#111216] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Region capacity (RAM)</p>
          <div className="mt-4 space-y-3.5">
            {data.regions.length === 0 && <p className="text-[13px] text-white/35">No hosts online yet.</p>}
            {data.regions.map((r) => (
              <div key={r.region}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="text-white/80">
                    {r.displayRegion} <span className="text-white/35">· {r.online}/{r.hosts} online</span>
                  </span>
                  <span className="tabular-nums text-white/50">
                    {(r.usedMemoryMB / 1024).toFixed(0)}/{(r.totalMemoryMB / 1024).toFixed(0)} GB · {r.utilization}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.utilization}%`,
                      background: r.utilization > 85 ? "#f87171" : r.utilization > 65 ? "#fbbf24" : "#0095FF",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Servers by game */}
        <div className="border border-white/[0.08] bg-[#111216] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Servers by game</p>
            <button onClick={onManageServers} className="text-[11.5px] text-[#82adfb] hover:underline">
              Manage all →
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {games.length === 0 && <p className="text-[13px] text-white/35">No servers yet.</p>}
            {games.map(([game, count]) => {
              const pct = t.servers > 0 ? Math.round((count / t.servers) * 100) : 0;
              return (
                <div key={game} className="flex items-center gap-3">
                  <span className="w-6 text-center text-base">{GAME_ICONS[game] ?? "🎮"}</span>
                  <span className="w-28 text-[13px] text-white/70">{GAME_LABELS[game] ?? game}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-[#0095FF]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-[12.5px] tabular-nums text-white/60">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
