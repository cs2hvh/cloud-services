import { Activity } from "lucide-react";
import {
  getEventType,
  formatTimeAgo,
  formatShortDate,
  formatDayLabel,
  EVENT_STYLES,
  type ProjectLog,
} from "./activity.types";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

/* ─── Single row ─── */
function LogRow({ log, isLast }: { log: ProjectLog; isLast: boolean }) {
  const type = getEventType(log.event);
  const style = EVENT_STYLES[type];
  const Icon = style.icon;

  return (
    <div
      className={`flex items-center gap-4 px-5 py-3 hover:bg-white/[0.015] transition-colors group ${
        !isLast ? "border-b border-white/[0.04]" : ""
      }`}
    >
      {/* Icon tile */}
      <div className="h-7 w-7 shrink-0 inline-flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] rounded-[5px] text-white/45">
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`}
        />
        <div className="min-w-0">
          <span
            className={`text-[12.5px] font-medium leading-none ${style.label}`}
          >
            {log.event}
          </span>
          <span className="text-white/15 mx-2 select-none">·</span>
          <span className="text-[12.5px] text-white/55 leading-none">
            {log.text}
          </span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
        <span
          className={`${MONO} text-[11px] text-white/40 group-hover:text-white/65 transition-colors tabular-nums whitespace-nowrap`}
        >
          {log.created_at ? formatTimeAgo(new Date(log.created_at)) : "—"}
        </span>
        <span
          className={`${MONO} text-[10px] text-white/25 hidden sm:block tabular-nums`}
        >
          {formatShortDate(log.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ─── Day group ─── */
function DayGroup({
  dayLabel,
  items,
}: {
  dayLabel: string;
  items: ProjectLog[];
}) {
  return (
    <div>
      {/* Day separator */}
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`${MONO} text-[10px] font-semibold text-white/35 uppercase tracking-[0.14em] whitespace-nowrap`}
        >
          {dayLabel}
        </span>
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span
          className={`${MONO} text-[10px] text-white/30 tabular-nums`}
        >
          {items.length}
        </span>
      </div>

      {/* Rows card */}
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
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
    <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-14 text-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)",
        }}
      />
      <div
        className="relative z-10 h-12 w-12 mb-5 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
        style={{ color: ACCENT }}
      >
        <Activity className="h-5 w-5" />
      </div>
      <h3 className="relative z-10 text-[16px] font-semibold tracking-[-0.015em] text-white">
        {hasLogs ? "No events match your filters" : "No activity yet"}
      </h3>
      {hasLogs && (
        <p
          className={`${MONO} relative z-10 mt-2 text-[11px] text-white/45`}
        >
          Try adjusting your search or filter
        </p>
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

  // Group by day
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
