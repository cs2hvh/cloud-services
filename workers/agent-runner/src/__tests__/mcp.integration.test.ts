/**
 * MCP protocol integration test (doc 14 §9b L2 — "our mcp-client.ts actually
 * speaks MCP against a real server", not a fake).
 *
 * §9b's original sketch called for a Docker-gated reference server
 * (@modelcontextprotocol/server-everything). This does the same job without
 * Docker: the SDK we already depend on ships BOTH the client (mcp-client.ts
 * wraps it) and the server primitives (McpServer, StreamableHTTPServerTransport),
 * so we spin up a real MCP server in-process on a random localhost port and
 * point our real adapter at it over real HTTP. That's a genuine protocol
 * round-trip (initialize → tools/list → tools/call, real content[]/isError
 * shapes) — the exact thing a fake McpClient (used by mcp.test.ts's L1 suite)
 * can't catch — with no external infra dependency, so unlike the Docker-gated
 * sandbox integration tests this one is NOT skipped by default; it always runs.
 *
 * Exercises the real, unmodified adapter (connectMcpTools from mcp.ts +
 * openMcpClient from mcp-client.ts) — nothing here is reimplemented or mocked.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { connectMcpTools, resolveInlineMcpConfig } from "../tools/mcp.js";

let httpServer: Server;
let baseUrl: string;
let lastToolCallArgs: unknown;

function makeServer(): McpServer {
  const mcpServer = new McpServer({ name: "test-reference-server", version: "1.0.0" });

  mcpServer.registerTool(
    "add",
    {
      description: "Adds two numbers together.",
      inputSchema: { a: z.number(), b: z.number() },
    },
    async ({ a, b }: { a: number; b: number }) => {
      lastToolCallArgs = { a, b };
      return { content: [{ type: "text", text: String(a + b) }] };
    }
  );

  mcpServer.registerTool(
    "fail",
    { description: "Always returns a tool-level error.", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: "boom" }], isError: true })
  );

  return mcpServer;
}

beforeAll(async () => {
  // Stateless mode (sessionIdGenerator: undefined) has no continuity across
  // requests, so — matching the SDK's own reference example
  // (examples/server/simpleStatelessStreamableHttp.js) — each HTTP request
  // gets a brand-new McpServer + StreamableHTTPServerTransport pairing, torn
  // down after that one request. Reusing one transport across requests (the
  // stateful-mode pattern) breaks the second-and-later request under
  // stateless mode.
  httpServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      void (async () => {
        const parsed = body ? JSON.parse(body) : undefined;
        const mcpServer = makeServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await mcpServer.connect(transport);
        res.on("close", () => {
          void transport.close();
          void mcpServer.close();
        });
        await transport.handleRequest(req, res, parsed);
      })();
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("failed to bind test MCP server");
  baseUrl = `http://127.0.0.1:${address.port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("MCP protocol integration (real client + real server, no Docker)", () => {
  it("connects, lists tools, and calls one over real Streamable HTTP — full round-trip", async () => {
    const config = resolveInlineMcpConfig({ type: "mcp", server_url: baseUrl, label: "ref" });
    expect(config).not.toBeNull();

    const { tools, client } = await connectMcpTools(config!, { timeoutMs: 5000, allowPrivate: true });

    expect(tools.map((t) => t.name).sort()).toEqual(["mcp__ref__add", "mcp__ref__fail"]);
    const addTool = tools.find((t) => t.name === "mcp__ref__add")!;
    expect(addTool.description).toContain("Adds two numbers");
    // Real inputSchema from the real server, not a fake — proves listTools()
    // actually parses the wire response shape, not just a fixture.
    expect(addTool.parameters).toMatchObject({ type: "object" });

    const result = await addTool.tool.run({ a: 12, b: 30 }, {} as never);
    expect(result.output).toEqual({ result: "42" });
    expect(result.metering).toEqual({ units: 1, unitLabel: "mcp_call" });
    expect(lastToolCallArgs).toEqual({ a: 12, b: 30 });

    await client!.close();
  });

  it("surfaces a real tool-level isError as output, not a thrown exception", async () => {
    const config = resolveInlineMcpConfig({ type: "mcp", server_url: baseUrl, label: "ref2" });
    const { tools, client } = await connectMcpTools(config!, { timeoutMs: 5000, allowPrivate: true });

    const failTool = tools.find((t) => t.name === "mcp__ref2__fail")!;
    const result = await failTool.tool.run({}, {} as never);
    expect(result.output).toEqual({ error: "boom" });
    // Tool-level errors still bill — work happened on the server.
    expect(result.metering).toEqual({ units: 1, unitLabel: "mcp_call" });

    await client!.close();
  });

  it("honors allowed_tools against the real server's actual tool list", async () => {
    const config = resolveInlineMcpConfig({
      type: "mcp",
      server_url: baseUrl,
      label: "narrow",
      allowed_tools: ["add"],
    });
    const { tools, client } = await connectMcpTools(config!, { timeoutMs: 5000, allowPrivate: true });

    expect(tools.map((t) => t.name)).toEqual(["mcp__narrow__add"]);

    await client!.close();
  });

  it("rejects a plain-http URL when allowPrivate isn't set — the real HTTPS guard, not bypassed", async () => {
    const config = resolveInlineMcpConfig({ type: "mcp", server_url: baseUrl, label: "noguard" });
    const { tools, client } = await connectMcpTools(config!, { timeoutMs: 5000 }); // no allowPrivate

    expect(tools).toEqual([]);
    expect(client).toBeNull();
  });
});
