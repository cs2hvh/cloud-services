'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GhostButton, MONO } from '@/components/dashboard/inference/chrome';
import { GuardrailBadge, SpanTypeBadge, StatusBadge } from './_badges';
import { formatCost, formatLatency, formatTokens } from './_helpers';
import type { TraceDetail, TraceRow } from './_types';

type View = 'span' | 'trace';

interface Props {
  detail: TraceRow | null;
  onClose: () => void;
}

export function SpanDetailDialog({ detail, onClose }: Props) {
  const [view, setView]                 = useState<View>('span');
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceData, setTraceData]       = useState<TraceDetail | null>(null);

  // Reset to span view when a new row is opened
  useEffect(() => {
    setView('span');
    setTraceData(null);
  }, [detail?.id]);

  const handleTraceTab = useCallback(async () => {
    setView('trace');
    if (!detail || traceData?.trace_id === detail.trace_id) return;
    setTraceLoading(true);
    try {
      const r = await fetch(`/api/inference/traces/${encodeURIComponent(detail.trace_id)}`, { credentials: 'include' });
      if (r.ok) setTraceData(await r.json());
    } finally {
      setTraceLoading(false);
    }
  }, [detail, traceData]);

  // Waterfall bar geometry: treat created_at as span end, start = end − latency_ms
  const waterfall = traceData
    ? (() => {
        const starts     = traceData.spans.map((s) => new Date(s.created_at).getTime() - (s.latency_ms ?? 0));
        const ends       = traceData.spans.map((s) => new Date(s.created_at).getTime());
        const firstStart = Math.min(...starts);
        const totalWall  = Math.max(Math.max(...ends) - firstStart, 1);
        return { firstStart, totalWall };
      })()
    : null;

  return (
    <Dialog open={!!detail} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl border-white/[0.08] bg-[#111216] flex flex-col max-h-[88vh] p-0 gap-0">

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80 flex items-center gap-2 mb-1`}>
            {detail && <SpanTypeBadge name={detail.name} />}
            <span>Span detail</span>
          </DialogTitle>
          <DialogDescription className={`${MONO} text-[11px] text-white/40 truncate`}>
            {detail?.request_id}
          </DialogDescription>

          {/* Tabs */}
          <div className="flex mt-4 border-b border-white/[0.06]">
            <button
              onClick={() => setView('span')}
              className={`${MONO} text-[10px] uppercase tracking-[0.12em] px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                view === 'span'
                  ? 'border-[#0095FF]/60 text-white/80'
                  : 'border-transparent text-white/30 hover:text-white/55'
              }`}
            >
              Span
            </button>
            <button
              onClick={handleTraceTab}
              className={`${MONO} text-[10px] uppercase tracking-[0.12em] px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                view === 'trace'
                  ? 'border-[#0095FF]/60 text-white/80'
                  : 'border-transparent text-white/30 hover:text-white/55'
              }`}
            >
              Trace
              {traceData && (
                <span className="ml-1.5 normal-case tracking-normal text-white/25">
                  ({traceData.span_count})
                </span>
              )}
            </button>
          </div>
        </DialogHeader>

        {/* ── Span view ─────────────────────────────────────────────────────── */}
        {detail && view === 'span' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Latency', value: formatLatency(detail.latency_ms) },
                { label: 'TTFT',    value: formatLatency(detail.ttft_ms) },
                { label: 'Cost',    value: formatCost(detail.cost_cents) },
                { label: 'Tokens',  value: formatTokens(detail.input_tokens, detail.output_tokens) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-black/30 border border-white/[0.06] rounded px-3 py-2.5">
                  <p className={`${MONO} text-[9px] uppercase tracking-[0.14em] text-white/40 mb-1`}>{label}</p>
                  <p className={`${MONO} text-[13px] font-semibold text-white tabular-nums`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Model</p>
              <p className={`${MONO} text-[11.5px] text-white/70`}>{detail.model_id ?? '—'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Status</p>
                <StatusBadge status={detail.status} />
              </div>
              <div className="space-y-1.5">
                <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Guardrail</p>
                <GuardrailBadge action={detail.guardrail_action} />
              </div>
            </div>

            {detail.prompt_id && (
              <div className="space-y-1.5">
                <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Prompt</p>
                <p className={`${MONO} text-[11px] text-white/60`}>
                  {detail.prompt_id}
                  {detail.prompt_version != null && (
                    <span className="ml-2 text-white/35">v{detail.prompt_version}</span>
                  )}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Trace ID</p>
              <p className={`${MONO} text-[10.5px] text-white/50 break-all`}>{detail.trace_id}</p>
            </div>

            <div className="space-y-1.5">
              <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Time</p>
              <p className={`${MONO} text-[11px] text-white/55`}>
                {new Date(detail.created_at).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </p>
            </div>

            {Object.keys(detail.attributes).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40`}>Attributes</p>
                <pre className={`${MONO} text-[10.5px] text-white/60 leading-relaxed bg-black/30 border border-white/[0.06] rounded px-3 py-2.5 overflow-x-auto`}>
                  {JSON.stringify(detail.attributes, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── Trace view ────────────────────────────────────────────────────── */}
        {detail && view === 'trace' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {traceLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 rounded bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : traceData && waterfall ? (
              <div>
                {/* Trace totals */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Spans',        value: String(traceData.span_count) },
                    { label: 'Total cost',   value: formatCost(traceData.totals.cost_cents) },
                    { label: 'Wall time',    value: formatLatency(waterfall.totalWall) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-black/30 border border-white/[0.06] rounded px-3 py-2.5">
                      <p className={`${MONO} text-[9px] uppercase tracking-[0.14em] text-white/40 mb-1`}>{label}</p>
                      <p className={`${MONO} text-[13px] font-semibold text-white tabular-nums`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Waterfall */}
                <p className={`${MONO} text-[9px] uppercase tracking-[0.14em] text-white/30 mb-2`}>Waterfall</p>
                <div className="space-y-1">
                  {traceData.spans.map((span) => {
                    const spanStart = new Date(span.created_at).getTime() - (span.latency_ms ?? 0);
                    const offsetPct = ((spanStart - waterfall.firstStart) / waterfall.totalWall) * 100;
                    const widthPct  = Math.max(2, ((span.latency_ms ?? 0) / waterfall.totalWall) * 100);
                    const isCurrent = span.id === detail.id;

                    return (
                      <div
                        key={span.id}
                        className={`flex items-center gap-3 py-1.5 px-2 rounded-[4px] ${isCurrent ? 'bg-white/[0.035] ring-1 ring-inset ring-[#0095FF]/20' : ''}`}
                      >
                        <div className="w-14 shrink-0 flex justify-end">
                          <SpanTypeBadge name={span.name} />
                        </div>
                        <div className="flex-1 h-4 relative rounded overflow-hidden bg-white/[0.04]">
                          <div
                            className={`absolute h-full rounded-[2px] ${isCurrent ? 'bg-[#0095FF]/50' : 'bg-white/[0.15]'}`}
                            style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                          />
                        </div>
                        <span className={`${MONO} text-[10px] tabular-nums w-14 text-right shrink-0 ${isCurrent ? 'text-white/70' : 'text-white/35'}`}>
                          {formatLatency(span.latency_ms)}
                        </span>
                        <div className="w-16 shrink-0">
                          <StatusBadge status={span.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Time axis */}
                <div className={`${MONO} text-[8px] text-white/20 flex justify-between mt-2 pl-[72px] pr-[120px]`}>
                  <span>0</span>
                  <span>{formatLatency(waterfall.totalWall / 2)}</span>
                  <span>{formatLatency(waterfall.totalWall)}</span>
                </div>
              </div>
            ) : (
              <p className={`${MONO} text-[11px] text-white/30 text-center py-8`}>Failed to load trace.</p>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-white/[0.06] shrink-0 flex items-center gap-2 justify-between">
          {detail?.name === 'gen_ai.chat' && detail.model_id ? (
            <Link
              href={`/dashboard/services/inference/playground?model=${encodeURIComponent(detail.model_id)}`}
              className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[#0095FF]/70 hover:text-[#0095FF] transition-colors`}
              onClick={onClose}
            >
              Open in Playground
            </Link>
          ) : (
            <span />
          )}
          <GhostButton onClick={onClose}>Close</GhostButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
