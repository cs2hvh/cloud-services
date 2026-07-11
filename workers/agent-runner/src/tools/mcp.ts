/**
 * MCP client adapter (M1 — doc 14). Resolves an inline `McpToolDecl` into the
 * config shape every mode (inline now, registry in M3) produces, connects,
 * lists tools, and wraps each into a namespaced, scrubbed AgentTool.
 *
 * Security (doc 14 §5): SSRF-guard the server URL before connecting; treat
 * every tool description/name/result as untrusted (scrub + cap); namespace so
 * a server can't shadow a hosted tool; one bad server never fails the run.
 */
import type { AgentTool, McpToolDecl, ToolResult } from "@ahura/agent-core";
import { assertSafeWebhookUrl, SsrfBlockedError } from "./ssrf.js";
import { preview } from "./detail.js";
import { openMcpClient, type McpCallResult, type McpClient, type McpToolInfo } from "./mcp-client.js";

const DESC_CAP = 1024;
const MAX_TOOLS_PER_SERVER = 20;

/** The shape both inline (server_url) and registry (server_slug, M3+) modes
 *  resolve to — the adapter is agnostic to where config came from (§4). */
export interface ResolvedMcpConfig {
  url: string;
  token?: string;
  label: string;
  allowedTools?: string[];
  /** Registry mode only (§4 "tool_schemas cache = the scalability win"): the
   *  schema-refresh cron's cached tools/list for this server. When present
   *  and non-empty, connectMcpTools advertises tools straight from this
   *  instead of connecting here — the actual connection opens lazily, only
   *  once the model calls one of this server's tools. Absent for inline mode
   *  (nothing to cache for a one-off URL) and for a registry row the cron
   *  hasn't refreshed yet. */
  cachedTools?: McpToolInfo[];
}

export interface McpBoundTool {
  /** Namespaced, model-facing name: `mcp__{label}__{tool}`. */
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  tool: AgentTool;
}

/** Exported: reused by mcp-registry.ts (M3) to derive a label from a
 *  registered server's display_name — kept here since it's the same pure
 *  rule the inline mode uses, not registry-specific logic. */
export function sanitizeLabel(s: string): string {
  const cleaned = s.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24);
  return cleaned || "server";
}

/** Resolve an inline decl into the adapter's config shape. Registry-mode
 *  (server_slug → agentcore.mcp_servers) resolution lands in M3 and produces
 *  the exact same ResolvedMcpConfig, so this function is the only thing that
 *  needs a sibling, not a replacement, when M3 ships. */
export function resolveInlineMcpConfig(decl: McpToolDecl): ResolvedMcpConfig | null {
  if (!decl.server_url) return null; // registry mode or malformed — M3 handles server_slug
  let label: string;
  try {
    label = sanitizeLabel(decl.label ?? new URL(decl.server_url).host);
  } catch {
    return null; // malformed URL — caller treats this like a connect failure
  }
  return { url: decl.server_url, token: decl.auth_token, label, allowedTools: decl.allowed_tools };
}

/**
 * MCP tool results are a STRUCTURED array — { content: [{type:'text'|'image'|
 * 'resource', text?}], isError? } — NOT a plain string. Flatten text parts,
 * replace non-text parts with a placeholder (never raw bytes into the model/
 * trace), and surface isError so the caller feeds it back as tool output.
 */
export function flattenMcpResult(result: McpCallResult): { text: string; isError: boolean } {
  const parts = (result?.content ?? []).map((c) =>
    c.type === "text" ? (c.text ?? "") : `[${c.type} omitted]`
  );
  return { text: parts.join("\n"), isError: result?.isError === true };
}

/** Wraps openClient so the actual `connect` doesn't happen until the first
 *  `listTools`/`callTool` — used only on the cached-schema path, where we
 *  already know the tool list without connecting (§4/§6: "only opens a
 *  connection when a tool is actually called"). `close()` no-ops if the
 *  connection was never actually opened (a run that never calls this
 *  server's tools closes nothing). */
function makeLazyClient(
  url: string,
  token: string | undefined,
  timeoutMs: number,
  openClient: typeof openMcpClient
): McpClient {
  let clientPromise: Promise<McpClient> | null = null;
  const getClient = () => (clientPromise ??= openClient(url, token, timeoutMs));
  return {
    listTools: () => getClient().then((c) => c.listTools()),
    callTool: (name, args, callTimeoutMs) => getClient().then((c) => c.callTool(name, args, callTimeoutMs)),
    async close() {
      if (!clientPromise) return;
      await (await clientPromise).close();
    },
  };
}

function mcpCallTool(client: McpClient, toolName: string, timeoutMs: number): AgentTool {
  return {
    type: "mcp",
    async run(args: unknown): Promise<ToolResult> {
      try {
        const raw = await client.callTool(toolName, args, timeoutMs);
        const { text, isError } = flattenMcpResult(raw);
        const out = preview(text, 4000);
        return {
          // A tool-level error (isError) is fed back as output, not thrown —
          // the model can react (retry / try another tool), same as function.
          output: isError ? { error: out } : { result: out },
          metering: { units: 1, unitLabel: "mcp_call" }, // billed even on tool-error (work happened)
          detail: { tool: toolName, status: isError ? "error" : "ok", output: out },
        };
      } catch (e) {
        // Transport/timeout failure (not a tool-level error): no work billed.
        return {
          output: { error: `mcp call failed: ${e instanceof Error ? e.message : String(e)}` },
          metering: { units: 0, unitLabel: "mcp_call" },
        };
      }
    },
  };
}

/**
 * One MCP server → its bound tools (namespaced, scrubbed, allow-listed).
 * Best-effort: any failure (SSRF block, connect timeout, malformed URL)
 * returns `{tools: [], client: null}` so one bad server never fails the run
 * (§7 scenario 3) — the caller just doesn't advertise that server's tools.
 */
export async function connectMcpTools(
  config: ResolvedMcpConfig,
  opts: { timeoutMs: number; allowPrivate?: boolean },
  // Injectable for L1 unit tests (a fake client, no network/SDK); production
  // call sites never pass this, so they get the real openMcpClient.
  openClient: typeof openMcpClient = openMcpClient
): Promise<{ tools: McpBoundTool[]; client: McpClient | null }> {
  try {
    await assertSafeWebhookUrl(config.url, { allowPrivate: opts.allowPrivate });
    // HTTPS is required outside the explicit dev override (§10 decision #4) —
    // reuses the same escape hatch as function-webhook's AGENT_WEBHOOK_ALLOW_PRIVATE.
    if (!opts.allowPrivate && new URL(config.url).protocol !== "https:") {
      throw new SsrfBlockedError("MCP server URL must use https in this environment");
    }

    const allow = config.allowedTools?.length ? new Set(config.allowedTools) : null;

    if (config.cachedTools?.length) {
      // Scalability path (§4/§6): advertise from the schema-refresh cron's
      // cache instead of connecting here. Real connection opens lazily, only
      // if the model actually calls one of this server's tools; if the
      // server has since gone down, that call fails as tool output (§7
      // scenario 4), same as any other transport failure — it just isn't
      // caught at build time anymore for cached servers.
      const client = makeLazyClient(config.url, config.token, opts.timeoutMs, openClient);
      const tools: McpBoundTool[] = config.cachedTools
        .filter((t) => (allow ? allow.has(t.name) : true))
        .slice(0, MAX_TOOLS_PER_SERVER)
        .map((t) => ({
          name: `mcp__${config.label}__${t.name}`,
          description: preview(t.description ?? "", DESC_CAP),
          parameters: t.inputSchema ?? { type: "object", properties: {} },
          tool: mcpCallTool(client, t.name, opts.timeoutMs),
        }));
      return { tools, client };
    }

    const client = await openClient(config.url, config.token, opts.timeoutMs);
    const listed = await client.listTools();

    const tools: McpBoundTool[] = listed
      .filter((t) => (allow ? allow.has(t.name) : true))
      .slice(0, MAX_TOOLS_PER_SERVER)
      .map((t) => ({
        name: `mcp__${config.label}__${t.name}`,
        description: preview(t.description ?? "", DESC_CAP),
        parameters: t.inputSchema ?? { type: "object", properties: {} },
        tool: mcpCallTool(client, t.name, opts.timeoutMs),
      }));
    return { tools, client };
  } catch {
    return { tools: [], client: null };
  }
}
