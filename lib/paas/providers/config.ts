/**
 * GitLab and Bitbucket credentials, read from the environment.
 *
 * Separate from `lib/paas/config.ts` because that file belongs to the deploy
 * lane and this is provider work — same pattern, different owner, no shared
 * edit. The `required()` behaviour is deliberately identical: a missing value
 * throws at the point of use rather than returning undefined, so a
 * misconfigured environment fails at the request that needs it with the
 * variable's name in the message, instead of somewhere downstream as a 401 that
 * looks like a revoked token.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`[paas/providers/config] ${name} is not set`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export const providerConfig = {
  gitlab: {
    /**
     * Self-hosted GitLab is a first-class case — see gitlab/client.ts. Defaults
     * to gitlab.com, and every URL is built from this rather than hardcoded.
     */
    host: () => optional("V2_GITLAB_HOST", "https://gitlab.com").replace(/\/+$/, ""),
    clientId: () => required("V2_GITLAB_CLIENT_ID"),
    clientSecret: () => required("V2_GITLAB_CLIENT_SECRET"),
    /**
     * The shared token compared for equality on every webhook. NOT an HMAC —
     * see gitlab/webhook.ts for why that matters and what it does not prove.
     */
    webhookSecret: () => required("V2_GITLAB_WEBHOOK_SECRET"),
  },

  bitbucket: {
    clientId: () => required("V2_BITBUCKET_CLIENT_ID"),
    clientSecret: () => required("V2_BITBUCKET_CLIENT_SECRET"),
    webhookSecret: () => required("V2_BITBUCKET_WEBHOOK_SECRET"),
  },

  /**
   * Where providers send the user back.
   *
   * Built from one base so the three callbacks cannot drift onto different
   * hosts, and so a deployment that forgets to set it fails loudly rather than
   * redirecting to localhost in production.
   */
  callbackUrl: (provider: "gitlab" | "bitbucket") =>
    `${required("V2_PUBLIC_APP_URL").replace(/\/+$/, "")}/api/v2/${provider}/callback`,
};

/** GitLab's OAuth endpoints, derived from the configured host. */
export const gitlabOauth = {
  authorizeUrl: (host: string) => `${host}/oauth/authorize`,
  tokenUrl: (host: string) => `${host}/oauth/token`,
  /**
   * `api` is broader than we want but is the narrowest scope that covers
   * listing projects, reading files and creating webhooks. `read_repository`
   * alone cannot create a hook, and a connection that cannot register its
   * webhook is a project that never auto-deploys.
   */
  scopes: "api read_user",
};

export const bitbucketOauth = {
  authorizeUrl: "https://bitbucket.org/site/oauth2/authorize",
  tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
  /**
   * `webhook` is required to register the push hook. `repository` covers
   * listing and reading. `account` is what makes /workspaces answer, which is
   * how the connection learns its own identity.
   */
  scopes: "account repository webhook",
};
