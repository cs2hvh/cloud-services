/**
 * GET /api/v2/git/repos/[owner]/[repo]/branches?installation=<id>
 *
 * Branches for one repository. The installation is named explicitly rather
 * than inferred, because a repo full-name alone does not say which
 * installation may read it — and guessing would mean trying installations the
 * caller does not own.
 */

import { listBranches } from "@/lib/paas/github/client.ts";
import { getCaller } from "../../../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  invalid,
  apiError,
} from "../../../../../_lib/http";
import {
  callerMayUseInstallation,
  parseInstallationId,
} from "../../../../_lib/scope";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ owner: string; repo: string }> };

/**
 * owner/repo go straight into a GitHub API path, so anything that could climb
 * out of it is rejected here rather than trusted upstream. v1 had a git_ref
 * traversal bug of exactly this shape.
 */
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export async function GET(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const { owner, repo } = await params;
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return invalid("Malformed repository name.");
  }

  const installationId = parseInstallationId(
    new URL(request.url).searchParams.get("installation")
  );
  if (installationId === null) {
    return invalid("An installation id is required.", {
      installation: "required",
    });
  }

  if (!(await callerMayUseInstallation(caller, installationId))) {
    return notFound("Installation");
  }

  let branches: Awaited<ReturnType<typeof listBranches>>;
  try {
    branches = await listBranches(installationId, `${owner}/${repo}`);
  } catch (err) {
    console.error("[v2/git/branches] listing failed:", err);
    return apiError(
      "upstream_error",
      "Could not list branches from GitHub. Try again shortly.",
      502
    );
  }

  return json({
    repo: `${owner}/${repo}`,
    branches: branches.map((b) => ({ name: b.name, sha: b.commit.sha })),
  });
}
