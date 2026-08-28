/**
 * DELETE /api/v2/git/installations/[id]
 *
 * Unlink a connected git account from the caller's team.
 *
 * There was no way to do this at all. A team could connect an account and then
 * never disconnect it — wrong account, someone leaving, an org that should not
 * have been linked. The `installations` table has carried a `deleted_at` column
 * the whole time and nothing ever set it.
 *
 * IT REFUSES WHILE PROJECTS STILL NEED IT, and that is the part worth stating.
 * Builds clone through an installation token; unlink the installation and every
 * project that reads a private repository through it stops building, at its next
 * push, with an error about a repository it can no longer see. So the projects
 * are counted first and named back, and the caller has to say `?force=1` to go
 * ahead anyway. Someone leaving the company genuinely does need to disconnect
 * while projects still reference it, so this is a speed bump rather than a wall.
 *
 * IT DOES NOT UNINSTALL THE APP ON GITHUB, deliberately. The App can delete its
 * own installation, but an installation can be linked by more than one team, and
 * uninstalling on behalf of one would silently break the others. Removing our
 * link is the part that is unambiguously ours to remove; the response says where
 * to go to revoke the App itself, which is a decision for the person who owns
 * that GitHub account.
 */

import { getCaller } from "../../../_lib/auth";
import { json, unauthenticated, apiError, notFound } from "../../../_lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const { id } = await params;
  const installationId = Number(id);
  // A bigint that arrived as "abc" would otherwise become NaN and match nothing,
  // which reads to the caller as "no such connection" rather than "bad request".
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return apiError("invalid_request", "That is not an installation id.", 400);
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  // RLS scopes this to the caller's own teams, so a link belonging to somebody
  // else is simply not here — the same answer as one that never existed.
  const { data: linkRows, error: linkError } = await caller.db
    .from("installations")
    .select("installation_id, account_login, provider, team_id")
    .eq("installation_id", installationId)
    .is("deleted_at", null);

  if (linkError) {
    console.error("[v2/git/installations/:id] read failed:", linkError);
    return apiError("internal", "Could not read your connections.", 500);
  }
  if (!linkRows || linkRows.length === 0) return notFound("Connection");

  const link = linkRows[0] as { account_login: string; provider: string; team_id: string };

  // What breaks if this goes. Counted from the projects themselves rather than
  // assumed from the account name: a repository's owner and the installation it
  // is read through are not the same thing, which is the whole reason somebody
  // deploys from an org they did not sign in with.
  const { data: projectRows, error: projectError } = await caller.db
    .from("projects")
    .select("ref, name, installation_id")
    .eq("installation_id", installationId)
    .is("deleted_at", null);

  if (projectError) {
    console.error("[v2/git/installations/:id] project read failed:", projectError);
    return apiError("internal", "Could not check what uses this connection.", 500);
  }

  const affected = (projectRows ?? []) as Array<{ ref: string; name: string }>;

  if (affected.length > 0 && !force) {
    return json(
      {
        error: {
          code: "in_use",
          message:
            `${affected.length} project${affected.length === 1 ? "" : "s"} still build through ` +
            `${link.account_login}. Disconnecting stops them building at their next push. ` +
            `Repeat with ?force=1 to disconnect anyway.`,
        },
        account: link.account_login,
        projects: affected.map((p) => ({ ref: p.ref, name: p.name })),
      },
      409,
    );
  }

  const { data: updated, error: updateError } = await caller.db
    .from("installations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("installation_id", installationId)
    .is("deleted_at", null)
    .select("installation_id");

  if (updateError) {
    console.error("[v2/git/installations/:id] unlink failed:", updateError);
    return apiError("internal", "Could not disconnect that account.", 500);
  }
  if (!updated || updated.length === 0) return notFound("Connection");

  return json({
    disconnected: installationId,
    account: link.account_login,
    provider: link.provider,
    projectsAffected: affected.length,
    // Said plainly, because "disconnected" on its own would imply we revoked
    // something on GitHub that we did not touch.
    note:
      "The account is unlinked from your team. The GitHub App itself is still " +
      "installed on that account — remove it from GitHub's settings to revoke " +
      "our access entirely.",
    revokeUrl: `https://github.com/settings/installations/${installationId}`,
  });
}
