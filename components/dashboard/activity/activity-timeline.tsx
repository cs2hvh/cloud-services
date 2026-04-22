import { Activity } from "lucide-react";
import {
  getEventType,
  formatTimeAgo,
  formatShortDate,
  formatDayLabel,
  EVENT_STYLES,
  type ProjectLog,
} from "./activity.types";

/* ─── Single row ─── */
function LogRow({ log, isLast }: { log: ProjectLog; isLast: boolean }) {
  const type = getEventType(log.event);
  const style = EVENT_STYLES[type];
  const Icon = style.icon;

  return (
    <div
      className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors group ${
        !isLast ? "border-b border-white/[0.05]" : ""
      }`}
    >
      {/* Type dot + icon — neutral, no per-type color */}
      <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded bg-white/[0.05] border border-white/[0.07]">
        <Icon className="w-3.5 h-3.5 text-white/30" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
        {/* Colored dot — sole type signal */}
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mb-[1px] ${style.dot}`} />
        <div className="min-w-0">
          <span className={`text-[13px] font-medium leading-none ${style.label}`}>
            {log.event}
          </span>
          <span className="text-white/[0.06] mx-2 select-none">·</span>
          <span className="text-[13px] text-white/50 leading-none">{log.text}</span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
        <span className="text-[12px] text-white/30 group-hover:text-white/55 transition-colors tabular-nums whitespace-nowrap">
          {log.created_at ? formatTimeAgo(new Date(log.created_at)) : "—"}
        </span>
        <span className="text-[11px] text-white/18 hidden sm:block tabular-nums">
          {formatShortDate(log.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ─── Day group ─── */
function DayGroup({ dayLabel, items }: { dayLabel: string; items: ProjectLog[] }) {
  return (
    <div>
      {/* Day separator */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest whitespace-nowrap">
          {dayLabel}
        </span>
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[11px] text-white/20 tabular-nums">{items.length}</span>
      </div>

      {/* Rows card */}
      <div className="glass-panel overflow-hidden">
        {items.map((log, idx) => (
          <LogRow key={log.id} log={log} isLast={idx === items.length - 1} />
        ))}
      </div>
    </div>
  );
}

/* ─── Empty state ─── */
function EmptyState({ hasLogs }: { hasLogs: boolean }) {
  return (
    <div className="glass-panel flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.07] mb-4">
        <Activity className="w-5 h-5 text-white/20" />
      </div>
      <p className="text-[14px] font-medium text-white/40">
        {hasLogs ? "No events match your filters" : "No activity yet"}
      </p>
      {hasLogs && (
        <p className="text-[12px] text-white/25 mt-1.5">Try adjusting your search or filter</p>
      )}
    </div>
  );
}

/* ─── Timeline (groups + empty) ─── */
export function ActivityTimeline({
  paginated,
  totalLogs,
}: {
  paginated: ProjectLog[];
  totalLogs: number;
}) {
  if (paginated.length === 0) {
    return <EmptyState hasLogs={totalLogs > 0} />;
  }

  // Group by day on the fly
  const groups: { dayLabel: string; items: ProjectLog[] }[] = [];
  let currentLabel = "";
  for (const log of paginated) {
    const label = formatDayLabel(log.created_at);
    if (label !== currentLabel) {
      groups.push({ dayLabel: label, items: [log] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].items.push(log);
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(({ dayLabel, items }) => (
        <DayGroup key={dayLabel} dayLabel={dayLabel} items={items} />
      ))}
    </div>
  );
}
