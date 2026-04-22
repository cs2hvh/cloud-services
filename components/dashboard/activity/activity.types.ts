import { Plus, Trash2, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";

export type ProjectLog = Tables<"project_logs">;

export type EventType = "create" | "delete" | "update" | "warn" | "other";

export const PAGE_SIZE = 20;

/* ─── Event classification ─── */
export function getEventType(event: string): EventType {
  const l = event.toLowerCase();
  if (l.includes("delete") || l.includes("removed") || l.includes("terminated") || l.includes("destroy"))
    return "delete";
  if (l.includes("create") || l.includes("deploy") || l.includes("add") || l.includes("launch") || l.includes("provision"))
    return "create";
  if (l.includes("update") || l.includes("edit") || l.includes("change") || l.includes("resize") || l.includes("scale") || l.includes("restart"))
    return "update";
  if (l.includes("warn") || l.includes("suspend") || l.includes("throttl") || l.includes("limit") || l.includes("fail"))
    return "warn";
  return "other";
}

/* ─── Per-type visual config ─── */
export const EVENT_STYLES: Record<
  EventType,
  { badge: string; iconColor: string; icon: React.ElementType; glow: string; iconBg: string }
> = {
  create: {
    badge: "bg-emerald-500/[0.12] text-emerald-400 border border-emerald-500/20",
    iconColor: "#34d399",
    icon: Plus,
    glow: "rgba(52,211,153,0.07)",
    iconBg: "rgba(52,211,153,0.14)",
  },
  delete: {
    badge: "bg-red-500/[0.12] text-red-400 border border-red-500/20",
    iconColor: "#f87171",
    icon: Trash2,
    glow: "rgba(248,113,113,0.06)",
    iconBg: "rgba(248,113,113,0.14)",
  },
  update: {
    badge: "bg-blue-500/[0.12] text-blue-400 border border-blue-500/20",
    iconColor: "#60a5fa",
    icon: RefreshCw,
    glow: "rgba(96,165,250,0.06)",
    iconBg: "rgba(96,165,250,0.14)",
  },
  warn: {
    badge: "bg-amber-500/[0.12] text-amber-400 border border-amber-500/20",
    iconColor: "#fbbf24",
    icon: AlertTriangle,
    glow: "rgba(251,191,36,0.06)",
    iconBg: "rgba(251,191,36,0.14)",
  },
  other: {
    badge: "bg-white/[0.07] text-white/50 border border-white/[0.09]",
    iconColor: "rgba(255,255,255,0.35)",
    icon: Zap,
    glow: "rgba(255,255,255,0.02)",
    iconBg: "rgba(255,255,255,0.07)",
  },
};

/* ─── Date helpers ─── */
export function formatTimeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayLabel(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/* ─── Filter config ─── */
export const TYPE_FILTERS: { label: string; value: EventType | "all" }[] = [
  { label: "All",      value: "all" },
  { label: "Created",  value: "create" },
  { label: "Updated",  value: "update" },
  { label: "Deleted",  value: "delete" },
  { label: "Warnings", value: "warn" },
];

export type ActivityStats = {
  create: number;
  update: number;
  delete: number;
  warn: number;
};
