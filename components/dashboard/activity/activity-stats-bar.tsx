import type { ActivityStats } from "./activity.types";

const STATS: { label: string; key: keyof ActivityStats; dot: string }[] = [
  { label: "Created",  key: "create", dot: "bg-emerald-500/70" },
  { label: "Updated",  key: "update", dot: "bg-sky-500/70" },
  { label: "Deleted",  key: "delete", dot: "bg-red-500/70" },
  { label: "Warnings", key: "warn",   dot: "bg-amber-500/70" },
];

export function ActivityStatsBar({ stats }: { stats: ActivityStats }) {
  return (
    <div className="glass-panel overflow-hidden mb-5">
      <div className="grid grid-cols-4 divide-x divide-white/[0.06]">
        {STATS.map(({ label, key, dot }) => (
          <div key={key} className="flex flex-col justify-center px-5 py-4 gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-[11px] text-white/35 uppercase tracking-wider">{label}</span>
            </div>
            <span className="text-[22px] font-semibold tabular-nums leading-none text-white/90 pl-0.5">
              {stats[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
