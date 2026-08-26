/**
 * The admin gate for the operator API.
 *
 * WHY THIS IS DIFFERENT FROM THE REST OF app/api/v2, AND WHY THAT IS SAFE.
 *
 * Every other route under app/api/v2 is tenant-scoped: it uses the RLS-scoped
 * SSR client and lets Postgres decide what the caller may see. `_lib/auth.ts`
 * states the rule plainly — nothing in app/api/v2 may import a service-role
 * client, because v1 used one for 100% of tenant queries and reduced its own
 * RLS to decoration.
 *
 * These routes are not tenant-scoped. They read `paas.clusters` and
 * `paas.build_vms`, which have RLS enabled with NO policy and are therefore
 * reachable no other way, and they read the cluster and the Linode account
 * directly. There is no tenant whose RLS could scope any of it.
 *
 * The rule is kept intact rather than bent: nothing in this directory imports
 * a service-role client. The reads live in lib/paas/telemetry/operator.ts, and
 * a route's only job is to prove the caller is an operator before calling one.
 * That proof is the whole security boundary for this subtree, so:
 *
 *   - It fails closed. requireAdmin() returns false on a missing session, a
 *     non-allowlisted email, a user_profiles row without the role, a failed
 *     lookup, and any thrown error.
 *   - It returns 404, never 403, matching _lib/http.ts. An operator endpoint
 *     that answers 403 tells an attacker the endpoint exists and that admin
 *     is a thing to go after. 404 says nothing.
 *   - It is checked in every route, first, with no early return above it.
 *
 * ADMIN_EMAILS is the strong path and should be set in production. With it
 * unset, requireAdmin falls back to a `roles` array on user_profiles, which is
 * data a compromised account could plausibly reach. Fleet data is not
 * catastrophic to leak — costs, cluster ids, tenant names — but it is a map of
 * the platform, so prefer the allowlist.
 */

import { requireAdmin } from "@/lib/supabase/auth";
import { apiError } from "../../_lib/http";

export interface Operator {
  userId: string;
  email: string;
}

/**
 * Resolve the caller as a platform operator, or null.
 *
 * Callers MUST treat null as "stop" and return `adminNotFound()`. Returning
 * data on a null operator is the only way this subtree can leak.
 */
export async function getOperator(): Promise<Operator | null> {
  const result = await requireAdmin();
  if (!result.ok || !result.userId || !result.email) return null;
  return { userId: result.userId, email: result.email };
}

/** Deliberately indistinguishable from a route that does not exist. */
export const adminNotFound = () => apiError("not_found", "Not found.", 404);

/**
 * A dependency this view needs was unreachable — Linode, Cloudflare, the
 * cluster, PostgREST.
 *
 * 502 rather than 500: the platform is fine, something it reads is not, and an
 * operator staring at an outage needs to know which.
 */
export const upstreamFailed = (message: string) =>
  apiError("upstream_error", message.slice(0, 300), 502);
