/**
 * GET /api/v2/git/callback?installation_id=&setup_action=&state=
 *
 * Where GitHub returns after an App installation. Binds the installation to a
 * team by calling paas.link_installation().
 *
 * This is the only moment both facts are known at once — which installation
 * GitHub just created, and who is installing it — which is exactly why
 * paas.installations exists and why the old projects-derived scope could never
 * support a first-time connect.
 *
 * Two independent locks, neither sufficient alone:
 *  1. the one-time nonce cookie set by ../connect, proving the round trip
 *     started here rather than at a URL someone was sent;
 *  2. paas.link_installation(), which requires ADMIN on the target team and
 *     refuses an installation already held by another team.
 *
 * The nonce is consumed whatever the outcome. A state that can be replayed is
 * not a defence.
 */

import { cookies } from "next/headers";

import { listInstallations } from "@/lib/paas/github/app.ts";
import { getCaller } from "../../_lib/auth";
import { STATE_COOKIE } from "../../_lib/git-state";

export const dynamic = "force-dynamic";

/**
 * Where the user lands afterwards, with a readable outcome in the query.
 *
 * Built by hand rather than with Response.redirect(), which requires an
 * absolute URL — and the only absolute URL available here would be derived
 * from the request, i.e. from an attacker-controllable Host header. A relative
 * Location cannot be pointed off-site.
 */
function back(status: string, detail?: string): Response {
  const query = new URLSearchParams({ connect: status });
  if (detail) query.set("detail", detail);
  return new Response(null, {
    status: 303,
    headers: { Location: `/dashboard/v2?${query.toString()}` },
  });
}

export async function GET(request: Request) {
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? null;
  // Consume it immediately, on every path.
  jar.delete(STATE_COOKIE);

  const params = new URL(request.url).searchParams;
  const installationRaw = params.get("installation_id");
  const state = params.get("state");
  const setupAction = params.get("setup_action");

  const caller = await getCaller();
  if (!caller) return back("error", "sign_in_required");

  if (!expected || !state) return back("error", "state_missing");

  const dot = state.indexOf(".");
  if (dot <= 0) return back("error", "state_malformed");
  const nonce = state.slice(0, dot);
  const teamRef = state.slice(dot + 1);

  // Constant-time-ish compare is overkill for a random 24-byte nonce, but a
  // length check first avoids leaking via early exit on the common case.
  if (nonce.length !== expected.length || nonce !== expected) {
    return back("error", "state_mismatch");
  }

  const installationId = Number(installationRaw);
  if (!Number.isInteger(installationId) || installationId <= 0) {
    // GitHub sends setup_action=request when an org admin must approve the
    // install. Nothing to link yet, and it is not a failure.
    if (setupAction === "request") return back("pending", "awaiting_approval");
    return back("error", "installation_id_missing");
  }

  // GitHub does not send the account in the callback, and link_installation
  // needs it. Ask the App which account this installation belongs to rather
  // than storing a blank — the account login is what the UI shows the user to
  // confirm they connected the right org.
  let accountLogin = "";
  let accountType: string | null = null;
  try {
    const installation = (await listInstallations()).find(
      (i) => i.id === installationId
    );
    accountLogin = installation?.account?.login ?? "";
    accountType = installation?.account?.type ?? null;
  } catch (err) {
    // Non-fatal: the link is still worth recording. A missing login shows as
    // blank in the UI, which is recoverable; a missing link is not.
    console.error("[v2/git/callback] could not read installation account:", err);
  }

  // The RPC is SECURITY DEFINER and enforces admin-on-team itself. It also
  // refuses an installation already held by another team, which is what stops
  // two teams both authorizing tokens for each other's repositories.
  const { error } = await caller.db.rpc("link_installation", {
    p_installation_id: installationId,
    p_team_ref: teamRef,
    p_account_login: accountLogin,
    p_account_type: accountType,
  });

  if (error) {
    // Do not echo the database message — it distinguishes "not admin" from
    // "no such team", which tells a prober which teams exist.
    console.error("[v2/git/callback] link_installation failed:", error);
    return back("error", "link_refused");
  }

  return back("connected");
}
