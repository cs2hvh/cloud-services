'use client';

/**
 * Agent-delegation picker ("A2A", scoped narrowly per doc 02 — see
 * nextstespsAI/18-agent-delegation.md). Pick another of the org's own agents
 * to attach as a tool — mirrors _mcp-server-picker.tsx's chip+dropdown shape,
 * plus a per-attachment description input (the one field that actually
 * shapes model behavior: when should the model reach for this delegate?).
 * Backend shipped 2026-07-17; this closes the gap a pre-launch review found
 * — the feature was fully built and reachable via the API, but had no way
 * for a customer to attach it without hand-crafting requests.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { MONO } from '@/components/dashboard/inference/chrome';
import { fetchDelegatableAgents, type AgentDelegateDef, type DelegatableAgentSummary } from './_constants';

const SEL = `w-full h-9 rounded-xl bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`;
const LABEL = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;
const INPUT = `w-full h-8 rounded-lg bg-[#0c0d10] border border-white/[0.08] px-2.5 text-[12px] text-white/85 placeholder:text-white/25`;

export function AgentDelegatePicker({
  value,
  onChange,
  currentAgentId,
}: {
  value: AgentDelegateDef[];
  onChange: (rows: AgentDelegateDef[]) => void;
  /** Excluded from the picker — an agent can't delegate to itself (enforced
   *  again server-side in agent-delegate.ts; this just avoids offering a
   *  choice that would only ever error). Absent when creating a NEW agent
   *  (nothing to exclude yet — it doesn't have an id until it's saved). */
  currentAgentId?: string;
}) {
  const [agents, setAgents] = useState<DelegatableAgentSummary[]>([]);

  useEffect(() => {
    void fetchDelegatableAgents().then(setAgents);
  }, []);

  const attachedIds = value.map((v) => v.target_agent_id);
  const available = agents.filter((a) => a.id !== currentAgentId && a.is_active && !attachedIds.includes(a.id));

  const update = (i: number, patch: Partial<AgentDelegateDef>) =>
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      <span className={LABEL}>Delegate to another agent</span>
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((row, i) => {
            const target = agents.find((a) => a.id === row.target_agent_id);
            return (
              <div key={row.target_agent_id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-white/85">{target?.name ?? row.target_agent_id}</span>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                    className="text-white/40 hover:text-red-400 shrink-0"
                    aria-label={`Remove delegation to ${target?.name ?? row.target_agent_id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={row.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder={`When should the model delegate to "${target?.name ?? '…'}"? (optional — a generic instruction is used if blank)`}
                  className={INPUT}
                />
              </div>
            );
          })}
        </div>
      )}
      {available.length === 0 ? (
        <div className="text-[11px] text-white/35">
          {agents.length <= 1 ? 'No other agents in this org yet to delegate to.' : 'Every other agent is already attached.'}
        </div>
      ) : (
        <select
          value=""
          onChange={(e) => {
            const target = agents.find((a) => a.id === e.target.value);
            if (!target) return;
            const label = target.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 40) || target.id.slice(0, 8);
            onChange([...value, { target_agent_id: target.id, label, description: '' }]);
          }}
          className={SEL}
        >
          <option value="">Attach an agent to delegate to…</option>
          {available.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.model}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
