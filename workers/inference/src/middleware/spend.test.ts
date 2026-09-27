import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { spendCheckMiddleware } from "./spend.ts";
import type { AuthContext, Env, HonoVariables } from "../types.ts";

// The wallet check needs no KV: it reads the balance the key lookup carried.
// Hard caps are left unset here so the middleware never touches SPEND.

function appWith(auth: Partial<AuthContext>) {
  const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
  app.use("*", async (c, next) => {
    c.set("auth", {
      keyId: "key",
      orgId: "org",
      allowedModels: null,
      allowedIpCidrs: null,
      zdrEnabled: false,
      monthlyBudgetCents: null,
      hardCapCents: null,
      orgMonthlyBudgetCents: null,
      orgHardCapCents: null,
      semanticCacheEnabled: false,
      orgSemanticCacheThreshold: null,
      rateLimitRpm: null,
      payerBalanceCents: null,
      billing: "platform",
      ...auth,
    } as AuthContext);
    await next();
  });
  app.use("*", spendCheckMiddleware);
  app.get("/", (c) => c.text("served"));
  return app;
}

const env = (enforcement?: string) => ({ BALANCE_ENFORCEMENT: enforcement }) as unknown as Env;

describe("wallet check", () => {
  it("is inert while BALANCE_ENFORCEMENT is not exactly on", async () => {
    for (const e of [undefined, "off", "ON ", "true"]) {
      const res = await appWith({ payerBalanceCents: 0 }).request("/", {}, env(e));
      expect(res.status, `enforcement=${e}`).toBe(200);
    }
  });

  it("refuses a platform-billed request when the balance is zero", async () => {
    const res = await appWith({ payerBalanceCents: 0 }).request("/", {}, env("on"));
    expect(res.status).toBe(402);
    const body = (await res.json()) as {
      error: { code: string; type: string; balance_cents: number; message: string };
    };
    expect(body.error.code).toBe("insufficient_balance");
    expect(body.error.type).toBe("billing_error");
    expect(body.error.balance_cents).toBe(0);
    expect(body.error.message).toContain("/dashboard/billing");
  });

  it("treats a missing balance row and a negative balance as exhausted", async () => {
    expect((await appWith({ payerBalanceCents: null }).request("/", {}, env("on"))).status).toBe(402);
    const neg = await appWith({ payerBalanceCents: -250 }).request("/", {}, env("on"));
    expect(neg.status).toBe(402);
    expect(((await neg.json()) as { error: { balance_cents: number } }).error.balance_cents).toBe(0);
  });

  it("serves while any balance remains", async () => {
    expect((await appWith({ payerBalanceCents: 1 }).request("/", {}, env("on"))).status).toBe(200);
  });

  it("never holds BYOK traffic to the wallet", async () => {
    const res = await appWith({ payerBalanceCents: 0, billing: "byok" }).request("/", {}, env("on"));
    expect(res.status).toBe(200);
  });
});
