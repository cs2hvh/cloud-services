import { Plus, Trash2, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import type { Tables } from "@/lib/supabase/types";
import type React from "react";

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
  { dot: string; label: string; icon: React.ElementType }
> = {
  create: {
    dot: "bg-emerald-500/70",
    label: "text-emerald-400/90",
    icon: Plus,
  },
  delete: {
    dot: "bg-red-500/70",
    label: "text-red-400/90",
    icon: Trash2,
  },
  update: {
    dot: "bg-sky-500/70",
    label: "text-sky-400/90",
    icon: RefreshCw,
  },
  warn: {
    dot: "bg-amber-500/70",
    label: "text-amber-400/90",
    icon: AlertTriangle,
  },
  other: {
    dot: "bg-white/25",
    label: "text-white/50",
    icon: Zap,
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
