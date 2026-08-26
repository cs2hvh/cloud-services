import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS, type StatusTone } from "@admin/lib/chart-theme";

/**
 * KPI stat tile. A single current value with optional context — used in a
 * KPI row instead of one-bar charts.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  /** Small line under the value — a delta, a ratio, a clarifier. */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Colors the icon only; state is always also carried by the text. */
  tone?: StatusTone;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <Icon
            className={cn("h-4 w-4", !tone && "text-muted-foreground/70")}
            style={tone ? { color: STATUS[tone] } : undefined}
          />
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
