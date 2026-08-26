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
 */

import { createClient } from "@/lib/supabase/server";

/** The eight tenant tables reachable through PostgREST under `paas`. */
export type PaasTable =
  | "teams"
  | "team_members"
  | "projects"
  | "environments"
  | "deployments"
  | "aliases"
  | "domains"
  | "env_vars"
  // SELECT only for `authenticated`; writes go through
  // paas.link_installation(), which requires admin on the target team.
  | "installations";

export interface Caller {
  userId: string;
  /** RLS-scoped client, already pointed at the `paas` schema. */
  db: ReturnType<typeof paasSchema>;
}

/**
 * `Database` in lib/supabase/types.ts is generated for `public` only, so the
 * generated types cannot describe `paas`. Casting once here keeps the cast out
 * of every route rather than scattering it.
 */
function paasSchema(client: Awaited<ReturnType<typeof createClient>>) {
  return (client as unknown as {
    schema: (name: string) => {
      from: (table: PaasTable) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => any;
    };
  }).schema("paas");
}

/**
 * Resolve the signed-in caller, or null when there is no valid session.
 *
 * Uses getUser() rather than getSession(): getSession() trusts whatever is in
 * the cookie, while getUser() verifies it against the auth server. For an
 * authorization decision the difference matters.
 */
export async function getCaller(): Promise<Caller | null> {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return { userId: data.user.id, db: paasSchema(client) };
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
