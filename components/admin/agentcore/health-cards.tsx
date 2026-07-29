"use client";

import { Activity, AlertTriangle, Box, DollarSign, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentcoreOverview } from "./types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Headline operational numbers, in the admin console's glass-panel style.
 *
 * Failure rate is over SETTLED runs, and the window is stated on the card —
 * these are the most recent N runs, not all history. A stat that quietly means
 * something narrower than it looks is worse than no stat.
 */
export function HealthCards({ overview }: { overview: AgentcoreOverview }) {
  const { health, stuck_runs, open_sandboxes, window: win } = overview;
  const leaked = open_sandboxes.filter((s) => s.leaked).length;
  const failureRate = health.failure_rate_pct;

  const cards = [
    {
      label: "Runs",
      value: String(health.total),
      hint: health.total >= win.run_limit ? `most recent ${win.run_limit}` : "in window",
      icon: Activity,
      accent: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400",
    },
    {
      label: "Failure rate",
      value: failureRate === null ? "—" : `${failureRate.toFixed(1)}%`,
      hint: `${health.failed} failed of settled`,
      icon: Percent,
      accent:
        (failureRate ?? 0) >= 10
          ? "from-red-500/20 to-orange-500/20 border-red-500/30 text-red-400"
          : "from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-400",
      danger: (failureRate ?? 0) >= 10,
    },
    {
      label: "Stuck runs",
      value: String(stuck_runs.length),
      hint: "in flight, heartbeat stale",
      icon: AlertTriangle,
      accent:
        stuck_runs.length > 0
          ? "from-red-500/20 to-orange-500/20 border-red-500/30 text-red-400"
          : "from-neutral-500/20 to-neutral-600/20 border-white/10 text-neutral-400",
      danger: stuck_runs.length > 0,
    },
    {
      label: "Open sandboxes",
      value: String(open_sandboxes.length),
      hint: leaked > 0 ? `${leaked} past idle deadline` : "billing per second",
      icon: Box,
      accent:
        leaked > 0
          ? "from-red-500/20 to-orange-500/20 border-red-500/30 text-red-400"
          : "from-purple-500/20 to-blue-500/20 border-purple-500/30 text-purple-400",
      danger: leaked > 0,
    },
    {
      label: "Run cost",
      value: money(health.cost_cents),
      hint: "in window",
      icon: DollarSign,
      accent: "from-amber-500/20 to-yellow-500/20 border-amber-500/30 text-amber-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl transition-colors hover:border-white/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-neutral-400">{card.label}</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums text-white",
                    card.danger && "text-red-400"
                  )}
                >
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
  );
}
