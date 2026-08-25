/**
 * Registry-mode resolution tests (M3, doc 14 §4). Fake supabase client — no
 * network, no DB, matching the §2b "every unit tests in isolation" rule.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRegistryMcpConfig } from "../tools/mcp-registry.js";
import { decryptMcpToken } from "../tools/mcp-crypto.js";

const DEK = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 zero bytes, base64 — test-only

/** Encrypt with the exact same AES-GCM format mcp-crypto.ts decrypts (mirrors
 *  lib/inference/crypto.ts's encryptAesGcm), so we can round-trip in a test
 *  without needing the app's encryption code. */
async function encryptForTest(plaintext: string, base64Dek: string): Promise<string> {
  const raw = Uint8Array.from(Buffer.from(base64Dek, "base64"));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const cipher = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(cipher, iv.byteLength);
  let hex = "";
  for (const b of combined) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

/** Chainable fake supabase: .schema().from().select().or().eq().maybeSingle() */
function fakeSupabase(row: unknown): SupabaseClient {
  const chain = {
    select: () => chain,
    or: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row }),
  };
  return { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
}

describe("decryptMcpToken", () => {
  it("round-trips a token encrypted with the matching AES-GCM format", async () => {
    const enc = await encryptForTest("shhh_registry_token", DEK);
    await expect(decryptMcpToken(enc, DEK)).resolves.toBe("shhh_registry_token");
  });

  it("throws on a malformed/too-short ciphertext", async () => {
    await expect(decryptMcpToken("\\x00", DEK)).rejects.toThrow();
  });

  it("throws when the DEK is wrong (auth tag fails)", async () => {
    const enc = await encryptForTest("secret", DEK);
    const wrongDek = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU=";
    await expect(decryptMcpToken(enc, wrongDek)).rejects.toThrow();
  });
});

describe("resolveRegistryMcpConfig", () => {
  it("resolves an active row with no token into a ResolvedMcpConfig", async () => {
    const supa = fakeSupabase({
      slug: "docs", display_name: "Docs Server", server_url: "https://docs.example.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "active",
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "docs", null);
    expect(cfg).toEqual({ url: "https://docs.example.com/mcp", token: undefined, label: "docs", allowedTools: undefined });
  });

  // Regression (found live, 2026-07-07): the label used to come from
  // display_name, which is free text — a punctuated name like "DeepWiki
  // (GitHub repo Q&A)" got mangled by sanitizeLabel's 24-char cut into an
  // ugly, truncated tool name (mcp__deepwiki__github_repo_q___ask_question
  // instead of mcp__deepwiki__ask_question). The slug is already validated
  // clean at registration, so it must be what's used for the namespace label.
  it("derives the label from the SLUG, not the (possibly messy) display_name", async () => {
    const supa = fakeSupabase({
      slug: "deepwiki", display_name: "DeepWiki (GitHub repo Q&A)", server_url: "https://mcp.deepwiki.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "active",
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "deepwiki", null);
    expect(cfg?.label).toBe("deepwiki");
  });

  it("decrypts a stored token when a dek is provided", async () => {
    const enc = await encryptForTest("bearer_xyz", DEK);
    const supa = fakeSupabase({
      slug: "github", display_name: "GitHub", server_url: "https://gh.example.com/mcp",
      auth_token_enc: enc, allowed_tools: ["search"], status: "active",
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "github", DEK);
    expect(cfg?.token).toBe("bearer_xyz");
    expect(cfg?.allowedTools).toEqual(["search"]);
  });

  // Regression (found live, 2026-07-07): declOverrides used to not exist at
  // all — an agent's own `allowed_tools` on a {server_slug} decl was silently
  // dropped, so doc 14 §4's "agent decl can narrow further" never narrowed
  // anything. Confirmed live: a real Context7 server, allowed_tools set to
  // only "resolve-library-id", still let the model call "query-docs" too.
  it("a decl's own allowed_tools narrows further when the row has NO restriction of its own", async () => {
    const supa = fakeSupabase({
      slug: "context7", display_name: "Context7", server_url: "https://mcp.context7.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "active",
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "context7", null, { allowedTools: ["resolve-library-id"] });
    expect(cfg?.allowedTools).toEqual(["resolve-library-id"]);
  });

  it("a decl's allowed_tools intersects with the row's own restriction, not replaces it", async () => {
    const supa = fakeSupabase({
      slug: "context7", display_name: "Context7", server_url: "https://mcp.context7.com/mcp",
      auth_token_enc: null, allowed_tools: ["resolve-library-id", "query-docs"], status: "active",
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "context7", null, { allowedTools: ["resolve-library-id", "some-other-tool"] });
    expect(cfg?.allowedTools).toEqual(["resolve-library-id"]);
  });

  it("a decl-level label override wins over the slug-derived default", async () => {
    const supa = fakeSupabase({
      slug: "context7", display_name: "Context7", server_url: "https://mcp.context7.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "active",
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "context7", null, { label: "docstool" });
    expect(cfg?.label).toBe("docstool");
  });

  it("fails closed (null) when the row has a token but no dek is configured", async () => {
    const enc = await encryptForTest("bearer_xyz", DEK);
    const supa = fakeSupabase({
      slug: "github", display_name: "GitHub", server_url: "https://gh.example.com/mcp",
      auth_token_enc: enc, allowed_tools: [], status: "active",
    });
    await expect(resolveRegistryMcpConfig(supa, "org_1", "github", null)).resolves.toBeNull();
  });

  it("returns null when no matching row exists", async () => {
    const supa = fakeSupabase(null);
    await expect(resolveRegistryMcpConfig(supa, "org_1", "nope", null)).resolves.toBeNull();
  });

  it("returns null for a disabled/error server (status != active)", async () => {
    const supa = fakeSupabase({
      slug: "flaky", display_name: "Flaky", server_url: "https://flaky.example.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "error",
    });
    await expect(resolveRegistryMcpConfig(supa, "org_1", "flaky", null)).resolves.toBeNull();
  });

  // §4/§6 scalability path: the schema-refresh cron populates tool_schemas so
  // the per-run adapter can skip connect()+listTools() and advertise from the
  // cache instead (mcp.ts's connectMcpTools branches on ResolvedMcpConfig's
  // cachedTools). This resolver's only job is to pass the cache through.
  it("passes a populated tool_schemas cache through as cachedTools", async () => {
    const supa = fakeSupabase({
      slug: "docs", display_name: "Docs Server", server_url: "https://docs.example.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "active",
      tool_schemas: [{ name: "search", description: "Search docs" }],
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "docs", null);
    expect(cfg?.cachedTools).toEqual([{ name: "search", description: "Search docs" }]);
  });

  it("omits cachedTools when tool_schemas is empty or absent (never swept yet)", async () => {
    const supa = fakeSupabase({
      slug: "docs", display_name: "Docs Server", server_url: "https://docs.example.com/mcp",
      auth_token_enc: null, allowed_tools: [], status: "active",
      tool_schemas: [],
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "docs", null);
    expect(cfg?.cachedTools).toBeUndefined();
  });

  // The tool_schemas cache and OAuth token resolution are two independent
  // branches inside resolveRegistryMcpConfig (auth_type dispatch vs. the
  // tool_schemas passthrough at the end) — proven separately elsewhere, but
  // never together. This confirms an oauth-mode row with a still-valid
  // (unexpired) access token resolves BOTH correctly in the same call: the
  // real decrypted bearer token AND the cached tool list, so a cached OAuth
  // server genuinely skips both the connect+listTools round trip and (since
  // the token isn't expired) the refresh round trip too.
  it("an oauth-mode row with a still-valid token resolves both the token AND the tool_schemas cache", async () => {
    const enc = await encryptForTest("oauth_access_xyz", DEK);
    const supa = fakeSupabase({
      slug: "gh", display_name: "GitHub", server_url: "https://gh.example.com/mcp",
      auth_type: "oauth",
      oauth_client_id: "client_1",
      oauth_access_token_enc: enc,
      oauth_refresh_token_enc: null,
      oauth_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h out — well past the refresh skew
      oauth_authorization_server_url: null,
      auth_token_enc: null, allowed_tools: [], status: "active",
      tool_schemas: [{ name: "search_issues" }, { name: "create_issue" }],
    });
    const cfg = await resolveRegistryMcpConfig(supa, "org_1", "gh", DEK);
    expect(cfg?.token).toBe("oauth_access_xyz");
    expect(cfg?.cachedTools).toEqual([{ name: "search_issues" }, { name: "create_issue" }]);
  });
});
