/**
 * GET /api/v2/git/installations/[id]/repos
 *
 * Repositories visible to one installation. The id is caller-supplied, so it
 * is checked against the caller's own installations before any token is
 * minted — see ../../../_lib/scope.ts.
 */

import { listInstallationRepos } from "@/lib/paas/github/client.ts";
import { getCaller } from "../../../../_lib/auth";
import { json, unauthenticated, notFound, apiError } from "../../../../_lib/http";
import { callerMayUseInstallation, parseInstallationId } from "../../../_lib/scope";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const { id } = await params;
  const installationId = parseInstallationId(id);
  if (installationId === null) return notFound("Installation");

  // Authorize BEFORE minting a token. Reaching GitHub first would let an
  // unauthorized caller confirm an installation exists by timing alone.
  if (!(await callerMayUseInstallation(caller, installationId))) {
    return notFound("Installation");
  }

  let repos: Awaited<ReturnType<typeof listInstallationRepos>>;
  try {
    repos = await listInstallationRepos(installationId);
  } catch (err) {
    console.error("[v2/git/repos] listing failed:", err);
    return apiError(
      "upstream_error",
      "Could not list repositories from GitHub. Try again shortly.",
      502
    );
  }

  return json({
    installationId,
    repos: repos
      .map((repo) => ({
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        url: repo.html_url,
        updatedAt: repo.updated_at,
      }))
      // Most-recently-touched first: the repo someone wants to deploy is
      // almost always one they just pushed to.
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  });
}
