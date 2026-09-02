/**
 * GitHub repository operations, performed with a scoped installation token.
 *
 * Everything here uses a token minted by app.ts for a specific installation —
 * never a user OAuth token, never the App JWT.
 */

import { mintInstallationToken } from "./app.ts";

const GH_API = "https://api.github.com";
const UA = "ahurasense-deploy-v2";

async function ghRequest<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GH_API}${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[github/client] GET ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  updated_at: string;
}

/** List the repositories a given installation can see. */
export async function listInstallationRepos(installationId: number): Promise<Repo[]> {
  const { token } = await mintInstallationToken(installationId);
  const out: Repo[] = [];
  let page = 1;
  for (;;) {
    const data = await ghRequest<{ total_count: number; repositories: Repo[] }>(
      token,
      `/installation/repositories?per_page=100&page=${page}`,
    );
    out.push(...data.repositories);
    if (out.length >= data.total_count || data.repositories.length === 0) break;
    page += 1;
  }
  return out;
}

export interface Branch {
  name: string;
  commit: { sha: string };
}

export async function listBranches(installationId: number, fullName: string): Promise<Branch[]> {
  const { token } = await mintInstallationToken(installationId);
  return ghRequest<Branch[]>(token, `/repos/${fullName}/branches?per_page=100`);
}

/**
 * A clone URL carrying a fresh, scoped, read-only installation token. This is
 * the ONLY credential the build VM receives, and it expires in an hour.
 * The token is embedded as the x-access-token basic-auth user.
 */
export async function buildCloneUrl(
  installationId: number,
  repo: { id: number; full_name: string },
): Promise<{ cloneUrl: string; token: string; expiresAt: string }> {
  const { token, expires_at } = await mintInstallationToken(installationId, {
    repositoryIds: [repo.id],
    readContentsOnly: true,
  });
  return {
    // CLEAN url. The token is returned separately and delivered to git via a
    // credential file — embedding it here would publish it to every team member
    // the first time a clone fails, because git echoes the remote URL and the
    // build log is uploaded and served.
    cloneUrl: `https://github.com/${repo.full_name}.git`,
    token,
    expiresAt: expires_at,
  };
}

/** Fetch a single file's raw contents (e.g. package.json for framework detection). */
export async function getFileContents(
  installationId: number,
  fullName: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const { token } = await mintInstallationToken(installationId, { readContentsOnly: true });
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await fetch(`${GH_API}/repos/${fullName}/contents/${path}${q}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`[github/client] contents ${fullName}/${path} -> ${res.status}`);
  return res.text();
}

/**
 * The repository's default branch, as GitHub reports it.
 *
 * ASKED, NOT GUESSED. Detection used to infer this by probing for README.md and
 * package.json on `main` and falling back to `master` when neither answered —
 * which is wrong for every repository that has neither file at its root. A Go
 * repository has no package.json, and plenty have no root README:
 * gothinkster/golang-gin-realworld-example-app has neither, so it was declared
 * `master`.
 *
 * That guess then survived long enough to do damage, because
 * raw.githubusercontent.com STILL SERVES a branch that GitHub has renamed —
 * `master/go.mod` returns 200 on a repository whose only branches are `main` and
 * two feature branches. Detection therefore succeeded against a ref that does
 * not exist, and the build died at
 *
 *     fatal: Remote branch master not found in upstream origin
 *
 * after leasing a machine. One request removes the whole class.
 *
 * Returns null rather than throwing when the repository cannot be read at all;
 * the caller has a better message for that than this function does.
 */
export async function getDefaultBranch(
  installationId: number | null,
  fullName: string,
): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": UA,
  };
  if (installationId !== null) {
    const { token } = await mintInstallationToken(installationId, { readContentsOnly: true });
    headers.Authorization = `token ${token}`;
  }

  const res = await fetch(`${GH_API}/repos/${fullName}`, { headers });
  if (!res.ok) return null;

  const body = (await res.json()) as { default_branch?: unknown };
  return typeof body.default_branch === "string" && body.default_branch ? body.default_branch : null;
}
