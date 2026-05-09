"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
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

export default function ActivityPage({ logs }: { logs: ProjectLog[] }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<EventType | "all">("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const stats: ActivityStats = useMemo(() => ({
    create: logs.filter((l) => getEventType(l.event) === "create").length,
    update: logs.filter((l) => getEventType(l.event) === "update").length,
    delete: logs.filter((l) => getEventType(l.event) === "delete").length,
    warn:   logs.filter((l) => getEventType(l.event) === "warn").length,
  }), [logs]);

  const filtered = useMemo(() => {
    const result = logs.filter((log) => {
      const matchesSearch =
        !search ||
        log.event.toLowerCase().includes(search.toLowerCase()) ||
        log.text.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filterType === "all" || getEventType(log.event) === filterType;
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
    <div className="w-full">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex items-center gap-3 mb-7"
      >
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
          <Activity className="w-4 h-4 text-white/60" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold text-white leading-tight">Activity Log</h1>
          <p className="text-[12px] text-white/35 leading-tight mt-0.5">
            {logs.length} event{logs.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.06 }}
      >
        <ActivityStatsBar stats={stats} />
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.1 }}
      >
        <ActivityFilterBar
          search={search}
          onSearch={(v) => { setSearch(v); resetPage(); }}
          filterType={filterType}
          onFilterType={(v) => { setFilterType(v); resetPage(); }}
          sortAsc={sortAsc}
          onToggleSort={() => { setSortAsc((v) => !v); resetPage(); }}
          stats={stats}
        />
      </motion.div>

      {/* Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.14 }}
      >
        <ActivityTimeline paginated={paginated} totalLogs={logs.length} />
      </motion.div>

      {/* Pagination */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <ActivityPagination
          page={page}
          totalPages={totalPages}
          totalFiltered={filtered.length}
          onPage={setPage}
        />
      </motion.div>

    </div>
  );
}
