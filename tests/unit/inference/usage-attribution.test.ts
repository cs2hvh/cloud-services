import { describe, it, expect } from "vitest";
import { NO_CUSTOMER_KEY_ID, usageApiKeyId } from "@/lib/inference/usage-attribution";

// inference.usage.api_key_id is NOT NULL. Passing null there does not fail
// loudly — it throws 23502 inside a try/catch that logs and continues, so the
// work completes and the usage row is silently never written. Two paths did
// exactly that: the media-job watchdog (a recovered video delivered free) and
// the batch processor. Verified against the live constraint 2026-07-31.

describe("usageApiKeyId", () => {
  it("substitutes the sentinel when there is no customer key", () => {
    expect(usageApiKeyId(null)).toBe(NO_CUSTOMER_KEY_ID);
    expect(usageApiKeyId(undefined)).toBe(NO_CUSTOMER_KEY_ID);
  });

  it("treats blank and whitespace as no key, not as a key", () => {
    // The failure mode this prevents: `keyId ?? SENTINEL` passes "" straight
    // through, which is not a UUID and fails the insert just as null did.
    expect(usageApiKeyId("")).toBe(NO_CUSTOMER_KEY_ID);
    expect(usageApiKeyId("   ")).toBe(NO_CUSTOMER_KEY_ID);
  });

  it("keeps a real key id untouched, so attribution is not lost", () => {
    const real = "3905dc65-9e11-4a5a-b648-65f8af17fd82";
    expect(usageApiKeyId(real)).toBe(real);
  });

  it("trims a padded id rather than rejecting it", () => {
    const real = "3905dc65-9e11-4a5a-b648-65f8af17fd82";
    expect(usageApiKeyId(`  ${real}  `)).toBe(real);
  });

  it("the sentinel is a syntactically valid UUID", () => {
    // It has no FK, but the column is typed uuid — a non-UUID string would fail
    // the insert exactly the way null does.
    expect(NO_CUSTOMER_KEY_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("matches the value the gateway already writes", () => {
    // workers/inference/src/lib/on-behalf-of.ts — OBO_API_KEY_ID. The two halves
    // of the platform must agree; 432 live rows already carry this value.
    expect(NO_CUSTOMER_KEY_ID).toBe("00000000-0000-0000-0000-0000000000a9");
  });
});
