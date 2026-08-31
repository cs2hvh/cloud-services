/**
 * GET /api/v2/git/installations
 *
 * Every git connection this caller may act through — never the App's full
 * installation list. See ../_lib/scope.ts for why that distinction is
 * load-bearing.
 *
 * GitHub is asked OF GitHub: its installations are listed from the API, so an
 * account uninstalled upstream is reported as stale rather than shown as
 * working. GitLab and Bitbucket have no such API to reconcile against — the
 * connection IS the row — so those come straight from the table.
 */

import { listInstallations } from "@/lib/paas/github/app.ts";
import { getCaller } from "../../_lib/auth";
import { json, unauthenticated, apiError } from "../../_lib/http";
import { callerInstallations, callerConnections } from "../_lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const linked = await callerInstallations(caller);
  const allowed = linked.map((i) => i.installationId);

  // The OAuth providers. Read once here so BOTH the empty case and the full
  // one report them — a team with only a GitLab connection is connected, and
  // the GitHub-shaped empty response would tell it otherwise.
  const others = (await callerConnections(caller))
    .filter((c) => c.provider !== "github")
    .map((c) => ({
      id: c.externalId,
      provider: c.provider,
      account: c.accountLogin,
      accountType: c.accountType,
      hasCredential: c.hasCredential,
    }));

  if (allowed.length === 0 && others.length === 0) {
    // Not an error: a team that has never connected a repo. Since 2c2b8d83
    // this is recoverable — /api/v2/git/connect starts an install and the
    // callback records the link — so the client can offer the action rather
    // than reporting a dead end.
    return json({
      installations: [],
      canConnectNew: true,
      connectUrl: "/api/v2/git/connect",
      note: "No git account is connected to your team yet.",
    });
  }

  // Connections exist, but none of them is GitHub. Asking GitHub anyway would
  // fail the whole request during a GitHub outage for a team that does not use
  // GitHub at all.
  if (allowed.length === 0) {
    return json({
      installations: others,
      canConnectNew: true,
      connectUrl: "/api/v2/git/connect",
    });
  }

  let accounts: Awaited<ReturnType<typeof listInstallations>>;
  try {
    accounts = await listInstallations();
  } catch (err) {
    console.error("[v2/git/installations] GitHub App request failed:", err);
    return apiError(
      "upstream_error",
      "Could not reach GitHub. Try again shortly.",
      502
    );
  }

  // Filter to what this caller may use. The App-wide list never leaves here.
  const mine = accounts
    .filter((inst) => allowed.includes(inst.id))
    .map((inst) => ({
      // A string, like every other provider's id. Bitbucket's is a braced
      // UUID, so the shared shape cannot be a number.
      id: String(inst.id),
      // Named rather than implied: every entry in this list now has to say
      // which provider it belongs to, because two of them are not GitHub.
      provider: "github" as const,
      account: inst.account?.login ?? null,
      accountType: inst.account?.type ?? null,
      repositorySelection: inst.repository_selection,
    }));

  // An id on one of the caller's projects that GitHub no longer reports means
  // the installation was uninstalled upstream. Surfaced rather than hidden:
  // those projects can no longer build, and the user needs to know why.
  const stale = allowed.filter((id) => !accounts.some((inst) => inst.id === id));

  return json({
    installations: [...mine, ...others],
    canConnectNew: true,
    connectUrl: "/api/v2/git/connect",
    ...(stale.length > 0
      ? {
          staleInstallationIds: stale,
          warning:
            "Some connected repositories reference a GitHub App installation " +
            "that no longer exists. Those projects cannot build until the App " +
            "is reinstalled.",
        }
      : {}),
  });
}
