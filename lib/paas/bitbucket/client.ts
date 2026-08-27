/**
 * Bitbucket Cloud repository operations, performed with a connection's OAuth
 * token.
 *
 * As with GitLab, the token is passed in: this module does no database access
 * and no decryption, so every call site has already decided which connection it
 * is acting as.
 *
 * BITBUCKET CLOUD ONLY. Bitbucket Server (now Data Center) is a different
 * product with a different API — `/rest/api/1.0` rather than `/2.0`, and
 * different pagination. There is no host parameter here on purpose: accepting
 * one would imply Server works, and it would fail in a way that looks like an
 * auth problem rather than an unsupported product.
 */

import type { ProviderRepo } from "../providers/types.ts";

const BB_API = "https://api.bitbucket.org/2.0";
const UA = "ahuracloud-deploy-v2";

const MAX_PAGES = 20;
const PAGE_LEN = 100;

async function bbRequest<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    // The token is never interpolated here. It is a durable credential to a
    // customer's source and this string reaches logs and error trackers.
    throw new Error(`[bitbucket/client] GET ${url.replace(BB_API, "")} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

interface BitbucketRepo {
  uuid: string;
  full_name: string;
  is_private: boolean;
  mainbranch?: { name?: string } | null;
  workspace?: { uuid?: string; slug?: string };
}

interface Paged<T> {
  values: T[];
  /** Bitbucket returns a full URL, not a page number. */
  next?: string;
}

/**
 * Repositories this token can see, with write access.
 *
 * `role=contributor` is the Bitbucket equivalent of the Developer floor used
 * for GitLab: a user with only `member` on a workspace can read repositories
 * they cannot push to. Listing those puts entries in the create-flow picker
 * that fail at clone time with a permission error the customer cannot resolve.
 */
export async function listRepos(token: string, connectionId: string): Promise<ProviderRepo[]> {
  const out: ProviderRepo[] = [];

  // Bitbucket paginates by handing back a full `next` URL rather than a page
  // number. Following it verbatim is the documented contract — reconstructing
  // the query breaks the moment they add a cursor parameter.
  let url: string | undefined =
    `${BB_API}/repositories?role=contributor&pagelen=${PAGE_LEN}&sort=-updated_on`;

  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const body: Paged<BitbucketRepo> = await bbRequest<Paged<BitbucketRepo>>(token, url);

    for (const r of body.values ?? []) {
      out.push({
        provider: "bitbucket",
        fullName: r.full_name,
        private: r.is_private,
        // `mainbranch` is null on a repository with no commits yet. Null rather
        // than "main": a guessed default branch decides production-vs-preview,
        // and guessing wrong puts a feature branch on the live hostname.
        defaultBranch: r.mainbranch?.name ?? null,
        connectionId,
        account: r.workspace?.slug ?? r.full_name.split("/")[0],
      });
    }

    url = body.next;
  }

  if (url) {
    // More pages remained at the ceiling. Loud rather than silently truncated —
    // a customer whose repository is missing from the picker has no way to tell
    // that from it not existing.
    throw new Error(
      `[bitbucket/client] more than ${MAX_PAGES * PAGE_LEN} repositories for this connection — ` +
        `refusing to return a silently truncated list. Add a search filter to the picker.`,
    );
  }
  return out;
}

export interface Branch {
  name: string;
  commit: { sha: string };
}

/** Branches for one repository, in the shape the existing branches route returns. */
export async function listBranches(token: string, fullName: string): Promise<Branch[]> {
  const body = await bbRequest<Paged<{ name: string; target?: { hash?: string } }>>(
    token,
    `${BB_API}/repositories/${fullName}/refs/branches?pagelen=${PAGE_LEN}`,
  );
  return (body.values ?? [])
    // A branch whose target hash is missing cannot be deployed and would become
    // an entry that fails at build time. Dropped here rather than passed on.
    .filter((b) => typeof b.target?.hash === "string")
    .map((b) => ({ name: b.name, commit: { sha: b.target!.hash! } }));
}

/**
 * A clone URL and the credential to use with it, kept SEPARATE.
 *
 * Clean URL; the token goes to git through a credential file. Git echoes the
 * remote on failure, the build log is uploaded and served to the team, and this
 * token is durable — embedding it would publish account-wide access the first
 * time a clone failed.
 *
 * Bitbucket authenticates OAuth tokens over HTTPS as the literal user
 * `x-token-auth`, which is neither GitHub's `x-access-token` nor GitLab's
 * `oauth2`. All three differ, so each client states its own rather than leaving
 * a caller to remember which is which.
 */
export function buildCloneUrl(fullName: string): { cloneUrl: string; username: string } {
  return {
    cloneUrl: `https://bitbucket.org/${fullName}.git`,
    username: "x-token-auth",
  };
}

/** One file's raw contents, for framework detection. Null when absent. */
export async function getFileContents(
  token: string,
  fullName: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const res = await fetch(
    `${BB_API}/repositories/${fullName}/src/${encodeURIComponent(ref)}/${path}`,
    { headers: { Authorization: `Bearer ${token}`, "User-Agent": UA } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`[bitbucket/client] contents ${fullName}/${path} -> ${res.status}`);
  return res.text();
}
