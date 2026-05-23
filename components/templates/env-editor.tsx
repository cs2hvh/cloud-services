'use client';

import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

export type EnvPair = { key: string; value: string };

type Props = {
  pairs: EnvPair[];
  descriptions?: Record<string, string>;
  onChange: (pairs: EnvPair[]) => void;
  /** When true, only values are editable (keys are fixed). Useful for deploy-time overrides. */
  fixedKeys?: boolean;
};

export function EnvEditor({ pairs, descriptions, onChange, fixedKeys }: Props) {
  function update(i: number, field: 'key' | 'value', val: string) {
    onChange(pairs.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }
  function remove(i: number) { onChange(pairs.filter((_, idx) => idx !== i)); }
  function add() { onChange([...pairs, { key: '', value: '' }]); }

  return (
    <div className="space-y-1.5">
      {pairs.length === 0 && !fixedKeys && (
        <p className="text-[11px] text-white/30 py-1">No variables set.</p>
      )}
      {pairs.map((p, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Input
              value={p.key}
              onChange={e => !fixedKeys && update(i, 'key', e.target.value)}
              readOnly={fixedKeys}
              placeholder="KEY"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 font-mono text-xs h-7 flex-1 read-only:opacity-60 read-only:cursor-default"
            />
            <span className="text-white/20 text-xs flex-shrink-0">=</span>
            <Input
              value={p.value}
              onChange={e => update(i, 'value', e.target.value)}
              placeholder="value"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 font-mono text-xs h-7 flex-1"
            />
            {!fixedKeys && (
              <button onClick={() => remove(i)} className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {descriptions?.[p.key] && (
            <p className="text-[10px] text-white/25 ml-1">{descriptions[p.key]}</p>
          )}
        </div>
      ))}
      {!fixedKeys && (
        <button
          onClick={add}
          className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors pt-0.5"
        >
          <Plus className="w-3 h-3" /> Add variable
        </button>
      )}
    </div>
  );
}
