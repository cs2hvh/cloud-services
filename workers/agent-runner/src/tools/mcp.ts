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
import { openMcpClient, type McpCallResult, type McpClient } from "./mcp-client.js";

const DESC_CAP = 1024;
const MAX_TOOLS_PER_SERVER = 20;

/** The shape both inline (server_url) and registry (server_slug, M3+) modes
 *  resolve to — the adapter is agnostic to where config came from (§4). */
export interface ResolvedMcpConfig {
  url: string;
  token?: string;
  label: string;
  allowedTools?: string[];
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

    const client = await openClient(config.url, config.token, opts.timeoutMs);
    const listed = await client.listTools();
    const allow = config.allowedTools?.length ? new Set(config.allowedTools) : null;

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
