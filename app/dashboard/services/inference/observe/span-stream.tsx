'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ColHead,
  DataTable,
  EmptyState,
  FilterChip,
  GhostButton,
  MONO,
} from '@/components/dashboard/inference/chrome';
import { GuardrailBadge, SpanTypeBadge, StatusBadge } from './_badges';
import { formatCost, formatLatency, formatTokens, relativeTime } from './_helpers';
import type { SpanCounts, StreamPeriod, TraceRow } from './_types';

const PAGE_SIZE = 25;

const STREAM_PERIODS: { value: StreamPeriod; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: '24h',  label: '24h' },
  { value: '7d',   label: '7d' },
  { value: '30d',  label: '30d' },
];

const TABLE_GRID =
  'grid-cols-[minmax(0,0.8fr)_minmax(0,0.4fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.4fr)_minmax(0,0.5fr)_minmax(0,0.6fr)]';

interface Props {
  visibleRows: TraceRow[];
  allRowCount: number;
  loading: boolean;
  filter: string;
  modelSearch: string;
  counts: SpanCounts;
  streamPeriod: StreamPeriod;
  onFilterChange: (f: string) => void;
  onModelSearchChange: (s: string) => void;
  onStreamPeriodChange: (p: StreamPeriod) => void;
  onRowClick: (row: TraceRow) => void;
}

export function SpanStream({
  visibleRows, allRowCount, loading,
  filter, modelSearch, counts, streamPeriod,
  onFilterChange, onModelSearchChange, onStreamPeriodChange, onRowClick,
}: Props) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever filters change — callers pass new values which
  // cause re-render; we track via a derived key rather than an effect.
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = (f: string) => { setPage(1); onFilterChange(f); };
  const handleSearchChange = (s: string) => { setPage(1); onModelSearchChange(s); };

  return (
    <section>
      {/* Section header — period tabs on the right */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}>Stream</p>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
            Recent{' '}
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} className="text-white/55 font-normal">
              spans
            </span>
            <span className="text-white/55 font-normal">.</span>
          </h2>
        </div>

        {/* Period selector — same pill style as analytics card */}
        <div className="flex items-center gap-1">
          {STREAM_PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPage(1); onStreamPeriodChange(p.value); }}
              className={`${MONO} text-[9.5px] px-2.5 py-1 rounded transition-colors ${
                streamPeriod === p.value
                  ? 'bg-[#0095FF]/15 text-[#0095FF]/80 border border-[#0095FF]/20'
                  : 'text-white/30 hover:text-white/55 border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter chips + model search */}
      <div className="flex flex-wrap items-center gap-2 mb-3 min-h-[28px]">
        {!loading && allRowCount > 0 && (
          <>
            <FilterChip label="All" active={filter === 'All'} onClick={() => handleFilterChange('All')} />
            {Object.entries(counts.byType).map(([type, count]) => (
              <FilterChip
                key={type}
                label={`${type} (${count})`}
                active={filter === type}
                onClick={() => handleFilterChange(type)}
              />
            ))}
            {counts.blocked > 0 && (
              <FilterChip
                label={`blocked (${counts.blocked})`}
                active={filter === 'blocked'}
                onClick={() => handleFilterChange('blocked')}
              />
            )}
            {counts.errors > 0 && (
              <FilterChip
                label={`errors (${counts.errors})`}
                active={filter === 'errors'}
                onClick={() => handleFilterChange('errors')}
              />
            )}
          </>
        )}
        <input
          type="text"
          placeholder="Filter by model…"
          value={modelSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={`${MONO} h-7 px-3 text-[10.5px] rounded-[4px] bg-white/[0.03] border border-white/[0.06] text-white/65 placeholder:text-white/25 focus:outline-none focus:border-white/20 w-44 transition-colors`}
        />
      </div>

      {/* Table */}
      {loading ? (
        <DataTable>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`hidden md:grid ${TABLE_GRID} gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center`}
            >
              {[64, 40, 128, 64, 48, 40, 40, 48, 56].map((w, j) => (
                <div key={j} className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: w }} />
              ))}
            </div>
          ))}
        </DataTable>
      ) : pageRows.length > 0 ? (
        <DataTable>
          <div className={`hidden md:grid ${TABLE_GRID} gap-3 px-5 py-2 border-b border-white/[0.04]`}>
            <ColHead>Time</ColHead>
            <ColHead>Type</ColHead>
            <ColHead>Model</ColHead>
            <ColHead>Tokens (in/out)</ColHead>
            <ColHead>Latency</ColHead>
            <ColHead>TTFT</ColHead>
            <ColHead>Cost</ColHead>
            <ColHead>Guardrail</ColHead>
            <ColHead>Status</ColHead>
          </div>

          {pageRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 gap-1.5 px-5 py-2.5 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.015] transition-colors cursor-pointer md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.4fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.4fr)_minmax(0,0.5fr)_minmax(0,0.6fr)] md:items-center"
              onClick={() => onRowClick(row)}
            >
              <span className={`${MONO} text-[10.5px] text-white/45`}>{relativeTime(row.created_at)}</span>
              <SpanTypeBadge name={row.name} />
              <span className={`${MONO} text-[10.5px] text-white/65 truncate`}>{row.model_id ?? '—'}</span>
              <span className={`${MONO} text-[10.5px] text-white/50 tabular-nums`}>
                {formatTokens(row.input_tokens, row.output_tokens)}
              </span>
              <span className={`${MONO} text-[10.5px] tabular-nums ${row.latency_ms != null && row.latency_ms > 5000 ? 'text-amber-400/70' : 'text-white/55'}`}>
                {formatLatency(row.latency_ms)}
              </span>
              <span className={`${MONO} text-[10.5px] text-white/45 tabular-nums`}>{formatLatency(row.ttft_ms)}</span>
              <span className={`${MONO} text-[10.5px] text-white/50 tabular-nums`}>{formatCost(row.cost_cents)}</span>
              <GuardrailBadge action={row.guardrail_action} />
              <StatusBadge status={row.status} />
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between">
              <span className={`${MONO} text-[10px] text-white/30 tabular-nums`}>
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visibleRows.length)} of {visibleRows.length}
              </span>
              <div className="flex items-center gap-1">
                <GhostButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
                  <ChevronLeft className="h-3 w-3" />
                  Prev
                </GhostButton>
                <span className={`${MONO} text-[10px] text-white/30 px-2 tabular-nums`}>
                  {safePage} / {totalPages}
                </span>
                <GhostButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                  Next
                  <ChevronRight className="h-3 w-3" />
                </GhostButton>
              </div>
            </div>
          )}
        </DataTable>
      ) : allRowCount === 0 ? (
        <EmptyState
          title="No trace spans yet"
          description="Spans are emitted for every /v1/* gateway request. Make an inference call via the Playground or your API key to see traces here."
        />
      ) : (
        <EmptyState
          title={`No ${filter === 'All' ? '' : `"${filter}" `}spans match`}
          description={
            modelSearch
              ? `No spans for model matching "${modelSearch}". Clear the search or try a different filter.`
              : `No "${filter}" spans in the ${allRowCount} loaded rows.`
          }
        />
      )}
    </section>
  );
}
