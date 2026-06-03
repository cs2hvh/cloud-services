"use client";

import { useState, useMemo } from "react";
import { ActivityStatsBar } from "./activity-stats-bar";
import { ActivityFilterBar } from "./activity-filter-bar";
import { ActivityTimeline } from "./activity-timeline";
import { ActivityPagination } from "./activity-pagination";
import {
  PAGE_SIZE,
  getEventType,
  type ProjectLog,
  type EventType,
  type ActivityStats,
} from "./activity.types";

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

export default function ActivityPage({ logs }: { logs: ProjectLog[] }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<EventType | "all">("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const stats: ActivityStats = useMemo(
    () => ({
      create: logs.filter((l) => getEventType(l.event) === "create").length,
      update: logs.filter((l) => getEventType(l.event) === "update").length,
      delete: logs.filter((l) => getEventType(l.event) === "delete").length,
      warn: logs.filter((l) => getEventType(l.event) === "warn").length,
    }),
    [logs],
  );

  const filtered = useMemo(() => {
    const result = logs.filter((log) => {
      const matchesSearch =
        !search ||
        log.event.toLowerCase().includes(search.toLowerCase()) ||
        log.text.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        filterType === "all" || getEventType(log.event) === filterType;
      return matchesSearch && matchesFilter;
    });
    return [...result].sort((a, b) => {
      const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortAsc ? aT - bT : bT - aT;
    });
  }, [logs, search, filterType, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const resetPage = () => setPage(1);

  return (
    <div className="min-w-0">
      {/* Hero */}
      <h1 className="text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold mb-2">
        Activity{" "}
        <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
          log
        </span>
      </h1>
      <p
        className={`${MONO} max-w-xl text-[11.5px] text-white/45 leading-relaxed mb-10`}
      >
        {logs.length} event{logs.length !== 1 ? "s" : ""} recorded across your
        infrastructure.
      </p>

      <ActivityStatsBar stats={stats} />

      <ActivityFilterBar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          resetPage();
        }}
        filterType={filterType}
        onFilterType={(v) => {
          setFilterType(v);
          resetPage();
        }}
        sortAsc={sortAsc}
        onToggleSort={() => {
          setSortAsc((v) => !v);
          resetPage();
        }}
        stats={stats}
      />

      <ActivityTimeline paginated={paginated} totalLogs={logs.length} />

      <ActivityPagination
        page={page}
        totalPages={totalPages}
        totalFiltered={filtered.length}
        onPage={setPage}
      />
    </div>
  );
}
