/**
 * GET /api/v2/repos
 *
 * Repositories the caller can deploy — the source list behind "New project".
 *
 * TWO SYSTEMS, JOINED CAREFULLY. Which installations belong to the caller is a
 * DATABASE question answered under RLS. What repositories an installation can
 * see is a GITHUB question answered by GitHub. Neither is allowed to answer the
 * other's: filtering by team in the query would duplicate the RLS policy, and
 * trusting a repo list without checking the installation is ours would let a
 * caller name any installation id and read someone else's repositories.
 *
 * So: RLS decides which installation ids are in scope, and only those are ever
 * passed to GitHub.
 *
 * A GITHUB FAILURE IS NOT AN EMPTY REPO LIST. An installation whose token could
 * not be minted, or whose API call failed, is reported as an error against that
 * installation — not omitted. Omitting it renders as "you have no repos there",
 * which reads as the app being uninstalled and invites the user to reinstall it.
 */

import { createClient } from "@/lib/supabase/server";
import { listInstallationRepos } from "@/lib/paas/github/client";
import { json, unauthenticated, apiError } from "../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RepoView {
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  installationId: number;
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
    .select("installation_id,account_login,account_type,deleted_at");

  if (error) {
    console.error("[v2/repos] installation read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read your GitHub connections.", 500);
  }

  const live = (installs ?? []).filter((i) => !i.deleted_at);

  // Distinguished from "no repos". A caller with no installation has not
  // connected GitHub yet, and the UI must offer to connect rather than show an
  // empty picker that looks broken.
  if (!live.length) {
    return json({ repos: [], installations: [], connected: false, errors: [] });
  }

  const repos: RepoView[] = [];
  const errors: Array<{ installationId: number; account: string; message: string }> = [];

  for (const inst of live) {
    try {
      const list = await listInstallationRepos(Number(inst.installation_id));
      for (const r of list) {
        repos.push({
          fullName: r.full_name,
          private: Boolean(r.private),
          defaultBranch: r.default_branch ?? null,
          installationId: Number(inst.installation_id),
          account: inst.account_login,
        });
      }
    } catch (e) {
      // Reported, never silently dropped — see the header.
      errors.push({
        installationId: Number(inst.installation_id),
        account: inst.account_login,
        message: (e as Error).message.slice(0, 200),
      });
    }
  }

  repos.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return json({
    repos,
    installations: live.map((i) => ({
      installationId: Number(i.installation_id),
      account: i.account_login,
      accountType: i.account_type ?? null,
    })),
    connected: true,
    errors,
  });
}
