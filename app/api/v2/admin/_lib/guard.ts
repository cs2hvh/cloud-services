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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LINE THAT KEEPS THIS STRUCTURAL, AND HOW TO BREAK IT.
 *
 * What makes the arrangement above safe is that NOTHING under this directory
 * is tenant-scoped. Every read is fleet-wide by construction, so there is no
 * RLS being bypassed and no ownership check that could be forgotten.
 *
 * That property is destroyed the moment an operator route grows a `projectRef`
 * or `teamRef` filter that reads a tenant table. At that point elevated
 * credentials are answering a per-tenant question, the correctness of the
 * answer depends on a hand-written filter, and that is v1's confirmed IDOR
 * rebuilt with better input validation. The rule stops being structural and
 * becomes a convention somebody eventually forgets.
 *
 * If an operator genuinely needs a per-tenant view, build it on the RLS-scoped
 * client like every other route in app/api/v2, or give the operator a way to
 * act as the tenant. Do not filter fleet reads by tenant.
 *
 * Stated by the infrastructure lane, and it is the right line:
 * elevate the operation, never the authorization decision, and never a
 * tenant-scoped read or write.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requireAdmin } from "@/lib/supabase/auth";
import { apiError } from "../../_lib/http";

export interface Operator {
  userId: string;
  email: string;
}

/**
 * Say out loud, once, when the strong authorization path is not configured.
 *
 * The header above describes ADMIN_EMAILS as something that "should be set in
 * production", which is a deployment-time condition stated in the one place it
 * can never be checked. Without it, requireAdmin falls back to a `roles` array
 * on user_profiles — data a compromised account could plausibly reach — and
 * nothing anywhere says so.
 *
 * A comment cannot notice its own violation. This can.
 */
let warnedAboutFallback = false;

function warnIfWeakPath(): void {
  if (warnedAboutFallback) return;
  warnedAboutFallback = true;

  const configured = (process.env.ADMIN_EMAILS ?? "").split(",").some((s) => s.trim() !== "");
  if (!configured) {
    console.warn(
      "[paas/admin] ADMIN_EMAILS is not set. Operator authorization is falling back to " +
        "user_profiles.roles, which is weaker: it is data a compromised account may be " +
        "able to reach, and it guards fleet cost, cluster ids and every tenant's name. " +
        "Set ADMIN_EMAILS in production.",
    );
  }
}

/**
 * Resolve the caller as a platform operator, or null.
 *
 * Callers MUST treat null as "stop" and return `adminNotFound()`. Returning
 * data on a null operator is the only way this subtree can leak.
 */
export async function getOperator(): Promise<Operator | null> {
  warnIfWeakPath();
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
