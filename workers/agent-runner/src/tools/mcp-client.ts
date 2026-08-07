/**
 * Thin wrapper over @modelcontextprotocol/sdk (M1 — doc 14 §2b).
 *
 * This is the ONLY file that imports the SDK. Everything else (mcp.ts,
 * mcp-attach.ts, tests) depends on the small `McpClient` interface below, so
 * unit tests inject a fake and an SDK upgrade touches this one file.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** MCP tool results are a structured array, not a plain string — see mcp.ts. */
export interface McpCallResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface McpClient {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: unknown, timeoutMs: number): Promise<McpCallResult>;
  close(): Promise<void>;
}

class TimeoutError extends Error {
  constructor(op: string) {
    super(`mcp ${op} timed out`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number, op: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new TimeoutError(op)), timeoutMs)),
  ]);
}

/** Connect to a remote MCP server over Streamable HTTP. Throws on failure —
 *  the caller (mcp.ts) treats connect failure as "skip this server" (best-effort). */
export async function openMcpClient(url: string, authToken: string | undefined, timeoutMs: number): Promise<McpClient> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined,
  });
  const client = new Client({ name: "ahura-agent-runner", version: "1.0.0" }, { capabilities: {} });
  await withTimeout(client.connect(transport), timeoutMs, "connect");

  return {
    async listTools() {
      const res = await withTimeout(client.listTools(), timeoutMs, "listTools");
      return (res.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      }));
    },
    async callTool(name, args, callTimeoutMs) {
      const res = await withTimeout(
        client.callTool({ name, arguments: args as Record<string, unknown> }),
        callTimeoutMs,
        "callTool"
      );
      return res as McpCallResult;
    },
    async close() {
      await client.close();
    },
  };
}
