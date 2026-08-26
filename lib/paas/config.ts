/**
 * Deploy v2 — typed configuration.
 *
 * Every v2 credential is namespaced `V2_*` and read through here, so there is
 * exactly one place to audit what the platform holds and one place to rotate.
 * Values live in `.env.local` (gitignored). The GitHub App private key is read
 * from a path OUTSIDE every git repo so it can never be committed.
 */

import { readFileSync } from "node:fs";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `[paas/config] Missing required env var ${name}. See .env.local and docs/v2/03-credentials.md.`,
    );
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

let _githubPrivateKey: string | null = null;

export const paasConfig = {
  github: {
    appId: () => required("V2_GITHUB_APP_ID"),
    clientId: () => required("V2_GITHUB_APP_CLIENT_ID"),
    clientSecret: () => required("V2_GITHUB_APP_CLIENT_SECRET"),
    webhookSecret: () => required("V2_GITHUB_APP_WEBHOOK_SECRET"),
    /** PEM read once from a path outside the repo, then cached in memory. */
    privateKey: (): string => {
      if (_githubPrivateKey) return _githubPrivateKey;
      const path = required("V2_GITHUB_APP_PRIVATE_KEY_PATH");
      _githubPrivateKey = readFileSync(path, "utf8");
      return _githubPrivateKey;
    },
  },

  linode: {
    token: () => required("V2_LINODE_TOKEN"),
    region: () => optional("V2_LINODE_REGION", "in-bom-2"),
    apiBase: () => optional("V2_LINODE_API_URL", "https://api.linode.com/v4"),
  },

  cloudflare: {
    apiToken: () => required("V2_CF_API_TOKEN"),
    accountId: () => required("V2_CF_ACCOUNT_ID"),
    zoneId: () => required("V2_CF_ZONE_ID"),
    zoneName: () => optional("V2_CF_ZONE_NAME", "ahurasense.com"),
  },

  r2: {
    accountId: () => required("V2_R2_ACCOUNT_ID"),
    bucket: () => required("V2_R2_BUCKET"),
    endpoint: () => required("V2_R2_ENDPOINT"),
    accessKeyId: () => required("V2_R2_ACCESS_KEY_ID"),
    secretAccessKey: () => required("V2_R2_SECRET_ACCESS_KEY"),
  },

  /**
   * The apex under which app + preview hostnames are minted. Until Advanced
   * Certificate Manager is purchased this is `ahurasense.com` (covered by the
   * free Universal SSL wildcard, which reaches exactly one label deep). When
   * ACM is enabled, switch to `apps.ahurasense.com`.
   */
  appDomain: () => optional("V2_APP_DOMAIN", "ahurasense.com"),
  acmEnabled: () => optional("V2_ACM_ENABLED", "false") === "true",
} as const;

/**
 * Mint a public hostname for an app or preview under the app domain.
 * Single DNS label so it stays inside the wildcard certificate's coverage and
 * under the 63-char label limit.
 */
export function appHostname(label: string): string {
  return `${label}.${paasConfig.appDomain()}`;
}
