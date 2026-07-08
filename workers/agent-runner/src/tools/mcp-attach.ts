/**
 * attachMcpTools — the ONE async, additive step that layers MCP tools onto an
 * already-built Dispatcher (doc 14 §2b/§6).
 *
 * This is a pure DECORATOR: it wraps `Dispatcher` from the outside using only
 * its public interface, so `dispatch.ts` and `buildDispatcher()` need ZERO
 * changes — not "stays sync", literally untouched. MCP is removable by
 * deleting this file, mcp.ts, and mcp-client.ts, plus the one call site in
 * lifecycle.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentTool, McpToolDecl, RunCtx, StepTypeToolName, ToolCall, ToolResult } from "@ahura/agent-core";
import type { ModelTool } from "../gateway.js";
import type { Dispatcher } from "./dispatch.js";
import { connectMcpTools, resolveInlineMcpConfig, type ResolvedMcpConfig } from "./mcp.js";
import { resolveRegistryMcpConfig } from "./mcp-registry.js";
import type { McpClient } from "./mcp-client.js";

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export interface AttachMcpOpts {
  timeoutMs: number;
  /** Dev-only escape hatch — mirrors function tool's AGENT_WEBHOOK_ALLOW_PRIVATE. */
  allowPrivate?: boolean;
}

/** Where config resolution needs to reach (org-scoped registry lookups, M3).
 *  Absent (or dek null) is fine — only server_slug decls need it; inline
 *  decls never touch supabase at all. */
export interface AttachMcpDeps {
  supabase: SupabaseClient;
  orgId: string;
  /** Decrypts a registry row's auth_token_enc. Null = registry tokens can't be
   *  decrypted, so a slug with a stored token is skipped (fail closed). */
  dek: string | null;
}

/**
 * Connects every `mcp` decl (best-effort — a bad server is skipped, §7#3),
 * and returns a new Dispatcher that routes MCP tool calls to them and
 * everything else to `base`, unchanged.
 */
export async function attachMcpTools(
  base: Dispatcher,
  decls: McpToolDecl[],
  opts: AttachMcpOpts,
  deps?: AttachMcpDeps,
  // Injectable for L1 unit tests (a fake connect, no network); production call
  // sites never pass this, so they get the real connectMcpTools.
  connect: typeof connectMcpTools = connectMcpTools,
  resolveRegistry: typeof resolveRegistryMcpConfig = resolveRegistryMcpConfig
): Promise<Dispatcher> {
  if (decls.length === 0) return base; // zero MCP work, zero cost (§7 scenario 1)

  const mcpRun = new Map<string, AgentTool["run"]>();
  const modelTools: ModelTool[] = [...base.modelTools];
  const clients: McpClient[] = [];

  for (const decl of decls) {
    let config: ResolvedMcpConfig | null;
    if (decl.server_slug) {
      // Registry mode (M3): needs deps to resolve; absent deps → skip (best-effort).
      // Decl-level label/allowed_tools ride along as overrides (doc 14 §4) —
      // found live: these were previously dropped entirely (§7 test above).
      config = deps
        ? await resolveRegistry(deps.supabase, deps.orgId, decl.server_slug, deps.dek, {
            label: decl.label,
            allowedTools: decl.allowed_tools,
          })
        : null;
    } else {
      config = resolveInlineMcpConfig(decl);
    }
    if (!config) continue;
    const { tools, client } = await connect(config, opts);
    if (client) clients.push(client);
    for (const t of tools) {
      mcpRun.set(t.name, t.tool.run.bind(t.tool));
      modelTools.push({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } });
    }
  }

  return {
    modelTools,
    resolveType: (name): StepTypeToolName => (mcpRun.has(name) ? "mcp" : base.resolveType(name)),
    async dispatch(call: ToolCall, ctx: RunCtx): Promise<ToolResult> {
      const run = mcpRun.get(call.name);
      if (!run) return base.dispatch(call, ctx);
      return run(parseArgs(call.arguments), ctx);
    },
    async dispose(): Promise<void> {
      await base.dispose();
      await Promise.all(clients.map((c) => c.close().catch(() => undefined)));
    },
  };
}
