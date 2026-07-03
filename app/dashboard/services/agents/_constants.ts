// Shared constants + types + formatters for the agentcore dashboard screens.

export const MODEL_OPTIONS: { provider: string; models: { id: string; label: string }[] }[] = [
  { provider: 'OpenAI', models: [
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'openai/gpt-4o',      label: 'GPT-4o' },
    { id: 'openai/gpt-4.1',     label: 'GPT-4.1' },
    { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  ]},
  { provider: 'Anthropic', models: [
    { id: 'anthropic/claude-opus-4.7',   label: 'Claude Opus 4.7' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'anthropic/claude-haiku-4.5',  label: 'Claude Haiku 4.5' },
  ]},
  { provider: 'Google', models: [
    { id: 'google/gemini-3-pro',   label: 'Gemini 3 Pro' },
    { id: 'google/gemini-3-flash', label: 'Gemini 3 Flash' },
  ]},
];
export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

// Attachable hosted tools. web_search + file_search are live (S2). code (S3) has
// a real sandbox executor but stays server-gated (SANDBOX_ENABLED) until the
// security review signs off — so it's selectable but flagged Beta.
// `needsCollection` tools reveal a KB picker.
export const HOSTED_TOOLS: { type: string; label: string; enabled: boolean; note?: string; needsCollection?: boolean }[] = [
  { type: 'web_search',  label: 'Web search', enabled: true },
  { type: 'file_search', label: 'File search (RAG)', enabled: true, needsCollection: true },
  { type: 'code',        label: 'Code interpreter', enabled: true, note: 'Beta · sandboxed Python (runs only where the sandbox is enabled)' },
];

export interface VectorCollection {
  id: string;
  name: string;
  embedding_model_id: string | null;
  row_count: number;
}

/** The org's vector collections, for the file_search KB picker. */
export async function fetchCollections(): Promise<VectorCollection[]> {
  try {
    const r = await fetch('/api/inference/vector/collections');
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data ?? []) as VectorCollection[];
  } catch {
    return [];
  }
}

/** Build the stored tools JSONB from selected types + the file_search collection. */
export function buildToolsPayload(types: string[], fileSearchCollectionId: string): { type: string; collection_id?: string }[] {
  return types.map((type) => (type === 'file_search' && fileSearchCollectionId ? { type, collection_id: fileSearchCollectionId } : { type }));
}

/** A custom function-webhook tool as edited in the builder form. */
export interface FnDef {
  name: string;
  webhook_url: string;
  description: string;
  secret: string;
  parameters: string; // JSON Schema text; blank = permissive object
}

export function emptyFn(): FnDef {
  return { name: '', webhook_url: '', description: '', secret: '', parameters: '' };
}

/**
 * Validate + convert the builder's function rows into stored `function` tool
 * objects. Returns { tools } on success or { error } on the first problem, so the
 * caller can surface a toast. Blank rows are ignored.
 */
export function buildFunctionTools(fns: FnDef[]): { tools?: Record<string, unknown>[]; error?: string } {
  const out: Record<string, unknown>[] = [];
  for (const f of fns) {
    const name = f.name.trim();
    const url = f.webhook_url.trim();
    if (!name && !url) continue; // skip empty row
    if (!name) return { error: 'Every custom function needs a name' };
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) return { error: `Function name "${name}" must be alphanumeric/underscore` };
    if (!/^https?:\/\//.test(url)) return { error: `Function "${name}" needs an http(s) webhook URL` };
    let parameters: unknown = { type: 'object', properties: {} };
    if (f.parameters.trim()) {
      try { parameters = JSON.parse(f.parameters); }
      catch { return { error: `Function "${name}" has invalid JSON in Parameters` }; }
    }
    out.push({
      type: 'function', name, webhook_url: url, parameters,
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      ...(f.secret.trim() ? { secret: f.secret.trim() } : {}),
    });
  }
  return { tools: out };
}

/** Read stored function tools back into editable builder rows. */
export function functionToolsOf(tools: Record<string, unknown>[]): FnDef[] {
  return (tools ?? [])
    .filter((t) => t.type === 'function')
    .map((t) => ({
      name: String(t.name ?? ''),
      webhook_url: String(t.webhook_url ?? ''),
      description: String(t.description ?? ''),
      secret: String(t.secret ?? ''),
      parameters: t.parameters ? JSON.stringify(t.parameters, null, 2) : '',
    }));
}

/** Read the file_search collection_id back out of an agent's stored tools. */
export function fileSearchCollectionOf(tools: { type: string; collection_id?: string }[]): string {
  return tools.find((t) => t.type === 'file_search')?.collection_id ?? '';
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  system_prompt: string | null;
  tools: { type: string }[];
  guardrail: string;
  max_steps: number;
  max_cost_cents: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RunListItem {
  id: string;
  agent_id: string | null;
  status: string;
  cost_cents: number;
  step_count: number;
  created_at: string;
  updated_at: string;
}

export interface RunStep {
  step_index: number;
  step_type: string;
  tool_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  units: number | null;
  unit_label: string | null;
  cost_cents: number;
  latency_ms: number | null;
  status: string;
  detail?: Record<string, unknown> | null;
  created_at: string;
}

export interface RunDetail extends RunListItem {
  output: { output?: { content?: { text?: string }[] }[] } | null;
  error: string | null;
  max_cost_cents: number;
  steps: RunStep[];
}

/** Human cost: sub-cent values read as e.g. "0.15¢" instead of a flat "$0.00". */
/** Flatten a step's `detail` into ordered [label, text] rows for the trace UI —
 *  input/code first, then outputs, then metadata. Empty when there's nothing to show. */
export function detailRows(detail?: Record<string, unknown> | null): [string, string][] {
  if (!detail || typeof detail !== 'object') return [];
  const order = ['input', 'code', 'query', 'args', 'stdout', 'stderr', 'output', 'results', 'snippets'];
  const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? 99 : i; };
  return Object.keys(detail)
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => {
      const v = (detail as Record<string, unknown>)[k];
      return [k, typeof v === 'string' ? v : JSON.stringify(v, null, v && typeof v === 'object' ? 1 : 0)] as [string, string];
    });
}

export function formatCost(cents: number): string {
  const c = Number(cents) || 0;
  if (c === 0) return '$0';
  if (c < 1) return `${c.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}¢`;
  return `$${(c / 100).toFixed(c < 100 ? 3 : 2)}`;
}

export function relativeTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export type RunStatus = 'queued' | 'running' | 'requires_action' | 'completed' | 'failed' | 'cancelled' | 'expired';

export function statusKind(status: string): 'ok' | 'warn' | 'error' | 'neutral' | 'info' {
  if (status === 'completed') return 'ok';
  if (status === 'failed' || status === 'expired') return 'error';
  if (status === 'cancelled') return 'neutral';
  if (status === 'running' || status === 'requires_action') return 'info';
  return 'warn';
}

export function finalText(run: RunDetail | null): string | null {
  return run?.output?.output?.[0]?.content?.[0]?.text ?? null;
}
