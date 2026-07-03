/**
 * Tool registry — the single source of truth for every agentcore tool.
 *
 * Design (mirrors production patterns like the Vercel AI SDK `tool()`): each tool
 * is ONE spec that unifies what the MODEL sees (name / description / parameters)
 * with HOW it runs (`create` → executor). Because the advertised schema and the
 * implementation come from the same object, they can never drift.
 *
 * ➕ Adding a tool = add one `ToolSpec` (static) or one branch (dynamic) here,
 *    plus its adapter file. The loop, dispatcher, gateway, and runner never change.
 *
 * Two kinds, per the plugin model (doc §4):
 *   • STATIC hosted tools — we build & operate; fixed name+schema, keyed by type
 *     (web_search, file_search, and later code).
 *   • DYNAMIC tools — customer-supplied, name/schema derived per declaration
 *     (inline `function` webhooks now; `mcp` server tools in S4).
 */
import type { AgentTool, AgentToolDecl, FunctionToolDecl, StepType } from "@ahura/agent-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "../env.js";
import { webSearchTool } from "./web-search.js";
import { fileSearchTool, type FileSearchDecl } from "./file-search.js";
import { functionTool } from "./function.js";

/** Runtime dependencies a tool factory may pull from. Kept small on purpose. */
export interface ToolDeps {
  env: RunnerEnv;
  supabase: SupabaseClient;
}

/** JSON Schema for a tool's params — the shape the model sees + we validate against. */
export interface JSONSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
}

/**
 * One tool's complete definition. `create` builds the executor for a specific
 * declaration (so per-agent config like collection_id / webhook_url is baked in).
 */
export interface ToolSpec {
  /** step_type recorded on run_steps + the executor's `type`. */
  type: StepType;
  /** model-facing function name (== type for static hosted tools). */
  name: string;
  description: string;
  parameters: JSONSchema;
  create(decl: AgentToolDecl, deps: ToolDeps): AgentTool;
}

// ── Static hosted tools ───────────────────────────────────────────────────────
// The one place to register a new hosted tool.
export const HOSTED_TOOL_SPECS: Record<string, ToolSpec> = {
  web_search: {
    type: "web_search",
    name: "web_search",
    description:
      "Search the web for current information. Returns numbered results (title, url, snippet) you can cite as [1], [2], ….",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: { type: "integer", description: "Max results (1–10)", default: 5 },
      },
      required: ["query"],
    },
    create: (_decl, deps) => webSearchTool(deps.env),
  },

  file_search: {
    type: "file_search",
    name: "file_search",
    description:
      "Search the agent's attached knowledge base for relevant passages. Returns numbered snippets you can cite as [1], [2], ….",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look up in the knowledge base" },
        max_results: { type: "integer", description: "Max passages (1–20)", default: 5 },
      },
      required: ["query"],
    },
    create: (decl, deps) => fileSearchTool(decl as FileSearchDecl, deps.env, deps.supabase),
  },

  // code (S3), mcp (S4) — register here when their adapters land.
};

// ── Dynamic tools (customer-supplied) ─────────────────────────────────────────
/** Build a spec from a per-request declaration (inline function; MCP in S4). */
export function dynamicToolSpec(decl: AgentToolDecl): ToolSpec | null {
  if (decl.type === "function") {
    const fd = decl as FunctionToolDecl;
    if (!fd.name || !fd.webhook_url) return null; // skip malformed inline tools
    return {
      type: "function",
      name: fd.name,
      description: fd.description ?? "",
      parameters: (fd.parameters as unknown as JSONSchema) ?? { type: "object", properties: {} },
      create: (_d, deps) => functionTool(fd, { timeoutMs: deps.env.toolTimeoutMs }),
    };
  }
  // mcp: dynamic tool discovery from a hosted MCP server lands in S4.
  return null;
}

/** Resolve the spec for a declaration: a static hosted tool, else a dynamic one. */
export function resolveSpec(decl: AgentToolDecl): ToolSpec | null {
  return HOSTED_TOOL_SPECS[decl.type] ?? dynamicToolSpec(decl);
}

/** Lightweight strict-ish check: every required param is present. Returns an
 *  error string (fed back to the model) or null. Full JSON-Schema validation
 *  (ajv) can slot in here later without touching callers. */
export function validateArgs(spec: ToolSpec, args: unknown): string | null {
  const req = spec.parameters.required ?? [];
  if (req.length === 0) return null;
  const obj = (args ?? {}) as Record<string, unknown>;
  const missing = req.filter((k) => obj[k] === undefined || obj[k] === null || obj[k] === "");
  return missing.length ? `Missing required argument(s): ${missing.join(", ")}` : null;
}
