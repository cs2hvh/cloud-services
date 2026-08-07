/**
 * Hosted agent-memory tool (S5) — durable, embeddings-searchable memory scoped to
 * one defined agent. One tool, two actions (fits the one-decl-one-spec registry):
 *
 *   memory({ action: "write",  content })  → embed + store a fact
 *   memory({ action: "search", query })    → embed + cosine-recall relevant facts
 *
 * Scoped by (org_id, agent_id, scope_key='default'): one agent's memory is never
 * visible to another org (RLS) or another agent (query filter). Requires a defined
 * agent — inline `/v1/responses` runs (no agent_id) get a clear "not available".
 *
 * RELIABILITY NOTE: recall must NOT depend on the model choosing to call this tool
 * — small models routinely skip an implicit "check memory first" step (confirmed
 * live: gpt-4o-mini answered "I don't know your name" with a stored, matching
 * memory sitting right there, because nothing forced it to search). So the runner
 * ALSO does an automatic recall before every run (see lifecycle.ts autoRecall*)
 * and injects hits straight into the transcript. This explicit tool remains for
 * (a) writing new facts and (b) an on-demand re-search if the model wants more —
 * `searchMemories` below is the one implementation both paths share.
 *
 * ZDR: memory is retention by definition, so a ZDR org must not write memory —
 * write is refused when `ctx.zdr` is set (the org's inference.orgs.zdr_default,
 * resolved per-run in lifecycle.ts). Auto-recall/search also skip ZDR orgs
 * (lifecycle.ts gates it) so a ZDR org never even reads back stored content.
 * Memory is also opt-in per agent (the tool is only attached when wanted).
 */
import type { AgentTool, RunCtx, ToolResult } from "@ahura/agent-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "../env.js";
import { embedText } from "../gateway.js";
import { preview } from "./detail.js";

/** Catalog embedding model (brand-hidden via the gateway); 1536 dims = the column. */
const MEMORY_EMBED_MODEL = "openai/text-embedding-3-small";
const MEMORY_EMBED_DIMS = 1536; // must match the agent_memories.embedding vector(1536) column
const SCOPE_KEY = "default";

const err = (message: string): ToolResult => ({
  output: { error: message },
  metering: { units: 0, unitLabel: "memory" },
});

interface MemoryRow {
  id: string;
  content: string;
  similarity: number;
  created_at: string;
}

export interface MemoryHit {
  content: string;
  similarity: number;
}

/** Shared embed+recall used by both the explicit `search` action and the
 *  runner's automatic pre-loop recall. Throws on failure (callers decide how
 *  to degrade — the explicit tool surfaces it as output, auto-recall swallows it). */
export async function searchMemories(
  env: RunnerEnv,
  supabase: SupabaseClient,
  agentId: string,
  query: string,
  limit: number,
  orgId: string
): Promise<{ results: MemoryHit[]; tokens: number }> {
  const { embedding, tokens } = await embedText(env, MEMORY_EMBED_MODEL, query, orgId);
  if (embedding.length !== MEMORY_EMBED_DIMS) throw new Error("memory embedding has unexpected dimensions");
  const { data, error } = await supabase.schema("agentcore").rpc("search_agent_memories", {
    p_agent_id: agentId,
    p_scope_key: SCOPE_KEY,
    p_query_embedding: JSON.stringify(embedding),
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const rows = (data as unknown as MemoryRow[] | null) ?? [];
  return {
    results: rows.map((r) => ({ content: r.content, similarity: Number(Number(r.similarity).toFixed(4)) })),
    tokens,
  };
}

/** Cheap existence check so auto-recall skips the embed call entirely for an
 *  agent with zero stored memories (common: first run, or memory unused yet). */
export async function hasAnyMemories(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  const { count } = await supabase
    .schema("agentcore")
    .from("agent_memories")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("scope_key", SCOPE_KEY);
  return (count ?? 0) > 0;
}

export function memoryTool(env: RunnerEnv, supabase: SupabaseClient): AgentTool {
  return {
    type: "memory",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      if (!ctx.agentId) return err("memory is only available on a defined agent");
      const a = (args ?? {}) as { action?: unknown; content?: unknown; query?: unknown; max_results?: unknown };
      const action = a.action === "write" ? "write" : a.action === "search" ? "search" : null;
      if (!action) return err('memory requires action "write" or "search"');

      try {
        if (action === "write") {
          // ZDR: a zero-data-retention org must not persist customer content. Refuse
          // the write (no-op) rather than silently storing — the model sees it clearly.
          if (ctx.zdr) return err("memory write is disabled for this org (zero data retention)");
          const content = typeof a.content === "string" ? a.content : String(a.content ?? "");
          if (!content.trim()) return err("memory write requires non-empty `content`");
          const { embedding, tokens } = await embedText(env, MEMORY_EMBED_MODEL, content, ctx.orgId);
          // Guard against a wrong-dim embedding (mirrors file_search): a clear tool
          // error the model can react to, instead of an opaque pgvector insert failure.
          if (embedding.length !== MEMORY_EMBED_DIMS) return err("memory embedding has unexpected dimensions");
          const { error } = await supabase.schema("agentcore").from("agent_memories").insert({
            org_id: ctx.orgId,
            agent_id: ctx.agentId,
            scope_key: SCOPE_KEY,
            content,
            embedding: JSON.stringify(embedding), // pgvector accepts a JSON-stringified array
          });
          if (error) throw new Error(error.message);
          return {
            output: { stored: true },
            metering: { units: 1, unitLabel: "memory_write" },
            detail: { action, input: preview(content, 240), embed_tokens: tokens },
          };
        }

        // action === "search" — an explicit on-demand re-search (auto-recall
        // already ran before the loop; the model uses this if it wants more/different).
        const query = typeof a.query === "string" ? a.query : String(a.query ?? "");
        if (!query.trim()) return err("memory search requires a non-empty `query`");
        const topK = Math.min(Math.max(Number(a.max_results ?? 5) || 5, 1), 20);
        const { results, tokens } = await searchMemories(env, supabase, ctx.agentId, query, topK, ctx.orgId);
        const withIndex = results.map((r, i) => ({ index: i + 1, content: r.content, score: r.similarity }));
        return {
          output: { query, results: withIndex },
          metering: { units: 1, unitLabel: "memory_search" },
          detail: { action, query, snippets: withIndex.slice(0, 3).map((r) => preview(r.content, 200)), count: withIndex.length, embed_tokens: tokens },
        };
      } catch (e) {
        return err(`memory ${action} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
