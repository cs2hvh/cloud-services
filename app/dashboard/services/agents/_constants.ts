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
  { type: 'code',        label: 'Code interpreter', enabled: true, note: 'Beta · sandboxed Python for calculations & data' },
  { type: 'memory',      label: 'Memory', enabled: true, note: 'Remembers facts across runs' },
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

/** An inline MCP server tool as edited in the builder form (M1 — doc 14). */
export interface McpDef {
  server_url: string;
  label: string;
  auth_token: string;
  allowed_tools: string; // comma-separated; blank = all tools the server offers
}

export function emptyMcp(): McpDef {
  return { server_url: '', label: '', auth_token: '', allowed_tools: '' };
}

/**
 * Validate + convert the builder's MCP rows into stored `mcp` tool objects.
 * Returns { tools } on success or { error } on the first problem. Blank rows
 * are ignored. Registry-mode (pick a saved server by slug) lands in M3.
 */
export function buildMcpTools(rows: McpDef[]): { tools?: Record<string, unknown>[]; error?: string } {
  const out: Record<string, unknown>[] = [];
  for (const m of rows) {
    const url = m.server_url.trim();
    if (!url && !m.label.trim() && !m.auth_token.trim()) continue; // skip empty row
    if (!/^https?:\/\//.test(url)) return { error: 'Every MCP server needs an http(s) URL' };
    const allowed_tools = m.allowed_tools.split(',').map((s) => s.trim()).filter(Boolean);
    out.push({
      type: 'mcp', server_url: url,
      ...(m.label.trim() ? { label: m.label.trim() } : {}),
      ...(m.auth_token.trim() ? { auth_token: m.auth_token.trim() } : {}),
      ...(allowed_tools.length ? { allowed_tools } : {}),
    });
  }
  return { tools: out };
}

/** Read stored inline MCP tools back into editable builder rows. */
export function mcpToolsOf(tools: Record<string, unknown>[]): McpDef[] {
  return (tools ?? [])
    .filter((t) => t.type === 'mcp' && t.server_url)
    .map((t) => ({
      server_url: String(t.server_url ?? ''),
      label: String(t.label ?? ''),
      auth_token: String(t.auth_token ?? ''),
      allowed_tools: Array.isArray(t.allowed_tools) ? t.allowed_tools.join(', ') : '',
    }));
}

// ── MCP registry (M3) — "saved servers" bound by slug, alongside inline rows ──

export interface McpServerSummary {
  id: string;
  slug: string;
  display_name: string;
  visibility: 'private' | 'curated';
  status: 'active' | 'error' | 'disabled';
}

/** The org's registered servers + the platform-curated catalog. */
export async function fetchMcpServers(): Promise<McpServerSummary[]> {
  try {
    const r = await fetch('/api/agents/mcp-servers');
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data ?? []) as McpServerSummary[];
  } catch {
    return [];
  }
}

/** Read the registry-bound (server_slug) MCP tools back into a slug list. */
export function mcpSlugsOf(tools: Record<string, unknown>[]): string[] {
  return (tools ?? [])
    .filter((t) => t.type === 'mcp' && typeof t.server_slug === 'string' && t.server_slug)
    .map((t) => String(t.server_slug));
}

/** Build stored `mcp` tool objects for registry-bound slugs — register once,
 *  bind by slug in any agent (doc 14 §4). */
export function buildMcpSlugTools(slugs: string[]): Record<string, unknown>[] {
  return slugs.filter(Boolean).map((server_slug) => ({ type: 'mcp', server_slug }));
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
  // Batch-resolved by GET /api/agents (doc 15 gap review) — lets the agents
  // list show which ones are actually externally distributed at a glance,
  // without opening each one individually.
  access_key_count?: number;
  has_public_key?: boolean;
}

export interface RunListItem {
  id: string;
  agent_id: string | null;
  status: string;
  cost_cents: number;
  step_count: number;
  created_at: string;
  updated_at: string;
  // Which credential started this run — resolved server-side (doc 15).
  // Both null = the dashboard itself, not an API key at all.
  key_name: string | null;
  key_tier: 'private' | 'public' | null;
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
