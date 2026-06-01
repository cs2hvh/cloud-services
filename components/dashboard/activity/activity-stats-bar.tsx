import type { ActivityStats } from "./activity.types";

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const STATS: {
  label: string;
  key: keyof ActivityStats;
  color: string;
}[] = [
  { label: "Created", key: "create", color: "#4ade80" },
  { label: "Updated", key: "update", color: "#0095FF" },
  { label: "Deleted", key: "delete", color: "#f87171" },
  { label: "Warnings", key: "warn", color: "#fbbf24" },
];

export function ActivityStatsBar({ stats }: { stats: ActivityStats }) {
  return (
    <section className="mb-8 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
      {STATS.map(({ label, key, color }) => (
        <div key={key} className="px-5 py-5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span
              className="h-1 w-1 rounded-full shrink-0"
              style={{ background: color, boxShadow: `0 0 5px ${color}` }}
            />
            <span
              className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
            >
              {label}
            </span>
          </div>
          <span
            style={SERIF_STYLE}
            className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
          >
            {stats[key]}
          </span>
        </div>
      ))}
    </section>
  );
}
