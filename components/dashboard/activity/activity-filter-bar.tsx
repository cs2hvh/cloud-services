import { Search, ArrowUp, ArrowDown } from "lucide-react";
import { TYPE_FILTERS, type EventType, type ActivityStats } from "./activity.types";

interface ActivityFilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  filterType: EventType | "all";
  onFilterType: (v: EventType | "all") => void;
  sortAsc: boolean;
  onToggleSort: () => void;
  stats: ActivityStats;
}

export function ActivityFilterBar({
  search,
  onSearch,
  filterType,
  onFilterType,
  sortAsc,
  onToggleSort,
  stats,
}: ActivityFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 mb-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by event or description…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-sm pl-10 pr-4 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.16] focus:bg-white/[0.06] transition-all"
        />
      </div>

      {/* Type tabs + sort */}
      <div className="flex items-center justify-between gap-4">
        {/* Tab-style filter — underline on active, text-only hover */}
        <div className="flex items-center border-b border-white/[0.07] gap-0">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterType(f.value)}
              className={`relative px-3.5 py-1.5 text-[12px] font-medium transition-colors -mb-px ${
                filterType === f.value
                  ? "text-white border-b border-white/70"
                  : "text-white/38 hover:text-white/65 border-b border-transparent"
              }`}
            >
              {f.label}
              {f.value !== "all" && stats[f.value as keyof ActivityStats] > 0 && (
                <span className={`ml-1.5 text-[11px] tabular-nums ${filterType === f.value ? "text-white/50" : "text-white/25"}`}>
                  {stats[f.value as keyof ActivityStats]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sort — plain text button */}
        <button
          onClick={onToggleSort}
          className="flex items-center gap-1.5 text-[12px] font-medium text-white/35 hover:text-white/65 transition-colors whitespace-nowrap flex-shrink-0"
        >
          {sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {sortAsc ? "Oldest first" : "Newest first"}
        </button>
      </div>
    </div>
  );
}
