/**
 * Hosted web_search tool (S2.2).
 *
 * Proxied and brand-hidden behind a normalized citation envelope (§5). Two
 * providers behind one `WebSearchProvider` interface — **Brave** (default) and
 * **Exa** (opt-in via `WEB_SEARCH_PROVIDER=exa`); the upstream is never named in
 * anything returned to the customer (a scrub pass strips provider identifiers).
 */
import type { AgentTool, RunCtx, ToolResult } from "@ahura/agent-core";
import type { RunnerEnv } from "../env.js";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  search(query: string, maxResults: number, signal: AbortSignal): Promise<WebSearchResult[]>;
}

/** Strip any upstream-provider identifiers from customer-facing text (§11). */
export function scrubUpstream(text: string): string {
  return (text ?? "")
    .replace(/brave\s*search/gi, "web search")
    .replace(/\bbrave\b/gi, "search")
    .replace(/exa\s*search/gi, "web search")
    .replace(/\bexa\.ai\b/gi, "")
    .replace(/x-(subscription-token|api-key)/gi, "");
}

function braveProvider(apiKey: string): WebSearchProvider {
  return {
    async search(query, maxResults, signal) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const res = await fetch(url, {
        headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
        signal,
      });
      if (!res.ok) throw new Error(`search upstream returned ${res.status}`);
      const data = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.description ?? "",
      }));
    },
  };
}

/**
 * Exa (premium, opt-in) adapter — same interface as Brave, so the loop/tool never
 * change (§5 "offer both"). Requests highlight snippets so the citation envelope
 * has usable text. `x-api-key` header + provider name are brand-scrubbed downstream.
 */
function exaProvider(apiKey: string): WebSearchProvider {
  return {
    async search(query, maxResults, signal) {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, numResults: maxResults, contents: { highlights: { numSentences: 2 } } }),
        signal,
      });
      if (!res.ok) throw new Error(`search upstream returned ${res.status}`);
      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; highlights?: string[]; text?: string }>;
      };
      return (data.results ?? []).slice(0, maxResults).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.highlights?.[0] ?? (r.text ?? "").slice(0, 300),
      }));
    },
  };
}

/** Select the configured provider (Brave default, Exa opt-in) — both brand-hidden. */
function selectProvider(env: RunnerEnv): WebSearchProvider | null {
  if (!env.webSearchApiKey) return null;
  return env.webSearchProvider === "exa"
    ? exaProvider(env.webSearchApiKey)
    : braveProvider(env.webSearchApiKey);
}

export function webSearchTool(env: RunnerEnv, providerOverride?: WebSearchProvider): AgentTool {
  return {
    type: "web_search",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      const a = (args ?? {}) as { query?: unknown; max_results?: unknown };
      const query = typeof a.query === "string" ? a.query : String(a.query ?? "");
      const maxResults = Math.min(Math.max(Number(a.max_results ?? 5) || 5, 1), 10);

      const provider = providerOverride ?? selectProvider(env);
      if (!provider) {
        return {
          output: { error: "web_search is not configured on this deployment" },
          metering: { units: 0, unitLabel: "web_search" },
          detail: { configured: false },
        };
      }
      if (!query.trim()) {
        return {
          output: { error: "web_search requires a non-empty query" },
          metering: { units: 0, unitLabel: "web_search" },
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env.toolTimeoutMs);
      try {
        const raw = await provider.search(query, maxResults, ctx.signal ?? controller.signal);
        // Normalized, brand-scrubbed citation envelope — the only thing the model
        // and customer ever see. Numbered so the model can cite [1], [2], ….
        const citations = raw.map((r, i) => ({
          index: i + 1,
          title: scrubUpstream(r.title),
          url: r.url,
          snippet: scrubUpstream(r.snippet),
        }));
        return {
          output: { query, results: citations },
          metering: { units: 1, unitLabel: "web_search" },
          // Trace preview: the query + a few result titles/urls (already scrubbed).
          detail: {
            query,
            results: citations.slice(0, 5).map((c) => ({ title: c.title, url: c.url })),
            count: citations.length,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          output: { error: scrubUpstream(`web search failed: ${msg}`) },
          metering: { units: 0, unitLabel: "web_search" },
          detail: { ok: false },
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
