import { GitHubProvider } from "@/lib/providers/github";

export type GitProvider = "github" | "gitlab" | "bitbucket";

/**
 * Get a fresh OAuth access token for the given git provider.
 * Returns null if the token cannot be obtained (non-fatal — callers fall back to unauthenticated URL).
 */
export async function getGitProviderToken(
  userId: string,
  provider: GitProvider
): Promise<string | null> {
  try {
    if (provider === "github") {
      const githubProvider = new GitHubProvider();
      const tokenObj = await githubProvider.getToken(userId);
      return tokenObj?.accessToken ?? null;
    }

    if (provider === "gitlab") {
      const { getValidGitLabToken } = await import("@/lib/gitlab/token-refresh");
      return await getValidGitLabToken(userId);
    }

    if (provider === "bitbucket") {
      try {
        const { getValidBitbucketToken } = await import("@/lib/bitbucket/token-refresh");
        return await getValidBitbucketToken(userId);
      } catch {
        return null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Inject an OAuth token into a git HTTPS URL for private repository access.
 * Strips any existing credentials before injecting to avoid double-embedding.
 */
export function buildAuthenticatedGitUrl(
  url: string,
  token: string,
  provider: GitProvider
): string {
  switch (provider) {
    case "github":
      return url.replace(
        /https:\/\/(www\.)?github\.com\//,
        `https://${token}@github.com/`
      );
    case "gitlab":
      return url.replace(
        /https:\/\/(www\.)?gitlab\.com\//,
        `https://oauth2:${token}@gitlab.com/`
      );
    case "bitbucket":
      return url.replace(
        /https:\/\/(www\.)?bitbucket\.org\//,
        `https://x-token-auth:${token}@bitbucket.org/`
      );
    default:
      return url;
  }
}
