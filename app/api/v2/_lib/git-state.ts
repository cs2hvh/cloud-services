/**
 * The CSRF state cookie shared by the GitHub App install round trip.
 *
 * WHY IT LIVES HERE AND NOT IN A ROUTE.
 *
 * It was `export const STATE_COOKIE` in git/connect/route.ts, imported by
 * git/callback/route.ts. That compiles, `tsc --noEmit` reports it clean, and
 * `next build` refuses it:
 *
 *   Type error: Property 'STATE_COOKIE' is incompatible with index signature.
 *     Type '"v2_gh_install_state"' is not assignable to type 'never'.
 *
 * A route module may export ONLY the HTTP method handlers and a fixed set of
 * config values (dynamic, revalidate, runtime, maxDuration, and a few more).
 * Next generates a validator in .next/types that maps every other export to
 * `never`. The rule is invisible to the type checker because it is enforced
 * by generated code that only exists after a build.
 *
 * So this is the second tool in this project that reported success on code
 * that could not ship — after `node --experimental-strip-types --check`
 * exiting 0 on a file with nine syntax errors. tsc --noEmit is necessary and
 * is not sufficient; only `next build` proves a route is legal.
 *
 * The move fixes a second thing worth naming on its own: one route was
 * importing from another route. Routes are endpoints, not modules — importing
 * one pulls its handlers into another's module graph for a constant.
 */

/** Name of the short-lived cookie holding the install nonce. */
export const STATE_COOKIE = "v2_gh_install_state";

/** Long enough to finish an install, short enough that a leaked state dies. */
export const STATE_TTL_SECONDS = 15 * 60;
