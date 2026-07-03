/**
 * Tool dispatcher — a thin driver over the tool registry (see spec.ts).
 *
 * It turns an agent's declared tools into (a) the schemas advertised to the model
 * and (b) a name→executor router the loop's `dispatchTool` calls — both derived
 * from the same `ToolSpec`, so they can't drift. All tool knowledge lives in
 * spec.ts; this file just wires specs to the loop. Adding a tool never touches here.
 */
import type { AgentTool, AgentToolDecl, RunCtx, StepTypeToolName, ToolCall, ToolResult } from "@ahura/agent-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelTool } from "../gateway.js";
import type { RunnerEnv } from "../env.js";
import { resolveSpec, validateArgs, type ToolSpec } from "./spec.js";

export interface Dispatcher {
  /** Tool schemas to advertise to the model (empty ⇒ model-only turn). */
  modelTools: ModelTool[];
  /** Map a model-emitted tool name to its step_type (defaults to 'function'). */
  resolveType(name: string): StepTypeToolName;
  /** Execute one tool call. Throws only if the tool name is unknown. */
  dispatch(call: ToolCall, ctx: RunCtx): Promise<ToolResult>;
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function buildDispatcher(
  decls: AgentToolDecl[],
  env: RunnerEnv,
  supabase: SupabaseClient
): Dispatcher {
  const deps = { env, supabase };
  const bound = new Map<string, { spec: ToolSpec; run: AgentTool["run"] }>();
  const modelTools: ModelTool[] = [];

  for (const decl of decls) {
    const spec = resolveSpec(decl);
    if (!spec) continue;
    const tool = spec.create(decl, deps);
    bound.set(spec.name, { spec, run: tool.run.bind(tool) });
    modelTools.push({
      type: "function",
      function: { name: spec.name, description: spec.description, parameters: spec.parameters },
    });
  }

  return {
    modelTools,
    // A tool spec's type is always a tool (never 'model'), so this narrowing is safe.
    resolveType: (name) => (bound.get(name)?.spec.type ?? "function") as StepTypeToolName,
    async dispatch(call, ctx) {
      const entry = bound.get(call.name);
      if (!entry) throw new Error(`No adapter for tool "${call.name}"`);
      const args = parseArgs(call.arguments);
      // Strict-ish arg check → feed a clear error back to the model (not a throw).
      const invalid = validateArgs(entry.spec, args);
      if (invalid) {
        return { output: { error: invalid }, metering: { units: 0, unitLabel: entry.spec.type } };
      }
      return entry.run(args, ctx);
    },
  };
}
