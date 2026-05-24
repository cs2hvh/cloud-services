'use client';

import { useEffect, useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';

import {
  ACCENT,
  ColHead,
  DataTable,
  EmptyState,
  FilterChip,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  SectionHead,
  StatCell,
  StatsStrip,
} from '@/components/dashboard/inference/chrome';

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  actor_api_key_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditResponse {
  org: { id: string; slug: string; name: string };
  summary: {
    shown: number;
    last_24h: number;
    last_7d: number;
    top_action: { action: string; count: number } | null;
  };
  data: AuditRow[];
}

function actorLabel(row: AuditRow): { type: string; tone: 'user' | 'key' | 'system' } {
  if (row.actor_user_id) return { type: 'User', tone: 'user' };
  if (row.actor_api_key_id) return { type: 'API Key', tone: 'key' };
  return { type: 'System', tone: 'system' };
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('All');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/audit-log?limit=100', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load audit log');
      setData(await r.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Derive filter chips from the prefix of audit_action values (key/byok/org/...)
  const groups = useMemo(() => {
    if (!data) return ['All'];
    const set = new Set<string>();
    set.add('All');
    for (const r of data.data) set.add(r.action.split('.')[0] ?? r.action);
    return Array.from(set);
  }, [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === 'All') return data.data;
    return data.data.filter((r) => (r.action.split('.')[0] ?? r.action) === filter);
  }, [data, filter]);

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Audit"
        accent="log"
        caption="Append-only stream of mutating actions in this org. Partitioned monthly by inference.audit_log; SOC-2-ready and exportable."
        size="md"
        actions={
          <GhostButton onClick={load} disabled={loading}>
            <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </GhostButton>
        }
      />

      <StatsStrip>
        <StatCell
          label="Shown"
          value={String(data?.summary.shown ?? 0)}
          hint="In this view"
        />
        <StatCell
          label="Last 24h"
          value={String(data?.summary.last_24h ?? 0)}
          hint="Events in last day"
          accent={ACCENT}
        />
        <StatCell
          label="Last 7d"
          value={String(data?.summary.last_7d ?? 0)}
          hint="Events this week"
        />
        <StatCell
          label="Top action"
          value={data?.summary.top_action?.count.toString() ?? '—'}
          suffix={data?.summary.top_action ? '×' : undefined}
          hint={data?.summary.top_action?.action ?? 'No activity'}
        />
      </StatsStrip>

      <SectionHead
        eyebrow="Stream"
        title="Recent"
        accent="events"
        rightMeta={visible.length > 0 ? `${visible.length} of ${data?.summary.shown ?? 0}` : undefined}
      />

      {/* Filter chips */}
      {groups.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {groups.map((g) => (
            <FilterChip
              key={g}
              active={filter === g}
              label={g === 'All' ? 'All' : g.toUpperCase()}
              onClick={() => setFilter(g)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <DataTable>
          <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
            Loading…
          </div>
        </DataTable>
      ) : visible.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Time</ColHead>
            <ColHead>Actor</ColHead>
            <ColHead>Action</ColHead>
            <ColHead>Target</ColHead>
            <ColHead>IP</ColHead>
          </div>
          {visible.map((r) => {
            const a = actorLabel(r);
            return (
              <div
                key={r.id}
                className="grid grid-cols-1 gap-1 px-5 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] md:items-center"
              >
                <span className={`${MONO} text-[11px] text-white/55 tabular-nums`}>
                  {relativeTime(r.created_at)}
                </span>
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        a.tone === 'user' ? '#4ade80' : a.tone === 'key' ? ACCENT : 'rgba(255,255,255,0.45)',
                      boxShadow:
                        a.tone === 'system'
                          ? 'none'
                          : `0 0 5px ${a.tone === 'user' ? '#4ade80' : ACCENT}`,
                    }}
                  />
                  <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{
                      color:
                        a.tone === 'user' ? '#4ade80' : a.tone === 'key' ? ACCENT : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    {a.type}
                  </span>
                </div>
                <span className={`${MONO} text-[12px] text-white/90`}>{r.action}</span>
                <span className={`${MONO} text-[11px] text-white/55 truncate`}>
                  <span className="text-white/40">{r.target_type}</span>
                  {r.target_id && <span className="text-white/55"> · {r.target_id.slice(0, 12)}…</span>}
                </span>
                <span className={`${MONO} text-[11px] text-white/45 tabular-nums truncate`}>
                  {r.ip_address ?? '—'}
                </span>
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title="No audit events yet"
          description="Mutating actions (key creation, member changes, BYOK adds) will appear here within seconds of happening."
        />
      )}
    </PageCanvas>
  );
}
