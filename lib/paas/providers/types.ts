/**
 * The shape all three git providers normalise to.
 *
 * WHY A SHARED SHAPE AND NOT THREE. Everything downstream of a push — build,
 * hostname minting, tier sizing, reaping — asks the same four questions: which
 * repo, which branch, which commit, and is this a deletion. Those answers do
 * not differ between providers; only the JSON they arrive in does. Letting
 * provider-shaped objects travel past the adapter would put a `path_with_
 * namespace` check and a `full_name` check in the deploy path, and the third
 * provider would add a third.
 *
 * So the adapters own the differences and nothing past them knows which
 * provider a push came from — except where it genuinely matters, which is why
 * `provider` is on the event rather than discarded.
 *
 * WHAT DELIBERATELY IS NOT NORMALISED: how a request is authenticated. GitHub
 * and Bitbucket sign the body; GitLab compares a shared token. Flattening that
 * into one `verify()` would hide a real difference in what the check proves —
 * see the note in each webhook module.
 *
 * Pure. No network.
 */

/** Matches `paas.git_provider` — the enum already exists in the schema. */
export type GitProvider = "github" | "gitlab" | "bitbucket";

export const GIT_PROVIDERS: readonly GitProvider[] = ["github", "gitlab", "bitbucket"] as const;

export function isGitProvider(v: unknown): v is GitProvider {
  return typeof v === "string" && (GIT_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Why a webhook was refused.
 *
 * Shared across providers because the CALLER's handling is the same shape
 * everywhere: `no-secret` is our misconfiguration and should page someone,
 * `mismatch` is somebody probing the endpoint. Collapsing them into a boolean
 * would make the first look like the second, and the first is the one that
 * means the endpoint is open.
 */
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no-secret" | "no-signature" | "bad-format" | "mismatch" };

/**
 * A push, after the provider's shape has been taken off it.
 *
 * Mirrors `github/webhook.ts`'s PushEvent field-for-field on purpose: that one
 * is in production and the deploy path already reads it, so a normalised event
 * that disagreed with it would mean two shapes rather than one.
 */
export interface ProviderPushEvent {
  provider: GitProvider;
  /** `owner/repo` for GitHub and Bitbucket, `group/subgroup/project` for GitLab. */
  repoFullName: string;
  /** Branch name with any ref prefix stripped. Null for tags and other refs. */
  branch: string | null;
  sha: string;
  message: string | null;
  author: string | null;
  /** True when the push deleted the branch — nothing to build. */
  deleted: boolean;
  /**
   * The provider-side identifier for the connection this push arrived under,
   * as a STRING.
   *
   * GitHub sends a numeric installation id, GitLab a numeric project id, and
   * Bitbucket a workspace UUID. A number cannot hold the third, so this is text
   * everywhere rather than text-for-one-provider — the alternative is a column
   * whose type depends on a sibling column's value.
   *
   * Null when the payload carried none, which is not the same as zero.
   */
  connectionId: string | null;
}

/**
 * A repository, as the create-flow needs it.
 *
 * Field names are GitHub's because the API already returns them and the UI lane
 * already reads them. Normalising GitLab's `path_with_namespace` and
 * Bitbucket's `full_name` onto these is the adapter's job — a rename in one
 * place beats three shapes in the client.
 */
export interface ProviderRepo {
  provider: GitProvider;
  fullName: string;
  private: boolean;
  /** Null when the provider did not say. Never guessed as "main". */
  defaultBranch: string | null;
  /** Which connection this repo was listed under. */
  connectionId: string;
  /** Owning org, group or workspace. */
  account: string;
}

/**
 * One provider's contribution to a repo listing, including its failure.
 *
 * THE POINT OF THIS TYPE. If GitLab's API is down and GitHub's is fine, the
 * combined response must not read as "the user has no GitLab repos". An empty
 * list invites "connect your account"; an error invites "retry". They are
 * different states and the UI renders them differently, so the adapter reports
 * which one it is instead of returning `[]` for both.
 */
export interface ProviderListing {
  provider: GitProvider;
  /** Null when the provider could not be read — NOT an empty array. */
  repos: ProviderRepo[] | null;
  /** Set when repos is null. */
  error: string | null;
}

/** Did every provider answer? A listing with an unread provider is partial. */
export function listingIsComplete(listings: ProviderListing[]): boolean {
  return listings.length > 0 && listings.every((l) => l.repos !== null);
}

/**
 * Flatten listings for display, keeping the failures separate.
 *
 * Returns the repos that WERE read alongside the providers that were not, so a
 * caller cannot accidentally render a partial list as a complete one — the
 * failures come back in the same call rather than needing a second look.
 */
export function mergeListings(listings: ProviderListing[]): {
  repos: ProviderRepo[];
  failed: Array<{ provider: GitProvider; error: string }>;
  complete: boolean;
} {
  return {
    repos: listings.flatMap((l) => l.repos ?? []),
    failed: listings
      .filter((l) => l.repos === null)
      .map((l) => ({ provider: l.provider, error: l.error ?? "unknown error" })),
    complete: listingIsComplete(listings),
  };
}
