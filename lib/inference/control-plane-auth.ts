/**
 * The one-line front door every control-plane route uses.
 *
 * `api-key-auth.ts` holds the RULES (what a key means, what it may do) and is
 * deliberately free of Next's cookie machinery so it stays unit-testable. This
 * file is the WIRING: it binds those rules to the two session helpers and the
 * two org resolvers the routes already used, so widening a route is a four-line
 * change instead of a twenty-line one repeated sixty times.
 *
 * Two axes, both preserving whatever the route already did on the session path:
 *
 *   session: "cookie"  — authenticateUser(), the dashboard's own credential
 *            "header"  — authenticateUserFromHeader(), a session bearer token
 *   org:     "active"  — getActiveOrgForUser, 404 if the user has no org
 *            "bootstrap" — getOrBootstrapOrgForUser, creates one on first use
 *
 * Note the cookie routes were declared `export async function GET()` with no
 * request parameter at all, so they could not read an Authorization header even
 * in principle — a session bearer token failed there too, not just an API key.
 * Taking `request` is what fixes that, and Next has always passed it.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { authenticateUser, authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { getActiveOrgForUser, getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  orgManagementRefusal,
  resolveControlPlaneAuth,
  type ControlPlaneAuth,
} from "@/lib/inference/api-key-auth";

export interface ControlPlaneAuthOptions {
  /** Which session credential the route already accepted. Default "header". */
  session?: "cookie" | "header";
  /** Which org resolver the route already used. Default "active". */
  org?: "active" | "bootstrap";
  /**
   * Set on routes that read or mutate organisation-wide configuration. An API
   * key must then be an org-level private key — agent-scoped and public keys
   * are refused with 403 `key_not_permitted`. See orgManagementRefusal.
   */
  requireOrgKey?: boolean;
  /**
   * Let an agent-scoped (or public) key through. Off by default, matching the
   * gateway's allow-list — only its own agent's routes and its own usage.
   */
  allowAgentScoped?: boolean;
}

export async function controlPlaneAuth(
  request: NextRequest,
  opts: ControlPlaneAuthOptions = {}
): Promise<{ ok: true; auth: ControlPlaneAuth } | { ok: false; response: NextResponse }> {
  const { session = "header", org = "active", requireOrgKey = false, allowAgentScoped = false } = opts;

  // getOrBootstrapOrgForUser THROWS instead of returning null. Letting that
  // escape would turn a handled "Org error" 500 with a JSON body into an
  // unhandled framework 500 with none, changing what the dashboard sees. Catch
  // it here and re-raise it as the same response the routes returned before.
  let orgError: string | null = null;

  const result = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = session === "cookie" ? await authenticateUser() : await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId, email) => {
      if (org === "bootstrap") {
        try {
          const o = await getOrBootstrapOrgForUser(userId, email);
          return { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug };
        } catch (err) {
          orgError = err instanceof Error ? err.message : "Org error";
          return null;
        }
      }
      const o = await getActiveOrgForUser(userId);
      return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
    },
    org === "active"
      ? () => NextResponse.json({ error: "No inference org" }, { status: 404 })
      : undefined,
    allowAgentScoped
  );

  if (orgError) return { ok: false, response: NextResponse.json({ error: orgError }, { status: 500 }) };
  if (!result.ok) return result;

  if (requireOrgKey && result.auth.apiKey) {
    const refusal = orgManagementRefusal(result.auth.apiKey);
    if (refusal) {
      return {
        ok: false,
        response: NextResponse.json({ error: refusal, code: "key_not_permitted" }, { status: 403 }),
      };
    }
  }

  return result;
}

/**
 * A real user id for columns that demand one.
 *
 * Four inference tables declare `created_by_user_id UUID NOT NULL REFERENCES
 * auth.users(id)` (20260523000001). An API key has no human behind it, so
 * `auth.userId` is null and a plain insert would violate that constraint at
 * runtime — a 500 on a route that looked fine in review.
 *
 * For a key we attribute the row to the org's billing owner: the account that
 * pays for whatever was just created, which is the same user the provisioning
 * paths already charge. `via`/`api_key_id` in the audit log is what records
 * that a key, not that person, actually made the call.
 */
export async function actingUserId(auth: ControlPlaneAuth): Promise<string | null> {
  if (auth.userId) return auth.userId;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("orgs")
    .select("billing_user_id, owner_user_id")
    .eq("id", auth.orgId)
    .maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();

  return data?.billing_user_id ?? data?.owner_user_id ?? null;
}
