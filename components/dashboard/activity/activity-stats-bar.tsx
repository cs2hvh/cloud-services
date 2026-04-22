import type { ActivityStats } from "./activity.types";

const STATS: { label: string; key: keyof ActivityStats; color: string }[] = [
  { label: "Created",  key: "create", color: "text-emerald-400" },
  { label: "Updated",  key: "update", color: "text-blue-400" },
  { label: "Deleted",  key: "delete", color: "text-red-400" },
  { label: "Warnings", key: "warn",   color: "text-amber-400" },
];

export function ActivityStatsBar({ stats }: { stats: ActivityStats }) {
  return (
    <div className="glass-panel overflow-hidden mb-5">
      <div className="grid grid-cols-4 divide-x divide-white/[0.06]">
        {STATS.map(({ label, key, color }) => (
          <div key={key} className="flex flex-col items-center justify-center px-4 py-4">
            <span className={`text-[22px] font-bold tabular-nums leading-none ${color}`}>
              {stats[key]}
            </span>
            <span className="text-[11px] text-white/35 mt-1.5 uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
