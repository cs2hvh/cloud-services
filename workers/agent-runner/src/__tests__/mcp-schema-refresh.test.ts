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

  // ── OAuth-mode rows (M6 follow-up: this sweep predated OAuth and, before
  // the fix, would health-check every oauth server with no Authorization
  // header at all — a guaranteed, spurious failure). ────────────────────────

  it("skips a pending (never-connected) OAuth server instead of attempting a doomed connect", async () => {
    const { client, updates } = fakeSupabase([
      { id: "o1", server_url: "https://needs-oauth.example.com/mcp", auth_token_enc: null, auth_type: "oauth", oauth_status: "pending" },
    ]);
    const openClient = fakeOpenClient(async () => ({ listTools: async () => [], callTool: async () => ({}), close: async () => undefined }));

    const summary = await refreshAllMcpServers({ supabase: client, dek: "irrelevant", timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary).toEqual({ checked: 1, ok: 0, failed: 0 }); // seen, not attempted — neither ok nor failed
    expect(openClient).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0); // status/oauth_status left untouched
  });

  it("health-checks a connected OAuth server by reusing the real resolve-and-refresh path", async () => {
    const dek = Buffer.alloc(32, 5).toString("base64");
    const { encryptMcpToken } = await import("../tools/mcp-crypto.js");
    const { client, updates } = fakeSupabase([
      {
        id: "o2",
        server_url: "https://needs-oauth.example.com/mcp",
        auth_token_enc: null,
        auth_type: "oauth",
        oauth_status: "connected",
        oauth_client_id: "client-1",
        oauth_client_secret_enc: null,
        oauth_access_token_enc: await encryptMcpToken("valid-access-token", dek),
        oauth_refresh_token_enc: null,
        oauth_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // still valid, no refresh needed
        oauth_authorization_server_url: "https://auth.example.com",
      },
    ]);
    const openClient = fakeOpenClient(async (_url: string, token?: string) => {
      expect(token).toBe("valid-access-token"); // proves the resolved OAuth token actually reached the connect call
      return { listTools: async () => [{ name: "ping" }], callTool: async () => ({}), close: async () => undefined };
    });

    const summary = await refreshAllMcpServers({ supabase: client, dek, timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary).toEqual({ checked: 1, ok: 1, failed: 0 });
    expect(updates.find((u) => u.id === "o2")).toMatchObject({ patch: { status: "active" } });
  });

  it("marks an OAuth server error when its refresh token is no longer valid, without crashing the sweep", async () => {
    const dek = Buffer.alloc(32, 5).toString("base64");
    const { encryptMcpToken } = await import("../tools/mcp-crypto.js");
    const { client, updates } = fakeSupabase([
      {
        id: "o3",
        server_url: "https://needs-oauth.example.com/mcp",
        auth_token_enc: null,
        auth_type: "oauth",
        oauth_status: "connected",
        oauth_client_id: "client-1",
        oauth_client_secret_enc: null,
        oauth_access_token_enc: await encryptMcpToken("expired-access-token", dek),
        oauth_refresh_token_enc: null, // no refresh token to fall back on -> resolveOAuthToken returns null
        oauth_token_expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
        oauth_authorization_server_url: "https://auth.example.com",
      },
    ]);
    const openClient = fakeOpenClient(async () => ({ listTools: async () => [], callTool: async () => ({}), close: async () => undefined }));

    const summary = await refreshAllMcpServers({ supabase: client, dek, timeoutMs: 1000, allowPrivate: true, openClient });

    expect(summary).toEqual({ checked: 1, ok: 0, failed: 1 });
    expect(openClient).not.toHaveBeenCalled(); // never even attempts to connect without a usable token
    expect(updates.find((u) => u.id === "o3")).toMatchObject({ patch: { status: "error", last_error: "OAuth token unavailable or refresh failed" } });
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
