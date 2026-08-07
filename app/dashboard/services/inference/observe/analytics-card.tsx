'use client';

import {
  ColHead,
  MONO,
  SectionHead,
} from '@/components/dashboard/inference/chrome';
import { SpanTypeBadge } from './_badges';
import { formatCost, formatLatency } from './_helpers';
import type { Analytics, AnalyticsGroupBy, Period } from './_types';

const GROUP_COL_LABEL: Record<AnalyticsGroupBy, string> = {
  model:          'Model',
  prompt_version: 'Prompt Version',
  name:           'Span Type',
  key:            'API Key',
};

const GROUP_BY_OPTIONS: { value: AnalyticsGroupBy; label: string }[] = [
  { value: 'model',          label: 'by model' },
  { value: 'prompt_version', label: 'by prompt' },
  { value: 'name',           label: 'by type' },
  { value: 'key',            label: 'by key' },
];

const PERIODS: Period[] = ['24h', '7d', '30d'];

// Group | Type | Requests | Cost | Avg/p95 latency | Errors
const GRID = 'grid-cols-[minmax(0,1.2fr)_minmax(0,0.4fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)]';

interface Props {
  analytics: Analytics | null;
  loading: boolean;
  period: Period;
  groupBy: AnalyticsGroupBy;
  onPeriodChange: (p: Period) => void;
  onGroupByChange: (g: AnalyticsGroupBy) => void;
}

export function AnalyticsCard({ analytics, loading, period, groupBy, onPeriodChange, onGroupByChange }: Props) {
  return (
    <section className="mb-20">
      <SectionHead eyebrow="Analytics" title="Breakdown" accent="requests · cost · latency" />

      <div className="border border-white/[0.06] rounded-[6px] overflow-hidden bg-[#111216]">

        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.015] flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}>
              {loading
                ? 'Loading…'
                : analytics
                ? `${analytics.totals.requests.toLocaleString()} spans`
                : 'No data'}
            </span>
            <div className="flex items-center gap-0.5">
              {GROUP_BY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onGroupByChange(opt.value)}
                  className={`${MONO} text-[9px] px-2.5 py-1 rounded-[3px] transition-colors ${
                    groupBy === opt.value
                      ? 'bg-white/[0.07] text-white/65'
                      : 'text-white/22 hover:text-white/45'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`${MONO} text-[9.5px] px-2.5 py-1 rounded transition-colors ${
                  period === p
                    ? 'bg-[#0095FF]/15 text-[#0095FF]/80 border border-[#0095FF]/20'
                    : 'text-white/30 hover:text-white/55 border border-transparent'
                }`}
              >
                {p}
              </button>
            ))}
            {analytics?.capped && (
              <span className={`${MONO} text-[9px] text-amber-400/50 ml-2`}>sampled 2k</span>
            )}
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`hidden md:grid ${GRID} gap-3 px-5 py-3 border-b border-white/[0.03] last:border-b-0 items-center`}
              >
                {[160, 50, 40, 40, 70, 40].map((w, j) => (
                  <div key={j} className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: w }} />
                ))}
              </div>
            ))}
          </>
        ) : analytics && analytics.by_group.length > 0 ? (
          <>
            {/* Column headers */}
            <div className={`hidden md:grid ${GRID} gap-3 px-5 py-2 border-b border-white/[0.04]`}>
              <ColHead>{GROUP_COL_LABEL[groupBy]}</ColHead>
              <ColHead>Type</ColHead>
              <ColHead>Requests</ColHead>
              <ColHead>Cost</ColHead>
              <ColHead>Avg / p95 latency</ColHead>
              <ColHead>Errors</ColHead>
            </div>

            {analytics.by_group.slice(0, 10).map((g) => (
              <div
                key={g.key}
                className="grid grid-cols-1 gap-1 px-5 py-2.5 border-b border-white/[0.03] last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.4fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)] md:items-center hover:bg-white/[0.012] transition-colors"
              >
                <span className={`${MONO} text-[10.5px] text-white/70 truncate`}>{g.label}</span>
                <SpanTypeBadge name={g.name} />
                <span className={`${MONO} text-[10.5px] text-white/55 tabular-nums`}>{g.requests.toLocaleString()}</span>
                <span className={`${MONO} text-[10.5px] text-white/55 tabular-nums`}>{formatCost(g.cost_cents)}</span>
                <span className={`${MONO} text-[10.5px] text-white/45 tabular-nums`}>
                  {g.avg_latency_ms != null ? formatLatency(g.avg_latency_ms) : '—'}
                  {g.p95_latency_ms != null && (
                    <span className="text-white/25 ml-1">/ {formatLatency(g.p95_latency_ms)}</span>
                  )}
                </span>
                <span className={`${MONO} text-[10.5px] tabular-nums ${g.error_rate > 5 ? 'text-red-400/70' : 'text-white/35'}`}>
                  {g.error_rate > 0 ? `${g.error_rate}%` : '—'}
                </span>
              </div>
            ))}

            {/* Totals row */}
            <div className="grid grid-cols-1 gap-1 px-5 py-2.5 border-t border-white/[0.06] md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.4fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)] md:items-center bg-white/[0.02]">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/30`}>Total</span>
              <span />
              <span className={`${MONO} text-[10.5px] text-white/50 tabular-nums`}>{analytics.totals.requests.toLocaleString()}</span>
              <span className={`${MONO} text-[10.5px] text-white/50 tabular-nums`}>{formatCost(analytics.totals.cost_cents)}</span>
              <span className={`${MONO} text-[10.5px] text-white/35 tabular-nums`}>
                {analytics.totals.avg_latency_ms != null ? formatLatency(analytics.totals.avg_latency_ms) : '—'}
              </span>
              <span className={`${MONO} text-[10.5px] tabular-nums ${analytics.totals.errors > 0 ? 'text-red-400/50' : 'text-white/25'}`}>
                {analytics.totals.errors > 0
                  ? `${Math.round((analytics.totals.errors / analytics.totals.requests) * 1000) / 10}%`
                  : '—'}
              </span>
            </div>

          </>
        ) : (
          <div className={`${MONO} text-[10.5px] text-white/30 px-5 py-8 text-center`}>
            No data for this period.
          </div>
        )}
      </div>
    </section>
  );
}
