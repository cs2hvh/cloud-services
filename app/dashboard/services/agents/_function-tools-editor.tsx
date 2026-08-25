'use client';

/**
 * Custom-function tool rows — the add/edit/remove list used by both the new-
 * agent builder and the Settings tab. Extracted so the two pages don't each
 * hand-roll the same list UI (they used to; the descriptions had already
 * drifted apart as a result).
 */
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MONO } from '@/components/dashboard/inference/chrome';
import { emptyFn, type FnDef } from './_constants';

const LABEL = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;

export const FUNCTION_TOOLS_DESCRIPTION =
  'Call your own APIs. When the agent invokes one, we POST the args to your webhook (SSRF-guarded, HMAC-signed if you set a secret) and feed the response back.';

export function FunctionToolsEditor({ value, onChange }: { value: FnDef[]; onChange: (fns: FnDef[]) => void }) {
  const add = () => onChange([...value, emptyFn()]);
  const update = (i: number, k: keyof FnDef, v: string) => onChange(value.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <>
      {value.length === 0 && (
        <div className="text-[11px] text-white/35">None yet. Add a function to let the agent call your own API endpoint.</div>
      )}
      {value.map((f, i) => (
        <div key={i} className="rounded-xl border border-white/[0.08] bg-[#0c0d10] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={LABEL}>Function {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-white/30 hover:text-red-400" aria-label="Remove function">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={f.name} placeholder="get_weather" onChange={(e) => update(i, 'name', e.target.value)} />
            <Input value={f.webhook_url} placeholder="https://api.yoursite.com/hook" onChange={(e) => update(i, 'webhook_url', e.target.value)} />
          </div>
          <Input value={f.description} placeholder="What this function does (shown to the model)" onChange={(e) => update(i, 'description', e.target.value)} />
          <Input value={f.secret} placeholder="Signing secret (optional — HMAC-signs each call)" onChange={(e) => update(i, 'secret', e.target.value)} />
          <Textarea rows={2} value={f.parameters} placeholder={'Parameters JSON Schema (optional), e.g. {"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}'} onChange={(e) => update(i, 'parameters', e.target.value)} />
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 text-[12px] text-[#33adff] hover:text-[#5cb8ff]">
        <Plus className="h-3.5 w-3.5" /> Add function
      </button>
    </>
  );
}
