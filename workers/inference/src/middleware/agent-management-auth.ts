/**
 * Auth gate for the agent-MANAGEMENT surface (/v1/agents CRUD + key mint/
 * revoke/rotate — routes/agent-management.ts), deliberately narrower than
 * agentScopeMiddleware's run-execution gate:
 *
 *   - Agent-scoped keys (auth.agentId set) are rejected outright. Such a key
 *     is minted from ONE agent's own "Access Keys" tab specifically so it
 *     can only run/read that one agent (agentScopeMiddleware already blocks
 *     it from reaching these paths at all, since they don't match its
 *     run-execution regexes — this is defense in depth, and a clearer error
 *     message than that generic 403 would give).
 *   - Public-tier keys are rejected outright. A public key is designed to be
 *     embedded in a customer's website JS — visible to anyone with devtools
 *     open — so it must never be able to read a system_prompt, change a
 *     budget, or mint a new key.
 *
 * Only an unrestricted PRIVATE key (the default for server-to-server use)
 * may manage the agent fleet.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";

export const agentManagementAuthMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");

  if (auth.agentId) {
    return c.json(
      gatewayError(
        "This key is scoped to a single agent and can't manage the agent fleet",
        "invalid_request_error",
        "agent_scope_restricted",
        requestId
      ),
      403
    );
  }
  if (auth.keyTier !== "private") {
    return c.json(
      gatewayError(
        "Public-tier keys can't manage agents — use a private key",
        "invalid_request_error",
        "public_key_restricted",
        requestId
      ),
      403
    );
  }

  return next();
};
