import { afterEach, describe, expect, it, vi } from "vitest";

// The two billing switches are read from the environment at module load, so
// each case re-imports the module under a fresh env.
async function flags(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  return import("@/lib/billing/topup-flag");
}

describe("billing switches", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("top-ups are off unless NEXT_PUBLIC_BILLING_TOPUPS=on", async () => {
    expect((await flags({ NEXT_PUBLIC_BILLING_TOPUPS: undefined })).BILLING_TOPUP_ENABLED).toBe(false);
    expect((await flags({ NEXT_PUBLIC_BILLING_TOPUPS: "true" })).BILLING_TOPUP_ENABLED).toBe(false);
    expect((await flags({ NEXT_PUBLIC_BILLING_TOPUPS: " ON " })).BILLING_TOPUP_ENABLED).toBe(true);
  });

  it("crypto is off by default, even with top-ups on", async () => {
    const f = await flags({ NEXT_PUBLIC_BILLING_TOPUPS: "on", NEXT_PUBLIC_BILLING_CRYPTO: undefined });
    expect(f.BILLING_TOPUP_ENABLED).toBe(true);
    expect(f.BILLING_CRYPTO_ENABLED).toBe(false);
  });

  it("crypto needs both switches on", async () => {
    expect(
      (await flags({ NEXT_PUBLIC_BILLING_TOPUPS: undefined, NEXT_PUBLIC_BILLING_CRYPTO: "on" })).BILLING_CRYPTO_ENABLED,
    ).toBe(false);
    expect(
      (await flags({ NEXT_PUBLIC_BILLING_TOPUPS: "on", NEXT_PUBLIC_BILLING_CRYPTO: "on" })).BILLING_CRYPTO_ENABLED,
    ).toBe(true);
  });
});
