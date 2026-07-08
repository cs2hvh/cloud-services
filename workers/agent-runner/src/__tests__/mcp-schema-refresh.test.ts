/**
 * MCP schema-refresh tests (M4 follow-up, doc 14 §4/§7 scenario 13). Fake
 * supabase + fake openClient — no network, no DB, matching §2b's "every unit
 * tests in isolation" rule.
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshAllMcpServers } from "../tools/mcp-schema-refresh.js";
import type { McpClient } from "../tools/mcp-client.js";

/** Chainable fake supabase: tracks every .update(...).eq("id", x) call so
 *  tests can assert exactly what got written for which row. */
function fakeSupabase(rows: unknown[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    schema: () => ({
      from: () => ({
        select: () => ({
          neq: () => ({
            returns: async () => ({ data: rows, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            updates.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, updates };
}

function fakeOpenClient(behavior: (url: string) => Promise<McpClient>) {
  return vi.fn(behavior);
}

describe("refreshAllMcpServers", () => {
  it("marks a reachable server active, stores its tool list, clears last_error", async () => {
    const { client, updates } = fakeSupabase([
      { id: "s1", server_url: "https://good.example.com/mcp", auth_token_enc: null },
    ]);
    const openClient = fakeOpenClient(async () => ({
      listTools: async () => [{ name: "ping" }],
      callTool: async () => ({}),
      close: async () => undefined,
    }));

    const summary = await refreshAllMcpServers({ supabase: client, dek: null, timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary).toEqual({ checked: 1, ok: 1, failed: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "s1",
      patch: { status: "active", last_error: null, tool_schemas: [{ name: "ping" }] },
    });
  });

  it("marks an unreachable server error, with a last_error message, and never crashes the sweep", async () => {
    const { client, updates } = fakeSupabase([
      { id: "s2", server_url: "https://dead.example.com/mcp", auth_token_enc: null },
    ]);
    const openClient = fakeOpenClient(async () => {
      throw new Error("connect refused");
    });

    const summary = await refreshAllMcpServers({ supabase: client, dek: null, timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary).toEqual({ checked: 1, ok: 0, failed: 1 });
    expect(updates[0]).toMatchObject({ id: "s2", patch: { status: "error", last_error: "connect refused" } });
  });

  it("rejects an SSRF-blocked URL before ever calling openClient, marks error", async () => {
    const { client, updates } = fakeSupabase([
      { id: "s3", server_url: "http://169.254.169.254/mcp", auth_token_enc: null },
    ]);
    const openClient = fakeOpenClient(async () => ({ listTools: async () => [], callTool: async () => ({}), close: async () => undefined }));

    const summary = await refreshAllMcpServers({ supabase: client, dek: null, timeoutMs: 1000, openClient });

    expect(summary.failed).toBe(1);
    expect(openClient).not.toHaveBeenCalled();
    expect(updates[0].patch.status).toBe("error");
  });

  it("fails closed on a token-bearing row when no DEK is configured — never leaks a decrypt attempt", async () => {
    const { client, updates } = fakeSupabase([
      { id: "s4", server_url: "https://needs-auth.example.com/mcp", auth_token_enc: "\\xdeadbeef" },
    ]);
    const openClient = fakeOpenClient(async () => ({ listTools: async () => [], callTool: async () => ({}), close: async () => undefined }));

    const summary = await refreshAllMcpServers({ supabase: client, dek: null, timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary.failed).toBe(1);
    expect(openClient).not.toHaveBeenCalled();
    expect(updates[0].patch.last_error).toMatch(/no DEK configured/);
  });

  it("one bad server never stops the sweep from checking the rest", async () => {
    const { client, updates } = fakeSupabase([
      { id: "bad", server_url: "https://dead.example.com/mcp", auth_token_enc: null },
      { id: "good", server_url: "https://good.example.com/mcp", auth_token_enc: null },
    ]);
    const openClient = vi.fn(async (url: string) => {
      if (url.includes("dead")) throw new Error("timeout");
      return { listTools: async () => [{ name: "x" }], callTool: async () => ({}), close: async () => undefined };
    });

    const summary = await refreshAllMcpServers({ supabase: client, dek: null, timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary).toEqual({ checked: 2, ok: 1, failed: 1 });
    expect(updates.map((u) => u.id).sort()).toEqual(["bad", "good"]);
  });

  it("returns a zero summary (no crash) when the list query itself fails", async () => {
    const client = {
      schema: () => ({
        from: () => ({
          select: () => ({
            neq: () => ({ returns: async () => ({ data: null, error: { message: "db down" } }) }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(refreshAllMcpServers({ supabase: client, dek: null, timeoutMs: 1000 })).resolves.toEqual({
      checked: 0, ok: 0, failed: 0,
    });
  });
});
