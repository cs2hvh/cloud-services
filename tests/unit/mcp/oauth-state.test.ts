import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeOAuthState, decodeOAuthState } from "@/lib/mcp/oauth-state";

// A real, valid base64 32-byte DEK for testing — not a secret, just needs to
// be the right shape for AES-GCM key import.
const TEST_DEK = Buffer.alloc(32, 7).toString("base64");
const OTHER_DEK = Buffer.alloc(32, 9).toString("base64");

describe("MCP OAuth state encode/decode (authorize → callback round-trip)", () => {
  const state = { serverId: "srv-1", orgId: "org-1", codeVerifier: "verifier-abc-123", userId: "user-1" };

  it("round-trips through encode/decode", async () => {
    const encoded = await encodeOAuthState(state, TEST_DEK);
    const decoded = await decodeOAuthState(encoded, TEST_DEK);
    expect(decoded).toEqual(state);
  });

  it("is URL-safe (no +, /, or = characters — survives a query string unescaped)", async () => {
    // Run many times since PKCE-verifier-shaped random content can vary.
    for (let i = 0; i < 20; i++) {
      const encoded = await encodeOAuthState({ ...state, codeVerifier: `v-${i}-${"x".repeat(i)}` }, TEST_DEK);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it("rejects a state decrypted with the wrong DEK (can't be forged without our key)", async () => {
    const encoded = await encodeOAuthState(state, TEST_DEK);
    await expect(decodeOAuthState(encoded, OTHER_DEK)).rejects.toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const encoded = await encodeOAuthState(state, TEST_DEK);
    // Flip a character in the middle of the payload.
    const tampered = encoded.slice(0, 20) + (encoded[20] === "a" ? "b" : "a") + encoded.slice(21);
    await expect(decodeOAuthState(tampered, TEST_DEK)).rejects.toThrow();
  });

  it("rejects an expired state (past the 10-minute TTL)", async () => {
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realNow() - 11 * 60 * 1000);
    const encoded = await encodeOAuthState(state, TEST_DEK);
    vi.restoreAllMocks();

    await expect(decodeOAuthState(encoded, TEST_DEK)).rejects.toThrow(/expired/i);
  });

  it("accepts a state still within the TTL", async () => {
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realNow() - 9 * 60 * 1000);
    const encoded = await encodeOAuthState(state, TEST_DEK);
    vi.restoreAllMocks();

    await expect(decodeOAuthState(encoded, TEST_DEK)).resolves.toEqual(state);
  });

  afterEach(() => vi.restoreAllMocks());
});
