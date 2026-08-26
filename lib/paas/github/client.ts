/**
 * GitHub repository operations, performed with a scoped installation token.
 *
 * Everything here uses a token minted by app.ts for a specific installation —
 * never a user OAuth token, never the App JWT.
 */

import { mintInstallationToken } from "@/lib/paas/github/app";

const GH_API = "https://api.github.com";
const UA = "ahuracloud-deploy-v2";

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
    cloneUrl: `https://x-access-token:${token}@github.com/${repo.full_name}.git`,
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
