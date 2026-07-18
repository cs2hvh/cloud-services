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
import type { AgentDelegateToolDecl, AgentTool, AgentToolDecl, FunctionToolDecl, StepType } from "@ahura/agent-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "../env.js";
import { webSearchTool } from "./web-search.js";
import { fileSearchTool, type FileSearchDecl } from "./file-search.js";
import { functionTool } from "./function.js";
import { codeTool } from "./code.js";
import { memoryTool } from "./memory.js";
import { agentDelegateTool } from "./agent-delegate.js";
import { DockerSandboxPool } from "./sandbox/docker-pool.js";
import type { SandboxPool } from "./sandbox/pool.js";

/** Runtime dependencies a tool factory may pull from. Kept small on purpose. */
export interface ToolDeps {
  env: RunnerEnv;
  supabase: SupabaseClient;
  /** Per-run sandbox pool (owned by the runner, disposed at run end). Only set
   *  when the sandbox is enabled; the `code` tool is unavailable without it. */
  sandboxPool?: SandboxPool;
}

/** Build a per-run sandbox pool from env (dev: Docker; prod later: gVisor runtime).
 *  The runner creates ONE per run and disposes it at run end. */
export function sandboxPoolFor(env: RunnerEnv): SandboxPool {
  return new DockerSandboxPool({
    image: env.sandboxImage,
    memory: env.sandboxMemory,
    cpus: env.sandboxCpus,
    pidsLimit: env.sandboxPidsLimit,
    timeoutMs: env.toolTimeoutMs,
    runtime: env.sandboxRuntime ?? undefined,
  });
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

  memory: {
    type: "memory",
    name: "memory",
    description:
      "The agent's long-term memory, persistent across runs. Use action='write' with `content` to remember a durable fact (a user preference, a decision, a result). Use action='search' with `query` to recall relevant facts before answering. Only what you explicitly write is remembered.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["write", "search"], description: "'write' to store a fact, 'search' to recall" },
        content: { type: "string", description: "For write: the fact to remember" },
        query: { type: "string", description: "For search: what to recall" },
        max_results: { type: "integer", description: "For search: max memories (1–20)", default: 5 },
      },
      required: ["action"],
    },
    create: (_decl, deps) => memoryTool(deps.env, deps.supabase),
  },

  code: {
    type: "code",
    name: "code",
    description:
      "Run Python in a sandboxed, STATEFUL interpreter. Variables, imports, defined functions and files you write to the working directory PERSIST across calls in this run, so you can build up work step by step. Runs like a notebook: the value of the final expression is shown automatically (e.g. `909 * 783347833` prints its result) — you don't need print(). Use it for calculations, data wrangling, and transforming tool results. No internet access.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "The Python source to execute. The last expression's value is auto-printed." },
      },
      required: ["code"],
    },
    // GATE: a real pool is wired ONLY when SANDBOX_ENABLED is on (post security
    // sign-off, doc 13). Off → codeTool gets no pool and reports unavailable, and
    // the dispatcher also skips advertising it (see dispatch.ts).
    create: (_decl, deps) => codeTool(deps.env, deps.env.sandboxEnabled ? deps.sandboxPool : undefined),
  },

  // mcp (S4) — register here when its adapter lands.
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
      create: (_d, deps) =>
        functionTool(fd, {
          timeoutMs: deps.env.toolTimeoutMs,
          allowPrivateWebhooks: deps.env.allowPrivateWebhooks,
        }),
    };
  }
  if (decl.type === "agent") {
    const ad = decl as AgentDelegateToolDecl;
    if (!ad.target_agent_id || !ad.label) return null; // skip malformed delegate decls
    return {
      type: "agent",
      name: `agent__${ad.label}`,
      // Rewritten 2026-07-17 after comparing against how real providers coach
      // this exact handoff — Anthropic's own multi-agent research system
      // (anthropic.com/engineering/multi-agent-research-system) found that
      // "simple, short instructions... led to duplicate work and misaligned
      // efforts," and fixed it by having their lead agent give every
      // subagent "an objective, an output format, guidance on tools/sources,
      // and clear task boundaries" — not a one-line prompt. The description
      // below is that same coaching, applied to a single `input` string
      // (not a multi-field schema) to keep the common case low-friction.
      // It also states the scope explicitly (bounded subtask, not a
      // conversation handoff) and nudges against unnecessary delegation —
      // Anthropic's orchestrator prompt does the same with explicit
      // scaling rules ("simple fact-finding: 1 agent... complex: many").
      description:
        ad.description ??
        "Delegate ONE bounded subtask to another of your agents — use this only when the task genuinely needs that agent's specialization, not for things you can already answer yourself. The delegated agent sees ONLY the `input` text, nothing else from this conversation, and does not take over — you stay in control and use its answer to continue.",
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description:
              "A complete, self-contained task — vague topics produce vague, misaligned work. Include: (1) the specific objective, not a general subject; (2) any boundaries (what's out of scope); (3) the output format you need (e.g. a short answer, a list, a yes/no with reasoning).",
          },
        },
        required: ["input"],
      },
      create: (_d, deps) => agentDelegateTool(ad, { env: deps.env, supabase: deps.supabase }),
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
