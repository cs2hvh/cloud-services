/**
 * GET /api/v2/git/installations
 *
 * The GitHub App installations this caller may act through — never the App's
 * full installation list. See ../_lib/scope.ts for why that distinction is
 * load-bearing.
 */

import { listInstallations } from "@/lib/paas/github/app.ts";
import { getCaller } from "../../_lib/auth";
import { json, unauthenticated, apiError } from "../../_lib/http";
import { callerInstallations } from "../_lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const linked = await callerInstallations(caller);
  const allowed = linked.map((i) => i.installationId);

  if (allowed.length === 0) {
    // Not an error: a team that has never connected a repo. Since 2c2b8d83
    // this is recoverable — /api/v2/git/connect starts an install and the
    // callback records the link — so the client can offer the action rather
    // than reporting a dead end.
    return json({
      installations: [],
      canConnectNew: true,
      connectUrl: "/api/v2/git/connect",
      note: "No GitHub App installation is linked to your team yet.",
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
      id: inst.id,
      account: inst.account?.login ?? null,
      accountType: inst.account?.type ?? null,
      repositorySelection: inst.repository_selection,
    }));

  // An id on one of the caller's projects that GitHub no longer reports means
  // the installation was uninstalled upstream. Surfaced rather than hidden:
  // those projects can no longer build, and the user needs to know why.
  const stale = allowed.filter((id) => !accounts.some((inst) => inst.id === id));

  return json({
    installations: mine,
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
