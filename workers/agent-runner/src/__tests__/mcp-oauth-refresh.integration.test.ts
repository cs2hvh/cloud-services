/**
 * MCP OAuth token resolution + refresh — protocol integration test (M6, doc
 * 14 §10 decision #2).
 *
 * Mirrors mcp.integration.test.ts's approach (a real local server, no
 * Docker, no fakes for the protocol layer) applied to the highest-risk new
 * code path: agent-runner refreshing an expired OAuth access token
 * completely unattended, with no human in the loop to notice a silent
 * failure. Exercises the real `refreshAuthorization` from the SDK against a
 * real (hand-rolled, minimal) OAuth token endpoint over real HTTP — only the
 * Supabase client is faked, since resolveRegistryMcpConfig's actual database
 * queries are already covered by mcp-registry.test.ts's existing fakes and
 * this repo's "never run migrations" policy means there's no live DB with
 * the new oauth_* columns to test against yet.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { resolveRegistryMcpConfig } from "../tools/mcp-registry.js";
import { encryptMcpToken, decryptMcpToken } from "../tools/mcp-crypto.js";

const DEK = Buffer.alloc(32, 3).toString("base64");

let authServer: Server;
let authServerUrl: string;
let currentRefreshToken = "refresh-v1";
let issuedAccessTokenCount = 0;
let rejectNextRefresh = false;

beforeAll(async () => {
  authServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/token") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const grantType = params.get("grant_type");
        const suppliedRefreshToken = params.get("refresh_token");

        if (grantType !== "refresh_token" || suppliedRefreshToken !== currentRefreshToken || rejectNextRefresh) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "refresh token is invalid or expired" }));
          return;
        }

        issuedAccessTokenCount++;
        currentRefreshToken = `refresh-v${issuedAccessTokenCount + 1}`; // rotates each refresh, like many real providers
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: `access-v${issuedAccessTokenCount}`,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: currentRefreshToken,
          })
        );
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => authServer.listen(0, "127.0.0.1", resolve));
  const address = authServer.address();
  if (!address || typeof address === "string") throw new Error("failed to bind fake auth server");
  authServerUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => authServer.close(() => resolve()));
});

/** A fake Supabase client covering exactly the two query shapes
 *  resolveRegistryMcpConfig / resolveOAuthToken issue: a single-row select
 *  (`.maybeSingle()`) and an update-by-id. Records every update so the test
 *  can assert what got persisted, and decrypt it back to confirm
 *  correctness. */
function fakeSupabase(row: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    schema() {
      return {
        from() {
          return {
            select() {
              return this;
            },
            or() {
              return this;
            },
            eq() {
              return this;
            },
            update(patch: Record<string, unknown>) {
              updates.push(patch);
              return { eq: () => Promise.resolve({ error: null }) };
            },
            maybeSingle: () => Promise.resolve({ data: row }),
          };
        },
      };
    },
  };
  return { supabase: supabase as never, updates };
}

const baseRow = {
  id: "row-1",
  org_id: "org-1",
  slug: "oauth-server",
  server_url: "https://example.com/mcp", // arbitrary — never actually fetched in these tests, only the auth server is
  auth_type: "oauth" as const,
  auth_token_enc: null,
  oauth_client_id: "client-abc",
  oauth_client_secret_enc: null,
  allowed_tools: null,
  status: "active",
};

describe("resolveRegistryMcpConfig — OAuth token resolution + refresh (real protocol, no DB)", () => {
  it("uses the stored access token directly when it isn't expired yet — no refresh call made", async () => {
    const accessTokenEnc = await encryptMcpToken("still-valid-access-token", DEK);
    const { supabase, updates } = fakeSupabase({
      ...baseRow,
      oauth_access_token_enc: accessTokenEnc,
      oauth_refresh_token_enc: await encryptMcpToken("unused-refresh", DEK),
      oauth_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h out
      oauth_authorization_server_url: authServerUrl,
    });

    const config = await resolveRegistryMcpConfig(supabase, "org-1", "oauth-server", DEK, undefined, true);

    expect(config?.token).toBe("still-valid-access-token");
    expect(updates.length).toBe(0); // no refresh needed, no DB write
  });

  it("refreshes an expired token against the real token endpoint and persists the new tokens, re-encrypted", async () => {
    issuedAccessTokenCount = 0;
    currentRefreshToken = "refresh-v1";
    const refreshTokenEnc = await encryptMcpToken("refresh-v1", DEK);
    const { supabase, updates } = fakeSupabase({
      ...baseRow,
      oauth_access_token_enc: await encryptMcpToken("stale-access-token", DEK),
      oauth_refresh_token_enc: refreshTokenEnc,
      oauth_token_expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
      oauth_authorization_server_url: authServerUrl,
    });

    const config = await resolveRegistryMcpConfig(supabase, "org-1", "oauth-server", DEK, undefined, true);

    expect(config?.token).toBe("access-v1"); // the real token minted by the fake auth server
    expect(updates.length).toBe(1);
    expect(updates[0].oauth_status).toBe("connected");
    expect(updates[0].oauth_last_error).toBeNull();

    // Prove the persisted ciphertext is genuinely usable — decrypt it back
    // rather than just asserting a string was present.
    const persistedAccess = await decryptMcpToken(updates[0].oauth_access_token_enc as string, DEK);
    const persistedRefresh = await decryptMcpToken(updates[0].oauth_refresh_token_enc as string, DEK);
    expect(persistedAccess).toBe("access-v1");
    expect(persistedRefresh).toBe("refresh-v2"); // the provider rotated it — proves we stored the NEW one, not the old
  });

  it("treats a revoked/invalid refresh token as a connect failure — returns null, records the error, never throws", async () => {
    issuedAccessTokenCount = 0;
    currentRefreshToken = "refresh-v1";
    rejectNextRefresh = true;
    const { supabase, updates } = fakeSupabase({
      ...baseRow,
      oauth_access_token_enc: await encryptMcpToken("stale-access-token", DEK),
      oauth_refresh_token_enc: await encryptMcpToken("refresh-v1", DEK),
      oauth_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      oauth_authorization_server_url: authServerUrl,
    });

    const config = await resolveRegistryMcpConfig(supabase, "org-1", "oauth-server", DEK, undefined, true);
    rejectNextRefresh = false;

    expect(config).toBeNull(); // best-effort skip (§7 scenario 3), not a thrown error
    expect(updates.length).toBe(1);
    expect(updates[0].oauth_status).toBe("error");
    expect(updates[0].oauth_last_error).toBeTruthy();
  });

  it("fails closed with no DEK — never attempts a network call", async () => {
    const { supabase, updates } = fakeSupabase({
      ...baseRow,
      oauth_access_token_enc: await encryptMcpToken("whatever", DEK),
      oauth_refresh_token_enc: await encryptMcpToken("whatever", DEK),
      oauth_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      oauth_authorization_server_url: authServerUrl,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const config = await resolveRegistryMcpConfig(supabase, "org-1", "oauth-server", null, undefined, true);

    expect(config).toBeNull();
    expect(updates.length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns null when there's no refresh token to fall back on", async () => {
    const { supabase } = fakeSupabase({
      ...baseRow,
      oauth_access_token_enc: null,
      oauth_refresh_token_enc: null,
      oauth_token_expires_at: null,
      oauth_authorization_server_url: authServerUrl,
    });

    const config = await resolveRegistryMcpConfig(supabase, "org-1", "oauth-server", DEK, undefined, true);
    expect(config).toBeNull();
  });
});
