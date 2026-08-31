/**
 * Validation for creating a project. Separated from the route so the rules are
 * testable without a session, a database or a network.
 */

// Relative, with the extension, rather than the "@/" alias. This module is
// imported BOTH by a Next route and by a plain `node --test` suite, and node
// does not resolve the alias — the whole lib/paas tree runs dependency-free
// under node --test on purpose, and validation logic belongs on that side of
// the line.
import { TIERS } from "../../../../lib/paas/tiers.ts";

export interface CreateProjectInput {
  repo?: unknown;
  branch?: unknown;
  name?: unknown;
  rootDirectory?: unknown;
  tier?: unknown;
  instances?: unknown;
  installationId?: unknown;
  provider?: unknown;
  /**
   * The connection this repository is read through, provider-agnostic.
   *
   * `installationId` is the GitHub spelling of the same thing and is kept
   * for callers that predate multi-provider. A Bitbucket workspace id is a
   * braced UUID, so there is no number that could hold one.
   */
  connectionId?: unknown;
}

export interface CreateProjectPlan {
  repoFullName: string;
  productionBranch: string;
  name: string;
  slug: string;
  rootDirectory: string | null;
  tier: string;
  instances: number;
  /**
   * GitHub only, and 0 when there is none — the column it feeds is deprecated
   * in favour of connection_id and only accepts a number.
   */
  installationId: number;
  provider: GitProvider;
  connectionId: string;
}

export type Validated =
  | { ok: true; plan: CreateProjectPlan }
  | { ok: false; message: string; fields?: Record<string, string> };

export type GitProvider = "github" | "gitlab" | "bitbucket";
const PROVIDERS: readonly GitProvider[] = ["github", "gitlab", "bitbucket"];

/**
 * `owner/repo` — and on GitLab, `group/subgroup/repo`.
 *
 * GitLab NESTS and the two-segment rule rejects a perfectly ordinary GitLab
 * path as malformed. GitHub and Bitbucket are always exactly two, so the
 * looser grammar is applied only where it is true.
 */
const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const REPO_NESTED = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/;

/**
 * A slug becomes a DNS label, so it is bounded HERE rather than discovered at
 * deploy time. A project that cannot be given a hostname is a project that
 * cannot be deployed, and finding that out after the build has run is a worse
 * place to learn it.
 */
export function slugFromRepo(repoFullName: string): string {
  const name = repoFullName.split("/")[1] ?? repoFullName;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 38);
}

export function validateCreateProject(input: CreateProjectInput): Validated {
  // Defaulted to github because every caller written before multi-provider
  // means github, and rejecting an absent provider would break all of them.
  const provider = (
    typeof input.provider === "string" && input.provider.trim() ? input.provider.trim() : "github"
  ) as GitProvider;
  if (!PROVIDERS.includes(provider)) {
    return {
      ok: false,
      message: `Unknown git provider ${provider}.`,
      fields: { provider: "unknown" },
    };
  }

  const repo = typeof input.repo === "string" ? input.repo.trim() : "";
  if (!repo) return { ok: false, message: "Choose a repository.", fields: { repo: "required" } };
  const shape = provider === "gitlab" ? REPO_NESTED : REPO;
  if (!shape.test(repo)) {
    return {
      ok: false,
      message: "That does not look like an owner/repo name.",
      fields: { repo: "shape" },
    };
  }

  // THE CONNECTION, whichever provider it belongs to. This selects which
  // credential the build authenticates with, so a missing one must fail
  // loudly rather than default to "any connection".
  const connectionId =
    typeof input.connectionId === "string" && input.connectionId.trim()
      ? input.connectionId.trim()
      : input.installationId != null && String(input.installationId).trim()
        ? String(input.installationId).trim()
        : "";

  if (!connectionId) {
    return {
      ok: false,
      message: `Missing ${provider} connection.`,
      fields: { connectionId: "required" },
    };
  }

  // Only GitHub's is a number, and only GitHub's deprecated column wants one.
  // A Bitbucket workspace UUID would become NaN here, which is why this is 0
  // rather than a parse the other providers have to survive.
  const installationId =
    provider === "github" && /^\d+$/.test(connectionId) ? Number(connectionId) : 0;
  if (provider === "github" && (!Number.isSafeInteger(installationId) || installationId <= 0)) {
    return {
      ok: false,
      message: "Missing GitHub installation.",
      fields: { installationId: "required" },
    };
  }

  const branch = typeof input.branch === "string" && input.branch.trim() ? input.branch.trim() : "main";
  if (branch.length > 255 || /\s/.test(branch)) {
    return { ok: false, message: "That branch name is not valid.", fields: { branch: "shape" } };
  }

  const slug = slugFromRepo(repo);
  if (!slug) {
    return {
      ok: false,
      message: "That repository name cannot be turned into a hostname. Rename it or pick another.",
      fields: { repo: "slug" },
    };
  }

  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 200) : repo;

  // Leading and trailing slashes stripped so `/src/` and `src` mean the same
  // directory rather than two different lookups that both half-work.
  const rootRaw = typeof input.rootDirectory === "string" ? input.rootDirectory.trim() : "";
  const rootDirectory = rootRaw ? rootRaw.replace(/^\/+|\/+$/g, "") || null : null;
  if (rootDirectory && (rootDirectory.includes("..") || rootDirectory.length > 255)) {
    return { ok: false, message: "That root directory is not valid.", fields: { rootDirectory: "shape" } };
  }

  const tier = typeof input.tier === "string" && input.tier.trim() ? input.tier.trim() : "starter";
  // Checked against the tier table, not a hardcoded list — an unknown tier
  // reaching the database becomes a pod sized from a row nobody priced.
  if (!TIERS.some((t) => t.id === tier)) {
    return { ok: false, message: `Unknown plan "${tier}".`, fields: { tier: "unknown" } };
  }

  const instances = input.instances === undefined || input.instances === null ? 1 : Number(input.instances);
  if (!Number.isSafeInteger(instances) || instances < 1 || instances > 10) {
    return { ok: false, message: "Instances must be a whole number from 1 to 10.", fields: { instances: "range" } };
  }

  return {
    ok: true,
    plan: {
      repoFullName: repo,
      productionBranch: branch,
      name,
      slug,
      rootDirectory,
      tier,
      instances,
      installationId,
      provider,
      connectionId,
    },
  };
}
