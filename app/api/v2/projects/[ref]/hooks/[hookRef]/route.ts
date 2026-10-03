/**
 * DELETE /api/v2/projects/[ref]/hooks/[hookRef] — revoke a deploy hook.
 *
 * A revoke, not a delete. The row stays as the record of who could deploy this
 * app and until when; the column privileges let a client set revoked_at and
 * nothing else, and the policy refuses to clear it again.
 *
 * Takes effect on the next call to the hook: the trigger route looks hooks up
 * with `revoked_at is null`, so there is no cache to wait out.
 */

import { getCaller } from "../../../../_lib/auth";
import { apiError, fromPostgrestError, json, notFound, unauthenticated } from "../../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string; hookRef: string }> };

const PROJECT_REF = /^prj-[0-9a-f]{12}$/;
const HOOK_REF = /^dhk-[0-9a-f]{12}$/;

export async function DELETE(_req: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref, hookRef } = await params;
  if (!PROJECT_REF.test(ref) || !HOOK_REF.test(hookRef)) return notFound("Deploy hook");

  const p = await caller.db
    .from("projects")
    .select("id")
    .eq("ref", ref)
    .is("deleted_at", null)
    .maybeSingle();
  if (p.error) {
    console.error("[v2/hooks DELETE] project read failed:", JSON.stringify(p.error));
    return apiError("internal", "Could not read the app.", 500);
  }
  if (!p.data) return notFound("Deploy hook");

  // Scoped to the project as well as the ref, so a hook ref from another app
  // cannot be revoked through this app's URL even by someone admin on both.
  const { data, error } = await caller.db
    .from("deploy_hooks")
    .update({ revoked_at: new Date().toISOString() })
    .eq("ref", hookRef)
    .eq("project_id", p.data.id)
    .is("revoked_at", null)
    .select("ref, revoked_at");

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/hooks DELETE] revoke failed:", JSON.stringify(error));
    return apiError("internal", "Could not revoke the deploy hook.", 500);
  }
  // Zero rows: unknown, already revoked, or the caller is not an admin. RLS
  // answers all three the same way, and so does this.
  if (!data || data.length === 0) return notFound("Deploy hook");

  return json({ hook: { ref: data[0].ref, revokedAt: data[0].revoked_at } });
}
