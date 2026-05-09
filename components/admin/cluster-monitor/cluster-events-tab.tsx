"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import {
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/axios/axios";
import type { ClusterEvent } from "@/lib/services/kubernetes-monitor";

const EVENTS_PER_PAGE = 20;

function timeSince(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ClusterEventsTab() {
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [filtered, setFiltered] = useState<ClusterEvent[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasFetched = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/admin/cluster/events?limit=200");
      setEvents(res.data?.data ?? []);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchEvents();
    const interval = setInterval(fetchEvents, 30_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Get unique reasons for filter
  const uniqueReasons = Array.from(new Set(events.map((e) => e.reason)))
    .filter(Boolean)
    .sort();

  useEffect(() => {
    let result = [...events];
    if (reasonFilter !== "all") result = result.filter((e) => e.reason === reasonFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.involvedObjectName.toLowerCase().includes(q) ||
          e.namespace.toLowerCase().includes(q) ||
          e.reason.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
    setPage(1);
  }, [events, search, reasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / EVENTS_PER_PAGE));
  const pageItems = filtered.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE);

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-neutral-400">Loading cluster events…</p>
        </div>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div>
            <p className="text-white font-medium">Failed to load events</p>
            <p className="text-neutral-400 text-sm mt-1">{error}</p>
          </div>
          <Button variant="outline" onClick={fetchEvents} className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Critical Issues Banner ────────────────────────────────────────── */}
      {(() => {
        // Surface events with very high counts — these are almost always
        // symptoms of a real cluster problem being silently spammed.
        const critical = events.filter((e) => e.count > 100);
        if (critical.length === 0) return null;

        // Known issue hints
        const dnsBomb = critical.some((e) => e.reason === "DNSConfigForming");

        return (
          <div className="bg-red-950/25 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-red-300 font-semibold">
                  Critical Cluster Issues Detected
                </p>
                <p className="text-xs text-red-400/70 mt-0.5 mb-3">
                  The following events are occurring at abnormally high frequency — these are not noise, they indicate active cluster problems.
                </p>
                <div className="space-y-1.5">
                  {critical.slice(0, 5).map((e) => (
                    <div key={`${e.namespace}/${e.name}`} className="flex items-start gap-2 text-sm">
                      <span className="font-mono text-xs bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded shrink-0">
                        {e.reason}
                      </span>
                      <span className="text-red-200">
                        ×<strong>{e.count.toLocaleString()}</strong> — {e.involvedObjectKind} <span className="font-mono text-xs">{e.involvedObjectName}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {dnsBomb && (
                  <p className="text-xs text-amber-400/80 mt-3 border-t border-red-500/20 pt-3">
                    💡 <strong>DNSConfigForming spam</strong>: likely caused by too many nameservers in
                    <span className="font-mono"> resolv.conf</span> or a misconfigured CoreDNS ConfigMap.
                    Check node DNS config and CoreDNS logs.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Cluster Warning Events</h2>
          {lastUpdated && (
            <p className="text-sm text-neutral-400">
              Last updated: {lastUpdated.toLocaleTimeString("en-US")} · {filtered.length} events
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchEvents}
          disabled={loading}
          className="border-neutral-700 hover:bg-neutral-800"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search events…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-64 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
          />
        </div>

        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-sm focus:outline-none focus:border-neutral-500"
        >
          <option value="all">All reasons</option>
          {uniqueReasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Events list */}
      <div className="space-y-2">
        {pageItems.length === 0 && (
          <div className="flex items-center justify-center h-32 text-neutral-500">
            No events match your filters.
          </div>
        )}

        {pageItems.map((e, i) => (
          <motion.div
            key={`${e.namespace}/${e.name}-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-1">
                  <span className="text-sm font-medium text-yellow-400">{e.reason}</span>
                  <Badge variant="outline" className="text-xs text-neutral-400 border-neutral-700">
                    {e.namespace}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/20">
                    {e.involvedObjectKind}: {e.involvedObjectName}
                  </Badge>
                  {e.count > 1 && (
                    <span className="text-xs text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
                      ×{e.count}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-300 break-words">{e.message}</p>
                <p className="text-xs text-neutral-500 mt-1">{timeSince(e.lastTime)}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-neutral-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="border-neutral-700 hover:bg-neutral-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="border-neutral-700 hover:bg-neutral-800"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
