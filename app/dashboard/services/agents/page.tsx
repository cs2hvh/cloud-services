'use client';

/**
 * Agents v2 (agentcore) dashboard — list. Create is a dedicated page
 * (/new); edit lives on the detail Settings tab. This page is list + delete only.
 */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RotateCw, Trash2, Bot, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DataTable, EmptyState, Hero, MONO, PageCanvas, PrimaryButton,
  RowActionButton, StatCell, StatsStrip, ColHead, ACCENT,
} from '@/components/dashboard/inference/chrome';
import { formatCost, type Agent } from './_constants';

const BASE = '/api/agents';
const NEW_HREF = '/dashboard/services/agents/new';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(BASE);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load agents');
      setAgents(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE}/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success('Agent deleted');
      setDeleteTarget(null);
      void fetchAgents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const activeCount = agents.filter((a) => a.is_active).length;

  return (
    <PageCanvas>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <Hero
          breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
          title="Agents"
          size="md"
          accent="v2"
          caption="Autonomous multi-step agents — durable runs, hosted tools, per-step traces."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAgents(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] text-white/60 hover:text-white/90"
                aria-label="Refresh"
              >
                <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <Link href={NEW_HREF}>
                <PrimaryButton><Plus className="h-3.5 w-3.5" /> New agent</PrimaryButton>
              </Link>
            </div>
          }
        />

        <StatsStrip>
          <StatCell label="Agents" value={String(agents.length)} hint="Defined in this org" accent={ACCENT} />
          <StatCell label="Active" value={String(activeCount)} hint="Currently enabled" />
        </StatsStrip>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <EmptyState
            title="No agents yet"
            description="Create an agent — pick a model, write a system prompt, set step and cost ceilings — then run it."
            action={<Link href={NEW_HREF}><PrimaryButton><Plus className="h-3.5 w-3.5" /> New agent</PrimaryButton></Link>}
          />
        ) : (
          <DataTable>
            <div className="grid grid-cols-[1.6fr_1.4fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-2.5 border-b border-white/[0.06]">
              <ColHead>Name</ColHead>
              <ColHead>Model</ColHead>
              <ColHead align="right">Max steps</ColHead>
              <ColHead align="right">Max cost</ColHead>
              <ColHead align="right">Actions</ColHead>
            </div>
            {agents.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[1.6fr_1.4fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-3 border-b border-white/[0.04] items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Bot className="h-4 w-4 text-white/30 shrink-0" />
                  <Link href={`/dashboard/services/agents/${a.id}`} className="truncate text-sm text-white/90 hover:text-[#33adff]">{a.name}</Link>
                  {!a.is_active && <Badge variant="outline" className="text-[9px]">paused</Badge>}
                </div>
                <span className={`${MONO} text-[11px] text-white/55 truncate`}>{a.model}</span>
                <span className={`${MONO} text-[11px] text-white/70 text-right tabular-nums`}>{a.max_steps}</span>
                <span className={`${MONO} text-[11px] text-white/70 text-right tabular-nums`}>{formatCost(a.max_cost_cents)}</span>
                <div className="flex items-center justify-end gap-1.5">
                  <RowActionButton href={`/dashboard/services/agents/${a.id}`}>Open</RowActionButton>
                  <RowActionButton href={`/dashboard/services/agents/playground?agent=${a.id}`}><Play className="h-3 w-3" /> Run</RowActionButton>
                  <RowActionButton variant="danger" onClick={() => setDeleteTarget(a)}><Trash2 className="h-3 w-3" /></RowActionButton>
                </div>
              </div>
            ))}
          </DataTable>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the agent definition. Past run history is preserved (runs detach from the agent).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDelete(); }} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}
