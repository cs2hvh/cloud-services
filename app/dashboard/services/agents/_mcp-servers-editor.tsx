'use client';

/**
 * MCP servers block — saved-server picker (registry, M3) + inline URL rows
 * (M1), the add/edit/remove list used by both the new-agent builder and the
 * Settings tab. Extracted for the same reason as _function-tools-editor.tsx:
 * one page shouldn't hand-roll what the other already built.
 */
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MONO } from '@/components/dashboard/inference/chrome';
import { emptyMcp, type McpDef } from './_constants';
import { McpServerPicker } from './_mcp-server-picker';

const LABEL = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;

export const MCP_SERVERS_DESCRIPTION =
  'Connect a remote MCP server — the agent discovers its tools and can call them during a run. Pick a saved server (register once, reuse across agents) or point at a URL directly.';

export function McpServersEditor({
  slugs, onSlugsChange, rows, onRowsChange,
}: {
  slugs: string[];
  onSlugsChange: (slugs: string[]) => void;
  rows: McpDef[];
  onRowsChange: (rows: McpDef[]) => void;
}) {
  const add = () => onRowsChange([...rows, emptyMcp()]);
  const update = (i: number, k: keyof McpDef, v: string) => onRowsChange(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const remove = (i: number) => onRowsChange(rows.filter((_, j) => j !== i));

  return (
    <>
      <McpServerPicker value={slugs} onChange={onSlugsChange} />
      {rows.length === 0 && (
        <div className="text-[11px] text-white/35">None yet. Add an MCP server URL to give the agent its tools.</div>
      )}
      {rows.map((m, i) => (
        <div key={i} className="rounded-xl border border-white/[0.08] bg-[#0c0d10] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={LABEL}>MCP server {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-white/30 hover:text-red-400" aria-label="Remove MCP server">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={m.server_url} placeholder="https://mcp.example.com/mcp" onChange={(e) => update(i, 'server_url', e.target.value)} />
            <Input value={m.label} placeholder="Label (optional — namespaces its tools)" onChange={(e) => update(i, 'label', e.target.value)} />
          </div>
          <Input value={m.auth_token} placeholder="Bearer token (optional, if the server requires auth)" onChange={(e) => update(i, 'auth_token', e.target.value)} />
          <Input value={m.allowed_tools} placeholder="Allowed tools (optional, comma-separated — blank = all)" onChange={(e) => update(i, 'allowed_tools', e.target.value)} />
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 text-[12px] text-[#33adff] hover:text-[#5cb8ff]">
        <Plus className="h-3.5 w-3.5" /> Add MCP server
      </button>
    </>
  );
}
