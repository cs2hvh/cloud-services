import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CirclePause,
  CircleAlert,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import { STATUS } from "@admin/lib/chart-theme";

/** Icon + label + reserved status color — state never rides on color alone. */
const MAP: Record<string, { icon: LucideIcon; color: string; label: string }> =
  {
    running: { icon: CircleCheck, color: STATUS.good, label: "Running" },
    provisioning: {
      icon: CircleDashed,
      color: STATUS.warning,
      label: "Provisioning",
    },
    stopped: { icon: CircleMinus, color: STATUS.neutral, label: "Stopped" },
    suspended: { icon: CirclePause, color: STATUS.warning, label: "Suspended" },
    failed: { icon: CircleAlert, color: STATUS.critical, label: "Failed" },
    error: { icon: CircleAlert, color: STATUS.critical, label: "Error" },
  };

export function StatusBadge({ status }: { status: string }) {
  const meta = MAP[status] ?? {
    icon: CircleHelp,
    color: STATUS.neutral,
    label: status,
  };
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2 py-0.5 text-xs">
      <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
      {meta.label}
    </span>
  );
}
