/**
 * GET  /api/v2/projects/[ref]/hooks — the app's deploy hooks (never the secret)
 * POST /api/v2/projects/[ref]/hooks — create one; the URL is returned ONCE
 *
 * Both run through the caller's RLS client. Postgres decides who may see and
 * create hooks — `member` to read, `admin` to create — so this route never
 * holds the authorization decision; it only words the answer.
 *
 * The token is minted here and only its hash is stored. The response to the
 * POST is the single moment the full URL exists outside the customer's own CI
 * secrets, which is why the UI tells them to copy it now.
 */

import { getEmailConfig } from "@/lib/email/config";
import { deployHookUrl, mintHookToken } from "@/lib/paas/deploy-hooks";
import { getCaller, listTeams, type Caller } from "../../../_lib/auth";
import { apiError, fromPostgrestError, invalid, json, notFound, unauthenticated } from "../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

const PROJECT_REF = /^prj-[0-9a-f]{12}$/;
/** Enough for staging, production and a few pipelines; a list longer than this is clutter. */
const MAX_ACTIVE_HOOKS = 10;

/**
 * A team member who can see the app but may not manage its hooks.
 *
 * 403 is normally avoided in v2 because it confirms that a ref exists. Here the
 * caller has just READ this project through RLS, so its existence is already
 * known to them and the status leaks nothing. Kept local rather than added to
 * _lib/http.ts, where a shared 403 helper would invite exactly the misuse that
 * file warns against.
 */
const adminsOnly = () =>
  Response.json(
    { error: { code: "forbidden", message: "Only team owners and admins can manage deploy hooks." } },
    { status: 403 },
  );

async function readProject(caller: Caller, ref: string) {
  return caller.db
    .from("projects")
    .select("id, ref, team_id, production_branch, deploy_on_push, deleted_at")
    .eq("ref", ref)
    .maybeSingle();
}

async function isAdmin(caller: Caller, teamId: string): Promise<boolean> {
  const team = (await listTeams(caller)).find((t) => t.id === teamId);
  return team?.role === "owner" || team?.role === "admin";
}

export async function GET(_req: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;
  if (!PROJECT_REF.test(ref)) return notFound("App");

  const p = await readProject(caller, ref);
  if (p.error) {
    console.error("[v2/hooks GET] project read failed:", JSON.stringify(p.error));
    return apiError("internal", "Could not read the app.", 500);
  }
  if (!p.data || p.data.deleted_at) return notFound("App");

  const { data, error } = await caller.db
    .from("deploy_hooks")
    .select("ref, name, token_hint, created_by, created_at, last_used_at, revoked_at")
    .eq("project_id", p.data.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[v2/hooks GET] read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read deploy hooks.", 500);
  }

  return json({
    branch: p.data.production_branch,
    // Absent reads as ON, the same rule the webhooks apply (push-policy.ts).
    deployOnPush: p.data.deploy_on_push !== false,
    canManage: await isAdmin(caller, p.data.team_id),
    hooks: (data ?? []).map((h: {
      ref: string; name: string; token_hint: string; created_by: string;
      created_at: string; last_used_at: string | null; revoked_at: string | null;
    }) => ({
      ref: h.ref,
      name: h.name,
      hint: h.token_hint,
      createdBy: h.created_by,
      createdAt: h.created_at,
      lastUsedAt: h.last_used_at,
      revokedAt: h.revoked_at,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;
  if (!PROJECT_REF.test(ref)) return notFound("App");

  let body: { name?: unknown } = {};
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return invalid("Send a JSON body with a name for the hook.");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 60) {
    return invalid("Give the hook a name between 1 and 60 characters.", { name: "length" });
  }

  const p = await readProject(caller, ref);
  if (p.error) {
    console.error("[v2/hooks POST] project read failed:", JSON.stringify(p.error));
    return apiError("internal", "Could not read the app.", 500);
  }
  if (!p.data || p.data.deleted_at) return notFound("App");

  // Wording only. RLS on the insert below is what actually refuses a non-admin.
  if (!(await isAdmin(caller, p.data.team_id))) return adminsOnly();

  const { count, error: countError } = await caller.db
    .from("deploy_hooks")
    .select("ref", { count: "exact", head: true })
    .eq("project_id", p.data.id)
    .is("revoked_at", null);
  if (countError) {
    console.error("[v2/hooks POST] count failed:", JSON.stringify(countError));
    return apiError("internal", "Could not read deploy hooks.", 500);
  }
  if ((count ?? 0) >= MAX_ACTIVE_HOOKS) {
    return invalid(`This app already has ${MAX_ACTIVE_HOOKS} active deploy hooks. Revoke one you no longer use first.`);
  }

  const minted = mintHookToken();
  const { data: created, error } = await caller.db
    .from("deploy_hooks")
    .insert({
      project_id: p.data.id,
      name,
      token_hash: minted.hash,
      token_hint: minted.hint,
      created_by: caller.userId,
    })
    .select("ref, name, token_hint, created_at")
    .single();

  if (error) {
    if (error.code === "42501") return adminsOnly(); // RLS refused, with the project already visible
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/hooks POST] insert failed:", JSON.stringify(error));
    return apiError("internal", "Could not create the deploy hook.", 500);
  }

  return json(
    {
      hook: {
        ref: created.ref,
        name: created.name,
        hint: created.token_hint,
        createdAt: created.created_at,
      },
      // Shown once. Only the hash is stored, so it cannot be shown again.
      url: deployHookUrl(getEmailConfig().appUrl, minted.token),
      branch: p.data.production_branch,
    },
    201,
  );
}
