/**
 * GET /api/v2/git/connect?team=<teamRef>
 *
 * Starts a GitHub App installation. Redirects the caller to GitHub's install
 * page carrying a `state` we mint, and sets a matching one-time cookie.
 *
 * The cookie is the CSRF defence. Without it an attacker could send a victim
 * to a callback URL naming the attacker's installation and the victim's team,
 * binding an installation the attacker controls to a team they do not — after
 * which every repo listing that team performs runs through the attacker's
 * token. paas.link_installation() independently requires admin on the target
 * team, so this is the outer of two locks, not the only one.
 */

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

import { getAppMetadata } from "@/lib/paas/github/app.ts";
import { getCaller, resolveTeamId } from "../../_lib/auth";
import { unauthenticated, notFound, invalid, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";

export const STATE_COOKIE = "v2_gh_install_state";
/** Long enough to finish an install, short enough that a leaked state dies. */
const STATE_TTL_SECONDS = 15 * 60;

export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();

  const teamRef = new URL(request.url).searchParams.get("team")?.trim();
  if (!teamRef) {
    return invalid("A `team` ref is required.", { team: "required" });
  }

  // Resolve through RLS first. A team the caller cannot see is a 404, and we
  // stop before telling GitHub anything about it.
  const teamId = await resolveTeamId(caller, teamRef);
  if (!teamId) return notFound("Team");

  let slug: string;
  try {
    slug = (await getAppMetadata()).slug;
  } catch (err) {
    console.error("[v2/git/connect] could not read App metadata:", err);
    return apiError(
      "upstream_error",
      "Could not reach GitHub to start the installation.",
      502
    );
  }

  const nonce = randomBytes(24).toString("base64url");
  // The team travels in state so the callback knows which team to bind to; the
  // nonce is what proves the round trip started here.
  const state = `${nonce}.${teamRef}`;

  const jar = await cookies();
  jar.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // must survive GitHub's cross-site redirect back
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const target = new URL(`https://github.com/apps/${slug}/installations/new`);
  target.searchParams.set("state", state);

  return Response.redirect(target.toString(), 302);
}
