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
  const url = new URL(request.url);

  // WHICH PROVIDER, because the id alone does not say. The table's primary key
  // is (provider, external_id) precisely so a GitLab project numbered 42 and a
  // GitHub installation numbered 42 stay distinct — matching on the id alone
  // would let a caller delete one by naming the other.
  //
  // Defaulted to github: every caller written before multi-provider means it.
  const provider = url.searchParams.get("provider") ?? "github";
  if (!["github", "gitlab", "bitbucket"].includes(provider)) {
    return apiError("invalid_request", "Unknown git provider.", 400);
  }

  // Only GitHub's id is a number. A Bitbucket workspace id is a braced UUID,
  // so this check belongs to GitHub rather than to the route.
  const installationId = Number(id);
  if (provider === "github" && (!Number.isInteger(installationId) || installationId <= 0)) {
    return apiError("invalid_request", "That is not an installation id.", 400);
  }
  if (!id || id.length > 128) {
    return apiError("invalid_request", "That is not a connection id.", 400);
  }

  const force = url.searchParams.get("force") === "1";

  // RLS scopes this to the caller's own teams, so a link belonging to somebody
  // else is simply not here — the same answer as one that never existed.
  const { data: linkRows, error: linkError } = await caller.db
    .from("installations")
    .select("installation_id, external_id, account_login, provider, team_id")
    .eq("provider", provider)
    .eq("external_id", id)
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
  // connection_id, not installation_id: the latter is the deprecated
  // GitHub-only column and is NULL on every GitLab and Bitbucket project, so
  // matching on it would report no dependants and disconnect silently — the
  // 409 that protects people from breaking their own builds would go vacuous
  // for exactly the providers it was just extended to cover.
  const { data: projectRows, error: projectError } = await caller.db
    .from("projects")
    .select("ref, name, connection_id")
    .eq("provider", provider)
    .eq("connection_id", id)
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
    .eq("provider", provider)
    .eq("external_id", id)
    .is("deleted_at", null)
    .select("external_id");

  if (updateError) {
    console.error("[v2/git/installations/:id] unlink failed:", updateError);
    return apiError("internal", "Could not disconnect that account.", 500);
  }
  if (!updated || updated.length === 0) return notFound("Connection");

  // WHAT WE DID AND DID NOT REVOKE, per provider. Saying only 'disconnected'
  // would imply we revoked something on the provider that we did not touch —
  // and where the customer goes to finish the job differs on all three.
  const revoke: Record<string, { note: string; url: string }> = {
    github: {
      note:
        "The account is unlinked from your team. The GitHub App itself is still " +
        "installed on that account — remove it from GitHub's settings to revoke " +
        "our access entirely.",
      url: `https://github.com/settings/installations/${installationId}`,
    },
    gitlab: {
      note:
        "The account is unlinked from your team and the stored token is no longer " +
        "used. Revoke the authorisation in GitLab to be certain it cannot be reused.",
      url: "https://gitlab.com/-/user_settings/applications",
    },
    bitbucket: {
      note:
        "The workspace is unlinked from your team and the stored token is no longer " +
        "used. Revoke the authorisation in Bitbucket to be certain it cannot be reused.",
      url: "https://bitbucket.org/account/settings/app-authorizations/",
    },
  };

  return json({
    disconnected: id,
    account: link.account_login,
    provider: link.provider,
    projectsAffected: affected.length,
    note: revoke[provider].note,
    revokeUrl: revoke[provider].url,
  });
}
