'use client';

import { useCallback, useEffect, useState } from 'react';
import { Minus, Plus, Loader2, CheckCircle2, AlertTriangle, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ──────────────────────────────────────────────────────────────────────

type ScalingState = {
  currentReplicas: number;
  readyReplicas: number;
  minReplicas: number;
  maxReplicas: number;
  hasVolumes: boolean;
};

type Props = {
  instanceId: string;
  serviceName: string;
  onScaled?: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function ReplicaDots({ ready, total }: { ready: number; total: number }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-sm transition-colors ${
            i < ready ? 'bg-green-400' : 'bg-white/15'
          }`}
        />
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScalingControls({ instanceId, serviceName, onScaled }: Props) {
  const [state, setState] = useState<ScalingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fetchScaling = useCallback(async () => {
    try {
      const res = await fetch(`/api/instances/${instanceId}/services/${serviceName}/scale`);
      if (!res.ok) return;
      const data = await res.json();
      const s: ScalingState = data.scaling;
      setState(s);
      setTarget(s.currentReplicas);
    } catch {
      // silently fail — workload may not be up yet
    } finally {
      setLoading(false);
    }
  }, [instanceId, serviceName]);

  useEffect(() => {
    fetchScaling();
    const timer = setInterval(fetchScaling, 10_000);
    return () => clearInterval(timer);
  }, [fetchScaling]);

  async function applyScale() {
    if (!state || target === state.currentReplicas) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/instances/${instanceId}/services/${serviceName}/scale`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replicas: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Scale failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onScaled?.();
      await fetchScaling();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!state) {
    return (
      <p className="text-xs text-white/30 py-4 text-center">
        Scaling info unavailable — service may not be running yet.
      </p>
    );
  }

  if (state.hasVolumes) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <HardDrive className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-300">Stateful service</p>
            <p className="text-[11px] text-amber-300/60 mt-0.5">
              Services with persistent volumes use StatefulSets. Horizontal scaling requires your storage class to support ReadWriteMany.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-white/50 text-xs">Current replicas</span>
          <span className="font-semibold tabular-nums">{state.currentReplicas}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/30">{state.readyReplicas} ready</span>
          <ReplicaDots ready={state.readyReplicas} total={state.currentReplicas} />
        </div>
      </div>
    );
  }

  const isDirty = target !== state.currentReplicas;

  return (
    <div className="space-y-5">
      {/* Live replica status */}
      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/8 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">Running</span>
          <span className="text-sm font-semibold tabular-nums">
            {state.readyReplicas}
            <span className="text-white/30 font-normal"> / {state.currentReplicas}</span>
          </span>
        </div>
        <ReplicaDots ready={state.readyReplicas} total={Math.max(state.currentReplicas, 1)} />
      </div>

      {/* Replica stepper */}
      <div>
        <p className="text-xs text-white/50 mb-3">Target replicas</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTarget(v => Math.max(1, v - 1))}
            disabled={target <= 1}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/25 hover:bg-white/8 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <div className="flex-1 text-center">
            <span className="text-2xl font-bold tabular-nums">{target}</span>
            {isDirty && (
              <span className="text-[11px] text-white/30 block mt-0.5">
                was {state.currentReplicas}
              </span>
            )}
          </div>

          <button
            onClick={() => setTarget(v => Math.min(20, v + 1))}
            disabled={target >= 20}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/25 hover:bg-white/8 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-white/25 mt-2 text-center">Max 20 replicas</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <Button
        className="w-full bg-white text-black hover:bg-white/90"
        disabled={!isDirty || saving}
        onClick={applyScale}
      >
        {saving ? (
          <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Scaling…</>
        ) : saved ? (
          <><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-green-600" />Scaled</>
        ) : (
          `Apply — ${target} replica${target !== 1 ? 's' : ''}`
        )}
      </Button>
    </div>
  );
}
