"use client";

import { useState } from "react";
import { ChartNoAxesCombined, Radar } from "lucide-react";
import HqBoard from "@admin/components/monitor/hq-board";
import AnalyticsView from "@admin/components/monitor/analytics-view";

const TABS = [
  { id: "map", label: "Live map", icon: Radar },
  { id: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MonitorTabs({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<TabId>(initialTab === "analytics" ? "analytics" : "map");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="font-heading text-xl font-semibold tracking-tight">HQ Monitor</h1>
          <div className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-[#3987e5]/60 bg-[#3987e5]/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">
          {tab === "map"
            ? "people → apps → services → billing · nodes are clickable · drag to rearrange"
            : "30-day money, growth and ops — aggregated server-side"}
        </p>
      </div>
      {/* Both stay mounted so switching tabs during a demo is instant and
          polling state survives the flip. */}
      <div className={tab === "map" ? "" : "hidden"}>
        <HqBoard />
      </div>
      <div className={tab === "analytics" ? "" : "hidden"}>
        <AnalyticsView />
      </div>
    </div>
  );
}
