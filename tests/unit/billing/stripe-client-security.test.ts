import { afterEach, describe, expect, it, vi } from "vitest";

describe("Stripe client security", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("TC-BILL-SEC-004: should not expose STRIPE secret details when not configured", async () => {
    vi.resetModules();
    delete process.env.STRIPE_SECRET_KEY;

    const { getStripeClient } = await import("@/lib/stripe");

    let thrown: Error | null = null;
    try {
      getStripeClient();
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toBe("Stripe is not configured");
    expect(thrown?.message).not.toContain("STRIPE_SECRET_KEY");
    expect(thrown?.message).not.toContain("sk_");
  });
});
