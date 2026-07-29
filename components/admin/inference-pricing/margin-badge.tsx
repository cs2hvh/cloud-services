import { Badge } from "@/components/ui/badge";
import { priceTone } from "@/lib/admin/inference-pricing";

/**
 * The margin readout. Severity comes from priceTone() — the same function the
 * summary counts with — so a row can never disagree with the header above it.
 * "Cost unknown" is deliberately not styled as a problem: it means we can't
 * judge, not that the price is wrong.
 */
export function MarginBadge({ margin, costKnown }: { margin: number | null; costKnown: boolean }) {
  const tone = priceTone(margin, costKnown);

  if (tone === "unknown") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        cost unknown
      </Badge>
    );
  }

  const label = `${margin!.toFixed(0)}%`;
  if (tone === "loss") return <Badge variant="destructive" className="tabular-nums">{label}</Badge>;
  if (tone === "thin") {
    return (
      <Badge variant="secondary" className="tabular-nums bg-amber-500/15 text-amber-600 dark:text-amber-400">
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="tabular-nums bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      {label}
    </Badge>
  );
}
