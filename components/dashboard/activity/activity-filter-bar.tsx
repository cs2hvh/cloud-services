import { Search, SlidersHorizontal, ArrowUp, ArrowDown } from "lucide-react";
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
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-4 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.18] focus:bg-white/[0.06] transition-all"
        />
      </div>

      {/* Type pills + sort */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SlidersHorizontal className="w-3.5 h-3.5 text-white/25 mr-1 flex-shrink-0" />
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterType(f.value)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all ${
                filterType === f.value
                  ? "bg-white/[0.12] text-white border border-white/[0.18]"
                  : "bg-white/[0.04] text-white/45 border border-white/[0.06] hover:text-white/70 hover:border-white/[0.12]"
              }`}
            >
              {f.label}
              {f.value !== "all" && (
                <span className="ml-1.5 opacity-55">
                  {stats[f.value as keyof ActivityStats]}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={onToggleSort}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium text-white/45 bg-white/[0.04] border border-white/[0.06] hover:text-white/70 hover:border-white/[0.12] transition-all whitespace-nowrap flex-shrink-0"
        >
          {sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {sortAsc ? "Oldest" : "Newest"}
        </button>
      </div>
    </div>
  );
}
