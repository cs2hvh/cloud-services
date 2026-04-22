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
      className={`flex items-start gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors group ${
        !isLast ? "border-b border-white/[0.04]" : ""
      }`}
      style={{
        background: `linear-gradient(90deg, ${style.glow} 0%, transparent 35%)`,
      }}
    >
      {/* Icon bubble */}
      <div
        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg mt-0.5"
        style={{ background: style.iconBg }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: style.iconColor }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${style.badge}`}
        >
          {log.event}
        </span>
        <p className="text-[13px] text-white/65 leading-relaxed">{log.text}</p>
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 flex flex-col items-end gap-0.5 min-w-[80px]">
        <span className="text-[12px] text-white/40 group-hover:text-white/60 transition-colors tabular-nums">
          {log.created_at ? formatTimeAgo(new Date(log.created_at)) : "—"}
        </span>
        <span className="text-[11px] text-white/20 hidden sm:block tabular-nums">
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
