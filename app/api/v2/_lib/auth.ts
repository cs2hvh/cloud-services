/**
 * Caller resolution for the v2 API.
 *
 * Every tenant read and write goes through the RLS-scoped SSR client. That is
 * the whole authorization model: paas RLS routes each policy through
 * paas.has_team_access(team_id, min_role), so an unauthorised row simply is
 * not returned.
 *
 * v1 did the opposite — RLS was enabled on every table and then bypassed with
 * the service-role client on 100% of queries, leaving authorization to
 * hand-written per-route checks. One route forgot, and that was a confirmed
 * IDOR. Nothing in app/api/v2 may import createServiceClient; the service role
 * is for reconcilers, which live outside this directory.
 *
 * TWO CREDENTIALS, ONE MODEL. A browser sends a session cookie; a script sends
 * an `sk_` API key. Both end at the same place — a client whose queries run as
 * the caller under RLS — because an API key is exchanged for a session
 * belonging to the key's own owner (lib/paas/api-key-session.ts). The API path
 * therefore adds no new authorization code and cannot outrank the policies;
 * whatever the browser would refuse, the key is refused too.
 */

import { headers } from "next/headers";
import { createClient, createServerSupabase } from "@/lib/supabase/server";
import { isSuspended, sessionSecondFactorMissing } from "@/lib/auth/assurance";
import { ApiKeys } from "@/lib/supabase/queries/api_keys";
import { sessionForUser } from "@/lib/paas/api-key-session";

/** The tenant tables reachable through PostgREST under `paas`. */
export type PaasTable =
  // Read-only to the owning team: what the hourly meter has charged a project.
  | "project_charges"
  | "teams"
  | "team_members"
  | "projects"
  | "environments"
  | "deployments"
  // SELECT only for `authenticated` since 2026-09-06. Writes go through
  // paas.alias_point(), alias_attach_domain() and alias_release(); a
  // table-level write let any member claim any hostname.
  | "aliases"
  | "domains"
  | "env_vars"
  // The token hash is not selectable by `authenticated`; an update may set
  // only revoked_at, and the policy refuses to clear it.
  | "deploy_hooks"
  // SELECT only for `authenticated`. Writes go through
  // lib/paas/installations/link.ts (service role, after the callback route
  // proved ownership with the provider); nothing a client can call inserts one.
  | "installations";

export interface Caller {
  userId: string;
  /** The account's email when the credential carried one; null for an API key. */
  email: string | null;
  /** Which credential proved who this is. */
  via: "cookie" | "api_key";
  /** RLS-scoped client, already pointed at the `paas` schema. */
  db: ReturnType<typeof paasSchema>;
}

/** Either client carries a caller's own token, so either can back a Caller. */
type SupabaseClientLike =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createServerSupabase>;

/**
 * `Database` in lib/supabase/types.ts is generated for `public` only, so the
 * generated types cannot describe `paas`. Casting once here keeps the cast out
 * of every route rather than scattering it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any --
   PostgREST query builders are chainable and generic over the row type.
   Hand-writing that signature would be less accurate than any and would drift
   from the library; the generated Database type cannot describe paas at all.
   The cast is confined to this one function so no route repeats it. */
function paasSchema(client: SupabaseClientLike) {
  return (client as unknown as {
    schema: (name: string) => {
      from: (table: PaasTable) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => any;
    };
  }).schema("paas");
}

/**
 * Resolve the caller, or null when the request carries no usable credential.
 *
 * Uses getUser() rather than getSession(): getSession() trusts whatever is in
 * the cookie, while getUser() verifies it against the auth server. For an
 * authorization decision the difference matters.
 */
export async function getCaller(): Promise<Caller | null> {
  // AN API KEY WINS OVER A COOKIE on the same request. A script that sends a
  // key has named the identity it means to act as; silently preferring a stale
  // browser cookie would run the call as somebody else.
  const apiKey = await bearerApiKey();
  if (apiKey) return callerFromApiKey(apiKey);

  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  // A password-only session on an MFA account is not a caller, and neither
  // is a suspended account. Both read through the caller's own client, so
  // this file keeps its rule of never touching the service role.
  if (await sessionSecondFactorMissing(client, "v2/getCaller")) return null;
  if (await isSuspended(data.user.id, client)) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    via: "cookie",
    db: paasSchema(client),
  };
}

/**
 * The `sk_` API key on this request, if there is one.
 *
 * Read from the header rather than taken as a parameter so every route that
 * already calls getCaller() gains API-key support without changing shape.
 */
async function bearerApiKey(): Promise<string | null> {
  const header = (await headers()).get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  // Only our own key format. A Supabase JWT arriving in this header belongs to
  // a different flow and must not be mistaken for an API key.
  return token.startsWith("sk_") ? token : null;
}

/**
 * Resolve an API key to a caller whose queries run under RLS as the key's owner.
 *
 * The key proves WHO; sessionForUser turns that into the access token PostgREST
 * needs, so the `paas` policies still decide WHAT — the same rows the browser
 * would return, from the same policies. Nothing here reaches past RLS.
 *
 * NO INTERACTIVE SECOND FACTOR, deliberately and in step with v1: the key was
 * minted by an already-authenticated session and is revocable from the
 * dashboard. Demanding a TOTP step here would mean no account with MFA enabled
 * could ever use the API at all.
 */
async function callerFromApiKey(key: string): Promise<Caller | null> {
  const result = await ApiKeys.validate(key);
  if (!result.valid) return null;
  // A key carries its account's suspension exactly as a session does.
  if (await isSuspended(result.userId)) return null;

  const accessToken = await sessionForUser(result.userId);
  if (!accessToken) return null;

  return {
    userId: result.userId,
    email: null,
    via: "api_key",
    db: paasSchema(createServerSupabase(accessToken)),
  };
}

export interface TeamRef {
  id: string;
  ref: string;
  slug: string;
  name: string;
  role: string;
}

/**
 * Teams the caller belongs to. RLS on team_members does the filtering, so this
 * is a plain select — there is no additional membership check to forget.
 */
export async function listTeams(caller: Caller): Promise<TeamRef[]> {
  const { data, error } = await caller.db
    .from("team_members")
    .select("role, teams:team_id (id, ref, slug, name)")
    .eq("user_id", caller.userId);

  if (error || !data) return [];

  return (data as Array<{ role: string; teams: Omit<TeamRef, "role"> | null }>)
    .filter((row) => row.teams !== null)
    .map((row) => ({ ...(row.teams as Omit<TeamRef, "role">), role: row.role }));
}

/**
 * Resolve a team ref to its id, or null when the caller cannot see it.
 *
 * Callers must treat null as 404, never 403 — see _lib/http.ts.
 */
export async function resolveTeamId(
  caller: Caller,
  teamRef: string
): Promise<string | null> {
  const { data, error } = await caller.db
    .from("teams")
    .select("id")
    .eq("ref", teamRef)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * The team to act on when the caller did not name one.
 *
 * Returns null when they belong to none, and null when they belong to several
 * — an ambiguous default silently writing into the wrong team is worse than
 * making the route ask for an explicit `team`.
 */
export async function defaultTeamId(caller: Caller): Promise<string | null> {
  const teams = await listTeams(caller);
  return teams.length === 1 ? teams[0].id : null;
}
