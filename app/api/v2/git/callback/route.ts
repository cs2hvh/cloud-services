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
import { provesInstallationOwnership } from "@/lib/paas/github/ownership";
import { createClient } from "@/lib/supabase/server";

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
    // Left blank, which now REFUSES below rather than recording. It used to be
    // treated as non-fatal on the reasoning that a blank login is cosmetic and
    // a missing link is not — true while the login was only shown in the UI,
    // and false now that it is what proves the installation is yours.
    console.error("[v2/git/callback] could not read installation account:", err);
  }

  // OWNERSHIP, and the nonce above does NOT establish it.
  //
  // The nonce proves this browser started a flow with us. It says nothing
  // about WHICH installation came back, and an attacker can start a flow
  // legitimately — so a valid state plus a victim's unclaimed installation id
  // bound their GitHub account to the attacker's team. Same hole as
  // ../github/callback, protected by a lock the attacker holds a key to.
  //
  // ORG INSTALLS ARE REFUSED HERE, and that is a known gap rather than a
  // silent one. Proving somebody administers an org needs their own OAuth
  // token, which this platform deliberately does not store for GitHub. Until
  // it does, an org connection cannot be established by any route, and saying
  // so beats binding one nobody verified.
  // getCaller() returns only an id and a scoped db handle, so the identity
  // comes from the auth client directly. It is what GitHub asserted at
  // sign-in: absent from the request, and not forgeable by editing a URL.
  //
  // Read from identities rather than user_metadata ON PURPOSE. Metadata is
  // last-writer-wins across providers, so a user who signed in with GitLab
  // most recently carries their GITLAB username there — and someone whose
  // GitLab name matched a GitHub account could claim that account's
  // installation. identities keeps one row per provider and cannot confuse
  // the two.
  const authed = await createClient();
  const { data: authUser } = await authed.auth.getUser();
  const githubLogin = (authUser?.user?.identities ?? [])
    .filter((i) => i.provider === "github")
    .map((i) => (i.identity_data as { user_name?: string } | undefined)?.user_name)
    .find((n): n is string => typeof n === "string" && n.length > 0);

  const ownership = provesInstallationOwnership(githubLogin, accountLogin);
  if (!ownership.proven) {
    console.warn(
      "[v2/git/callback] refused: caller github=" +
        (githubLogin ?? "(none)") +
        ", installation " +
        installationId +
        " is on " +
        (accountLogin || "(unknown)"),
    );
    return back("error", "ownership_unproven");
  }

  // The RPC is SECURITY DEFINER and enforces admin-on-team itself. It also
  // refuses an installation already held by another team, which is what stops
  // two teams both authorizing tokens for each other's repositories.
  // Provider and external id, not an installation id. The bigint overload was
  // dropped rather than left callable: a Bitbucket workspace uuid has no bigint
  // to live in, and an overload that silently accepts only GitHub is worse than
  // one that is gone — it type-checks and fails on the provider nobody tested.
  //
  // NO CREDENTIAL IS SENT, and that asymmetry is deliberate: GitHub App tokens
  // are minted per request from a private key, so there is nothing durable to
  // store. The RPC coalesces absent token arguments onto the stored ones, so
  // this call cannot un-credential a connection either.
  const { error } = await caller.db.rpc("link_installation", {
    p_provider: "github",
    p_external_id: String(installationId),
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
