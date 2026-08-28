/**
 * GET /api/v2/repos
 *
 * Repositories the caller can deploy — the source list behind "New project".
 *
 * TWO SYSTEMS, JOINED CAREFULLY. Which connections belong to the caller is a
 * DATABASE question answered under RLS. What repositories a connection can see
 * is a PROVIDER question answered by GitHub, GitLab or Bitbucket. Neither is
 * allowed to answer the other's: filtering by team in the query would duplicate
 * the RLS policy, and trusting a repo list without checking the connection is
 * ours would let a caller name any id and read someone else's repositories.
 *
 * So: RLS decides which connections are in scope, and only those are ever
 * passed to a provider.
 *
 * A PROVIDER FAILURE IS NOT AN EMPTY REPO LIST. A connection whose token could
 * not be minted, or whose API call failed, is reported against that provider —
 * not omitted. Omitting it renders as "you have no repositories there", which
 * reads as the app being uninstalled and invites the user to reinstall it.
 * `listReposForTeam` enforces that: a provider it could not read comes back as
 * `repos: null`, never `[]`, and a PARTIALLY read provider is null too — half a
 * list rendered as the whole one is the same lie and harder to notice.
 */

import { createClient } from "@/lib/supabase/server";
import { listReposForTeam, type ConnectionRow } from "@/lib/paas/providers/adapter";
import { mergeListings } from "@/lib/paas/providers/types";
import { json, unauthenticated, apiError } from "../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RepoView {
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  provider: string;
  connectionId: string;
  /**
   * GitHub's installation id, or null on a provider that has no such thing.
   *
   * The picker has since moved to `connectionId` — /api/v2/git/branches takes a
   * provider, and project creation accepts either spelling. This stays because
   * the create API still writes the deprecated projects.installation_id column
   * while it exists, and because dropping a field from a response is a breaking
   * change for any caller that reads it.
   */
  installationId: number | null;
  account: string;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  // RLS scopes this to the caller's teams. No .eq() here on purpose.
  const { data: installs, error } = await supabase
    .schema("paas")
    .from("installations")
    .select(
      "provider,external_id,account_login,account_type,access_token_ct,token_dek_id,token_expires_at,provider_metadata,deleted_at",
    );

  if (error) {
    console.error("[v2/repos] connection read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read your git connections.", 500);
  }

  const live = (installs ?? []).filter((i) => !i.deleted_at);

  // Distinguished from "no repos". A caller with no connection has not
  // connected a provider yet, and the UI must offer to connect rather than show
  // an empty picker that looks broken.
  if (!live.length) {
    return json({ repos: [], installations: [], connected: false, errors: [] });
  }

  const connections = live as unknown as ConnectionRow[];
  const { repos: listed, failed, complete } = mergeListings(await listReposForTeam(connections));

  // A GitHub external_id IS its installation id; nothing else has one.
  const asInstallationId = (provider: string, externalId: string): number | null => {
    if (provider !== "github") return null;
    const n = Number(externalId);
    return Number.isSafeInteger(n) ? n : null;
  };

  const repos: RepoView[] = listed
    .map((r) => ({
      fullName: r.fullName,
      private: r.private,
      defaultBranch: r.defaultBranch,
      provider: r.provider,
      connectionId: r.connectionId,
      installationId: asInstallationId(r.provider, r.connectionId),
      account: r.account,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  // Failures arrive per PROVIDER; the picker names ACCOUNTS. Naming the
  // accounts that provider holds is the honest translation — "GitLab could not
  // be read" tells someone with two GitLab groups nothing about which to look
  // at, and inventing a single account would name the wrong one.
  const errors = failed.map((f) => ({
    provider: f.provider,
    account:
      live
        .filter((i) => i.provider === f.provider)
        .map((i) => i.account_login)
        .join(", ") || f.provider,
    message: f.error,
  }));

  return json({
    repos,
    installations: live.map((i) => ({
      provider: i.provider,
      connectionId: i.external_id,
      installationId: asInstallationId(i.provider, i.external_id),
      account: i.account_login,
      accountType: i.account_type ?? null,
    })),
    connected: true,
    // False when any provider could not be read. The picker shows what it has
    // AND says it is incomplete, rather than presenting a partial list as the
    // whole set of things you can deploy.
    complete,
    errors,
  });
}
