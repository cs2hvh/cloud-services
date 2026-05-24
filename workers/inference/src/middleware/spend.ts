/**
 * Hard-cap spend check.
 *
 * Reads the current month's accumulated cents from KV. If the key has a
 * hard_cap_cents set and the current spend has reached it, reject the
 * request before any upstream call is made.
 *
 * The counter itself is INCRBY'd from the usage-events consumer (k8s worker)
 * once a request completes. We accept a small race where a few requests can
 * exceed the cap if many concurrent calls arrive at the limit — acceptable
 * for hard caps at 100k req/hour scale; tightenable later with a Durable
 * Object reservation if needed.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

export const spendCheckMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  if (!auth.hardCapCents) {
    await next();
    return;
  }

  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const key = `org:${auth.orgId}:month:${month}`;
  const currentRaw = await c.env.SPEND.get(key);
  const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;

  if (Number.isFinite(current) && current >= auth.hardCapCents) {
    return c.json(
      {
        error: {
          message: `Org has reached its hard cap of ${(auth.hardCapCents / 100).toFixed(
            2
          )} USD for ${month}. Raise the cap or wait for the next billing period.`,
          type: "billing_error",
          code: "hard_cap_reached",
          spent_cents: current,
          hard_cap_cents: auth.hardCapCents,
        },
      },
      402
    );
  }

  await next();
};
