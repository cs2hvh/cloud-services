"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CatalogFilter, CatalogSummary } from "./types";

/**
 * The four numbers an operator needs before reading any row, doubling as the
 * table's filter. Clicking "At or below cost" is the fastest path from "is
 * anything wrong?" to "show me exactly which models".
 */
const CARDS: Array<{ key: CatalogFilter; label: string; hint: string; pick: (s: CatalogSummary) => number; tone?: "bad" | "warn" }> = [
  { key: "all", label: "Active models", hint: "in the catalog", pick: (s) => s.active },
  { key: "loss", label: "At or below cost", hint: "losing money per call", pick: (s) => s.at_or_below_cost, tone: "bad" },
  { key: "thin", label: "Thin margin", hint: "under 20%", pick: (s) => s.thin_margin, tone: "warn" },
  // Deliberately separate from "No cost basis": these carry real prices
  // (3c/image, 2c/page), they just aren't comparable on a token basis.
  { key: "unit", label: "Per-unit SKUs", hint: "priced, not token-based", pick: (s) => s.per_unit },
  { key: "unknown", label: "No cost basis", hint: "margin unknowable", pick: (s) => s.cost_unknown },
];

export function SummaryCards({
  summary,
  active,
  onSelect,
}: {
  summary: CatalogSummary;
  active: CatalogFilter;
  onSelect: (filter: CatalogFilter) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {CARDS.map((card) => {
        const value = card.pick(summary);
        const isActive = active === card.key;
        const emphasise = value > 0 && card.tone;
        return (
          <Card
            key={card.key}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(isActive && card.key !== "all" ? "all" : card.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(isActive && card.key !== "all" ? "all" : card.key);
              }
            }}
            className={cn(
              "cursor-pointer rounded-2xl border-white/10 bg-black/40 backdrop-blur-xl transition-colors hover:border-white/25",
              isActive && "border-purple-500/50 ring-1 ring-purple-500/30"
            )}
          >
            <CardContent className="p-4">
              <div className="text-xs text-neutral-400">{card.label}</div>
              <div
                className={cn(
                  "mt-1 text-2xl font-semibold tabular-nums text-white",
                  emphasise === "bad" && "text-red-400",
                  emphasise === "warn" && "text-amber-400"
                )}
              >
                {value}
              </div>
              <div className="text-xs text-neutral-500">{card.hint}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
