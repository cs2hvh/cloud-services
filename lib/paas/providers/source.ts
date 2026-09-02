/**
 * Reading a repository, whichever provider it lives on.
 *
 * `deployFromRepo` was written when GitHub was the only provider and said so in
 * two places that mattered: it created every project with `provider: "github"`,
 * and it built every clone URL as `https://github.com/<repo>.git`. The OAuth
 * flows, the webhook receivers, the per-provider clients and the multi-provider
 * columns all existed — a GitLab connection could be recorded and its pushes
 * received, and then the build would try to clone it from github.com.
 *
 * This is the seam that was missing: the three questions the deploy path asks of
 * a repository, answered per provider.
 *
 *   1. what is the default branch
 *   2. what does this file contain
 *   3. where do I clone it from, and as whom
 *
 * PUBLIC REPOSITORIES NEED NO TOKEN, on any of the three. That is not a
 * convenience — it is what makes the deploy path testable without an OAuth app
 * registration, and it is how every framework in the sweep was proven. Each
 * reader takes an optional token and falls back to the provider's anonymous raw
 * endpoint, which is exactly what the GitHub path already did.
 */

import * as gitlab from "../gitlab/client.ts";
import * as bitbucket from "../bitbucket/client.ts";
import { getFileContents as githubFile, getDefaultBranch as githubBranch } from "../github/client.ts";
import { providerConfig } from "./config.ts";

export type GitProvider = "github" | "gitlab" | "bitbucket";

const UA = "ahurasense-paas-v2";

/**
 * Fetch a raw file, keeping ABSENT and COULD-NOT-READ apart.
 *
 * 404 IS THE ONLY STATUS THAT MEANS NULL. Everything else that is not 200 —
 * 429, 401, 500 — means we could not ask, and returning null for those tells
 * detection the file is not there. It then reports a repository with no
 * package.json and no Dockerfile, and the customer is told to add files they
 * already have.
 *
 * That is not hypothetical here. Bitbucket allows SIXTY anonymous API calls
 * per hour per IP, and inspectRepo probes a dozen marker files per deploy —
 * so the fourth unauthenticated deploy from one address starts getting 429s.
 * Observed exactly that way while proving this path. github/client.ts already
 * throws on anything that is not 200 or 404 for the same reason; this is that
 * rule, applied to the other two providers.
 */
async function readRaw(label: string, url: string, token: string | null): Promise<string | null> {
  const headers: Record<string, string> = { "User-Agent": UA };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `[paas/providers/source] ${label} returned ${res.status}` +
        (res.status === 429
          ? " — rate limited. Connect the account so reads are authenticated."
          : ""),
    );
  }
  return res.text();
}

/** Same shape the build VM needs: a clean URL and the username to pair a token with. */
export interface CloneTarget {
  cloneUrl: string;
  /** Which username a token is presented as. Unused when there is no token. */
  username: string;
}

export function cloneTarget(provider: GitProvider, fullName: string): CloneTarget {
  switch (provider) {
    case "gitlab": {
      // Host, not a hardcoded gitlab.com: self-hosted GitLab is a first-class
      // case in this codebase and every URL is built from the configured host.
      const { cloneUrl, username } = gitlab.buildCloneUrl(providerConfig.gitlab.host(), fullName);
      return { cloneUrl, username };
    }
    case "bitbucket":
      return bitbucket.buildCloneUrl(fullName);
    case "github":
      return { cloneUrl: `https://github.com/${fullName}.git`, username: "x-access-token" };
  }
}

/**
 * The default branch, asked for rather than guessed.
 *
 * Null when it cannot be read at all, which the caller must not confuse with a
 * repository that has no branches — see the note in deploy.ts about a guess that
 * looked right until `git clone` disagreed.
 */
export async function defaultBranch(
  provider: GitProvider,
  fullName: string,
  installationId: number | null,
  token: string | null,
): Promise<string | null> {
  if (provider === "github") return githubBranch(installationId, fullName);

  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    if (provider === "gitlab") {
      const host = providerConfig.gitlab.host();
      const res = await fetch(
        `${host}/api/v4/projects/${encodeURIComponent(fullName)}`,
        { headers },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { default_branch?: unknown };
      return typeof body.default_branch === "string" && body.default_branch
        ? body.default_branch
        : null;
    }

    const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${fullName}`, { headers });
    if (!res.ok) return null;
    // Bitbucket nests it: mainbranch.name, and mainbranch is null on an empty
    // repository rather than absent, so both have to be tolerated.
    const body = (await res.json()) as { mainbranch?: { name?: unknown } | null };
    const name = body.mainbranch?.name;
    return typeof name === "string" && name ? name : null;
  } catch {
    // A network failure is not "no default branch". Null means unknown, and the
    // caller decides what to do about that.
    return null;
  }
}

/**
 * One file's contents, or null when it is not there.
 *
 * Null is ABSENT, and a throw is COULD NOT ASK. Detection depends on that
 * distinction: a marker file that is missing means one framework, and a
 * repository that cannot be read means something else entirely.
 */
export async function fileContents(
  provider: GitProvider,
  fullName: string,
  path: string,
  ref: string,
  installationId: number | null,
  token: string | null,
): Promise<string | null> {
  if (provider === "github") {
    if (installationId !== null) return githubFile(installationId, fullName, path, ref);
    return readRaw(
      "github raw",
      `https://raw.githubusercontent.com/${fullName}/${ref}/${path}`,
      null,
    );
  }

  if (provider === "gitlab") {
    const host = providerConfig.gitlab.host();
    if (token) return gitlab.getFileContents(host, token, fullName, path, ref);
    // The anonymous raw endpoint, which works for a public project and 404s for
    // a private one — the same answer an absent file gives, which is why the
    // caller reports unreadable repositories separately.
    return readRaw(
      "gitlab raw",
      `${host}/${fullName}/-/raw/${encodeURIComponent(ref)}/${path}`,
      null,
    );
  }

  if (token) return bitbucket.getFileContents(token, fullName, path, ref);
  return readRaw(
    "bitbucket src",
    `https://api.bitbucket.org/2.0/repositories/${fullName}/src/${encodeURIComponent(ref)}/${path}`,
    null,
  );
}

/**
 * The names directly inside one directory of the repository, or null.
 *
 * WHY THIS EXISTS: detection probes about forty marker files, and on Bitbucket
 * each probe is one REST call against a budget of SIXTY PER HOUR for an
 * unauthenticated caller. One deploy therefore consumed most of an hour's
 * allowance and the second failed at detect with a 429 — observed exactly that
 * way. Listing the directory once answers the same question in a single call.
 *
 * NULL MEANS COULD-NOT-LIST, NOT EMPTY. The caller falls back to probing each
 * file, which is the behaviour that existed before this. An empty ARRAY means
 * the directory really is empty — a different fact, and one the caller is
 * entitled to act on.
 */
export async function listDir(
  provider: GitProvider,
  fullName: string,
  ref: string,
  dir: string,
  token: string | null,
): Promise<string[] | null> {
  const clean = dir.replace(/^\/+|\/+$/g, "");
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    if (provider === "bitbucket") {
      const url =
        `https://api.bitbucket.org/2.0/repositories/${fullName}/src/` +
        `${encodeURIComponent(ref)}/${clean ? `${clean}/` : ""}?pagelen=100`;
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const body = (await res.json()) as { values?: Array<{ path?: unknown }> };
      if (!Array.isArray(body.values)) return null;
      // Bitbucket returns the FULL path from the repository root, so a root
      // directory has to be stripped back off to leave a bare name.
      return body.values
        .map((v) => (typeof v.path === "string" ? v.path : ""))
        .filter(Boolean)
        .map((full) => (clean && full.startsWith(`${clean}/`) ? full.slice(clean.length + 1) : full));
    }

    if (provider === "gitlab") {
      const host = providerConfig.gitlab.host();
      const url =
        `${host}/api/v4/projects/${encodeURIComponent(fullName)}/repository/tree` +
        `?ref=${encodeURIComponent(ref)}&per_page=100` +
        (clean ? `&path=${encodeURIComponent(clean)}` : "");
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ name?: unknown }>;
      if (!Array.isArray(body)) return null;
      return body.map((v) => (typeof v.name === "string" ? v.name : "")).filter(Boolean);
    }

    // GitHub reads through raw.githubusercontent.com, which does not share the
    // API's sixty-per-hour anonymous budget — probing there is already cheap,
    // and the contents API would spend the scarcer allowance to save nothing.
    return null;
  } catch {
    // A network failure is not an empty directory.
    return null;
  }
}

/** Where a commit can be read, for the UI to link to. */
export function commitUrl(provider: GitProvider, fullName: string, sha: string): string {
  switch (provider) {
    case "gitlab":
      return `${providerConfig.gitlab.host()}/${fullName}/-/commit/${sha}`;
    case "bitbucket":
      return `https://bitbucket.org/${fullName}/commits/${sha}`;
    case "github":
      return `https://github.com/${fullName}/commit/${sha}`;
  }
}

/** Where the repository itself lives. */
export function repoUrl(provider: GitProvider, fullName: string): string {
  switch (provider) {
    case "gitlab":
      return `${providerConfig.gitlab.host()}/${fullName}`;
    case "bitbucket":
      return `https://bitbucket.org/${fullName}`;
    case "github":
      return `https://github.com/${fullName}`;
  }
}

/**
 * Branch names, newest-listed first as the provider returns them.
 *
 * NULL MEANS COULD NOT ASK — an empty array means the repository genuinely has
 * no branches, which is true only of one that has never been pushed to. The
 * picker depends on that distinction: rendering an empty dropdown for a
 * repository you can see implies it has no branches, which is never the case.
 */
export async function listBranches(
  provider: GitProvider,
  fullName: string,
  installationId: number | null,
  token: string | null,
): Promise<string[] | null> {
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    if (provider === "github") {
      if (installationId !== null) {
        const { listBranches: gh } = await import("../github/client.ts");
        return (await gh(installationId, fullName)).map((b) => b.name);
      }
      const res = await fetch(`https://api.github.com/repos/${fullName}/branches?per_page=100`, {
        headers,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ name?: unknown }>;
      return Array.isArray(body)
        ? body.map((b) => (typeof b.name === "string" ? b.name : "")).filter(Boolean)
        : null;
    }

    if (provider === "gitlab") {
      const host = providerConfig.gitlab.host();
      const res = await fetch(
        `${host}/api/v4/projects/${encodeURIComponent(fullName)}/repository/branches?per_page=100`,
        { headers },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ name?: unknown }>;
      return Array.isArray(body)
        ? body.map((b) => (typeof b.name === "string" ? b.name : "")).filter(Boolean)
        : null;
    }

    const res = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${fullName}/refs/branches?pagelen=100`,
      { headers },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { values?: Array<{ name?: unknown }> };
    return Array.isArray(body.values)
      ? body.values.map((b) => (typeof b.name === "string" ? b.name : "")).filter(Boolean)
      : null;
  } catch {
    // A network failure is not a repository without branches.
    return null;
  }
}
