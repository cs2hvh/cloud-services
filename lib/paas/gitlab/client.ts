/**
 * GitLab repository operations, performed with a connection's OAuth token.
 *
 * The token is passed in rather than resolved here: this module does no
 * database access and no decryption, so every call site is forced to have
 * already decided which connection it is acting as. GitHub's client mints its
 * own token because a GitHub token is derived from a private key and an
 * installation id; a GitLab token is stored, and something has to have read and
 * decrypted it first.
 *
 * SELF-HOSTED GITLAB IS A REAL CASE and the base URL is a parameter for it.
 * Hardcoding gitlab.com would make every self-hosted customer's connection fail
 * with a 404 from the wrong host, which reads as "repo not found" rather than
 * "we asked the wrong server".
 */

import type { ProviderRepo } from "../providers/types.ts";

export const GITLAB_CLOUD = "https://gitlab.com";
const UA = "ahuracloud-deploy-v2";

/** Pagination ceiling. See listRepos. */
const MAX_PAGES = 20;
const PER_PAGE = 100;

function apiBase(host: string): string {
  return `${host.replace(/\/+$/, "")}/api/v4`;
}

async function glRequest<T>(
  host: string,
  token: string,
  path: string,
): Promise<{ body: T; linkNext: boolean }> {
  const res = await fetch(`${apiBase(host)}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    // The token is NEVER interpolated into this message. An error string
    // carrying a bearer credential ends up in a log, a build output, or a
    // Sentry event — and this one is a durable credential to a customer's
    // source, not a one-hour minted token.
    throw new Error(`[gitlab/client] GET ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  // GitLab paginates with a Link header. `x-next-page` is simpler but is absent
  // on some self-hosted versions, so the header both agree on is used.
  const link = res.headers.get("link") ?? "";
  return { body: (await res.json()) as T, linkNext: /rel="next"/.test(link) };
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  visibility: "private" | "internal" | "public";
  default_branch: string | null;
  namespace?: { full_path?: string; kind?: string };
}

/**
 * Projects this token can see, with at least Developer access.
 *
 * `min_access_level=30` is Developer, and it is deliberate: a user can be a
 * Reporter on hundreds of projects they cannot deploy. Listing those puts
 * repositories in the create-flow picker that fail at clone time with a
 * permissions error the customer cannot act on — they do not have the access
 * and we cannot grant it.
 *
 * `membership=true` bounds the query to projects the user actually belongs to
 * rather than every public project on the instance.
 */
export async function listRepos(
  host: string,
  token: string,
  connectionId: string,
): Promise<ProviderRepo[]> {
  const out: ProviderRepo[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { body, linkNext } = await glRequest<GitLabProject[]>(
      host,
      token,
      `/projects?membership=true&min_access_level=30&archived=false&per_page=${PER_PAGE}&page=${page}&order_by=last_activity_at`,
    );

    for (const p of body) {
      out.push({
        provider: "gitlab",
        fullName: p.path_with_namespace,
        // `internal` means visible to any logged-in user of the instance. That
        // is not public, so treating it as private is the conservative reading
        // — it decides what a UI badges as exposed.
        private: p.visibility !== "public",
        defaultBranch: p.default_branch ?? null,
        connectionId,
        account: p.namespace?.full_path ?? p.path_with_namespace.split("/")[0],
      });
    }

    if (!linkNext || body.length === 0) return out;
  }

  // Reached the ceiling with more pages available. Returning silently would
  // give a customer with 2,000 projects a picker missing the ones they wanted
  // and no indication why, so this is loud.
  throw new Error(
    `[gitlab/client] more than ${MAX_PAGES * PER_PAGE} projects for this connection — ` +
      `refusing to return a silently truncated list. Add a search filter to the picker.`,
  );
}

export interface Branch {
  name: string;
  commit: { sha: string };
}

/** Branches for one project, in the shape the existing branches route returns. */
export async function listBranches(host: string, token: string, fullName: string): Promise<Branch[]> {
  // The path is a namespaced project path — `group/sub/proj` — and MUST be
  // URL-encoded whole, slashes included. GitLab reads `group%2Fsub%2Fproj` as
  // one path segment; leaving the slashes raw addresses a different endpoint
  // entirely and 404s.
  const id = encodeURIComponent(fullName);
  const { body } = await glRequest<Array<{ name: string; commit: { id: string } }>>(
    host,
    token,
    `/projects/${id}/repository/branches?per_page=${PER_PAGE}`,
  );
  return body.map((b) => ({ name: b.name, commit: { sha: b.commit.id } }));
}

/**
 * A clone URL and the credential to use with it, kept SEPARATE.
 *
 * The URL is clean. The token is returned alongside and delivered to git
 * through a credential file, never embedded in the remote — git echoes the
 * remote URL on failure, the build log is uploaded to R2, and the log is served
 * to every member of the team. Embedding it would publish a durable credential
 * to a customer's whole account the first time a clone failed.
 *
 * GitLab's OAuth tokens authenticate over HTTPS as the `oauth2` user, which is
 * why the username matters and is stated rather than left to the caller.
 */
export function buildCloneUrl(
  host: string,
  fullName: string,
): { cloneUrl: string; username: string } {
  return {
    cloneUrl: `${host.replace(/\/+$/, "")}/${fullName}.git`,
    username: "oauth2",
  };
}

/** One file's raw contents, for framework detection. Null when absent. */
export async function getFileContents(
  host: string,
  token: string,
  fullName: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const id = encodeURIComponent(fullName);
  const file = encodeURIComponent(path);
  const res = await fetch(
    `${apiBase(host)}/projects/${id}/repository/files/${file}/raw?ref=${encodeURIComponent(ref)}`,
    { headers: { Authorization: `Bearer ${token}`, "User-Agent": UA } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`[gitlab/client] contents ${fullName}/${path} -> ${res.status}`);
  return res.text();
}
