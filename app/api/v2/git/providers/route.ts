/**
 * GET /api/v2/git/providers
 *
 * Which git providers this deployment can actually connect to.
 *
 * WHY THIS EXISTS: the authorize routes throw when their client id or secret is
 * missing, and correctly so — a half-configured OAuth app produces an authorize
 * URL the provider rejects with an error the customer cannot act on. But that
 * only turns a silent failure into a 500 AFTER the click. Asking first means the
 * button either works or explains itself, which is the difference between "this
 * platform is broken" and "this platform does not have GitLab turned on".
 *
 * REQUIRES A SIGNED-IN CALLER. No secret value is returned, only whether one is
 * present — The check is a
 * try/catch around the same accessors the authorize routes use, so this cannot
 * drift from what they require — a new required variable makes this report
 * unconfigured on its own, without anybody remembering to update a list.
 */

import { providerConfig } from "@/lib/paas/providers/config";
import { paasConfig } from "@/lib/paas/config";
import { getCaller } from "../../_lib/auth";
import { json, unauthenticated } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Provider = "github" | "gitlab" | "bitbucket";

interface ProviderStatus {
  provider: Provider;
  label: string;
  configured: boolean;
  connectUrl: string;
  /** Present only when unconfigured — what an operator has to set. */
  missing?: string;
}

function probe(check: () => void): boolean {
  try {
    check();
    return true;
  } catch {
    // The accessor names the variable in its message, which belongs in the
    // server log rather than in a response to a customer who cannot set it.
    return false;
  }
}

export async function GET() {
  // SIGNED IN ONLY. This route names which providers are configured and which
  // environment variables are unset — a map of our configuration state, and no
  // use whatsoever to somebody who is not about to connect an account. Every
  // sibling under app/api/v2/git checks the caller; this one shipped without
  // the check and answered anonymously on production until it was caught.
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  // GitHub authenticates as an App, not through OAuth client credentials, so
  // it is configured when the App itself is. Probed through the SAME accessors
  // the App client uses rather than by naming environment variables here — a
  // hardcoded list is how this route would come to disagree with the code that
  // actually needs the values.
  const githubReady = probe(() => {
    paasConfig.github.appId();
    paasConfig.github.privateKey();
  });

  const gitlabReady = probe(() => {
    providerConfig.gitlab.clientId();
    providerConfig.gitlab.clientSecret();
    providerConfig.callbackUrl("gitlab");
  });

  const bitbucketReady = probe(() => {
    providerConfig.bitbucket.clientId();
    providerConfig.bitbucket.clientSecret();
    providerConfig.callbackUrl("bitbucket");
  });

  const providers: ProviderStatus[] = [
    {
      provider: "github",
      label: "GitHub",
      configured: githubReady,
      connectUrl: "/api/v2/git/connect",
      ...(githubReady ? {} : { missing: "V2_GITHUB_APP_ID and V2_GITHUB_APP_PRIVATE_KEY_PATH" }),
    },
    {
      provider: "gitlab",
      label: "GitLab",
      configured: gitlabReady,
      connectUrl: "/api/v2/gitlab/authorize",
      ...(gitlabReady
        ? {}
        : { missing: "V2_GITLAB_CLIENT_ID, V2_GITLAB_CLIENT_SECRET and V2_PUBLIC_APP_URL" }),
    },
    {
      provider: "bitbucket",
      label: "Bitbucket",
      configured: bitbucketReady,
      connectUrl: "/api/v2/bitbucket/authorize",
      ...(bitbucketReady
        ? {}
        : { missing: "V2_BITBUCKET_CLIENT_ID, V2_BITBUCKET_CLIENT_SECRET and V2_PUBLIC_APP_URL" }),
    },
  ];

  return json({ providers });
}
