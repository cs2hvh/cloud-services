"use client";

// Unified Game Servers admin console — tabbed: Overview / Servers / Hosts /
// Games / Plans. Overview and Servers are new; Hosts and Plans reuse the
// existing self-contained editors.

import { useState } from "react";
import { BarChart3, Boxes, Gamepad2, Server, Tag } from "lucide-react";

import GameHostsAdmin from "@/components/admin/game/game-hosts-admin";
import GameTab from "@/components/admin/pricing/game-tab";
import OverviewTab from "@/components/admin/game/overview-tab";
import ServersTab from "@/components/admin/game/servers-tab";
import GamesTab from "@/components/admin/game/games-tab";

type Tab = "overview" | "servers" | "hosts" | "games" | "plans";

const TABS: { id: Tab; label: string; icon: typeof Server }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "servers", label: "Servers", icon: Boxes },
  { id: "hosts", label: "Hosts", icon: Server },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "plans", label: "Plans", icon: Tag },
];

export default function GameAdminConsole({ initialKillEnabled }: { initialKillEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6">
        <a href="/dashboard/admin" className="text-[12px] text-white/45 transition-colors hover:text-white">← Admin</a>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em]">Game Servers</h1>
        <p className="mt-1 text-[13.5px] text-white/50">Manage servers, machines, games and pricing across all regions.</p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.08]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[13px] font-medium transition-colors ${
                active ? "text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#0095FF]" />}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab onManageServers={() => setTab("servers")} />}
      {tab === "servers" && <ServersTab />}
      {tab === "hosts" && <GameHostsAdmin initialEnabled={initialKillEnabled} embedded />}
      {tab === "games" && <GamesTab />}
      {tab === "plans" && (
        <div className="rounded-[8px] border border-white/[0.08] bg-[#0a0a0a] p-1">
          <GameTab />
        </div>
      )}
    </div>
  );
}
