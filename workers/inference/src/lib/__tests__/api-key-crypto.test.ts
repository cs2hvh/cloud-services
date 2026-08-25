import { describe, it, expect } from "vitest";
import { generateApiKey } from "../api-key-crypto.ts";

// Doc: Phase-0 API-completeness review (2026-07-17) — must byte-for-byte
// match lib/inference/api-key-crypto.ts's format/hashing (Node's crypto
// module isn't available in Workers, so this is a Web Crypto reimplementation
// of the exact same algorithm) — a key minted from either side has to be
// findable by authMiddleware's sha256Hex lookup.

describe("generateApiKey", () => {
  it("private tier gets the ahu_live_ prefix", async () => {
    const k = await generateApiKey("private");
    expect(k.fullKey.startsWith("ahu_live_")).toBe(true);
    expect(k.keyPrefix).toBe(k.fullKey.slice(0, 13));
    expect(k.keyLastFour).toBe(k.fullKey.slice(-4));
  });

  it("public tier gets the ahu_pub_ prefix — visually distinct from private", () => {
    return generateApiKey("public").then((k) => {
      expect(k.fullKey.startsWith("ahu_pub_")).toBe(true);
    });
  });

  it("keyHash is the sha256 hex digest of the full key (what authMiddleware looks up)", async () => {
    const k = await generateApiKey("private");
    const expected = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k.fullKey));
    const expectedHex = Array.from(new Uint8Array(expected)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(k.keyHash).toBe(expectedHex);
  });

  it("two calls never collide (real randomness, not a fixture)", async () => {
    const a = await generateApiKey("private");
    const b = await generateApiKey("private");
    expect(a.fullKey).not.toBe(b.fullKey);
    expect(a.keyHash).not.toBe(b.keyHash);
  });
});
