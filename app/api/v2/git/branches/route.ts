/**
 * GET /api/v2/git/branches?provider=&repo=&connection=
 *
 * Branches for one repository, on any provider.
 *
 * WHY THIS EXISTS ALONGSIDE the GitHub-only route at
 * /api/v2/git/repos/[owner]/[repo]/branches: that one takes the repository as
 * two path segments, and a GitLab path is not two segments. `group/sub/project`
 * is an ordinary GitLab project and cannot be expressed there at all — the
 * router would read `sub` as the repository and drop the rest. The repository
 * therefore arrives as one query parameter here, kept whole.
 *
 * The older route is left alone rather than rewritten: it is what the GitHub
 * picker already calls, and a path shape is not something to change underneath
 * a working caller for the sake of tidiness.
 */

import { listBranches } from "@/lib/paas/providers/source";
import { resolveToken, type ConnectionRow } from "@/lib/paas/providers/adapter";
import { getCaller } from "../../_lib/auth";
import { json, unauthenticated, notFound, invalid, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";

const PROVIDERS = ["github", "gitlab", "bitbucket"] as const;
type Provider = (typeof PROVIDERS)[number];

/**
 * A repository path, and nothing that could climb out of one.
 *
 * These segments end up in a provider API URL. v1 had a git_ref traversal bug
 * of exactly this shape, so `..` is rejected here rather than trusted upstream.
 * Nesting is allowed because GitLab nests; each SEGMENT is still constrained.
 */
const REPO_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const url = new URL(request.url);
  const provider = (url.searchParams.get("provider") ?? "github") as Provider;
  const repo = url.searchParams.get("repo") ?? "";
  const connectionId = url.searchParams.get("connection") ?? "";

  if (!PROVIDERS.includes(provider)) {
    return invalid("Unknown git provider.", { provider: "unknown" });
  }
  if (!repo || !REPO_PATH.test(repo) || repo.includes("..") || repo.length > 255) {
    return invalid("Malformed repository name.", { repo: "shape" });
  }
  if (!connectionId || connectionId.length > 128) {
    return invalid("A connection is required.", { connection: "required" });
  }

  // THE CONNECTION MUST BE ONE OF THEIRS. RLS scopes this read, so a caller
  // naming a stranger's connection gets "not found" rather than a listing of
  // repositories they cannot see. Treated as 404, not 403: a 403 would confirm
  // the connection exists.
  const { data: rows, error } = await caller.db
    .from("installations")
    .select("provider,external_id,access_token_ct,token_dek_id,token_expires_at,deleted_at")
    .eq("provider", provider)
    .eq("external_id", connectionId)
    .is("deleted_at", null);

  if (error) {
    console.error("[v2/git/branches] connection read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read your git connections.", 500);
  }
  if (!rows || rows.length === 0) return notFound("Connection");

  // GitHub mints a token per installation from the App key and stores nothing,
  // so resolveToken has nothing to find there — null is correct, not a failure.
  let token: string | null = null;
  if (provider !== "github") {
    const resolved = resolveToken(rows[0] as unknown as ConnectionRow);
    token = "token" in resolved ? resolved.token : null;
  }

  const installationId =
    provider === "github" && /^\d+$/.test(connectionId) ? Number(connectionId) : null;

  const branches = await listBranches(provider, repo, installationId, token);

  // NULL IS NOT AN EMPTY LIST. A repository we could not ask about must not be
  // reported as one with no branches — the picker would render an empty
  // dropdown and imply the repository is empty, which is never true of one the
  // customer can see.
  if (branches === null) {
    return apiError(
      "upstream_error",
      `Could not read branches from ${provider}. Try again shortly.`,
      502,
    );
  }

  return json({ branches: branches.map((name) => ({ name })), provider, repo });
}
