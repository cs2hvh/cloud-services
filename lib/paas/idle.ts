/**
 * Idle measurement and sleeping.
 *
 * Warm fraction is measured at 1.0 — every app holds a pod all day at 2–3
 * millicores. At 10k apps that is the always-on cost model, roughly $52k a
 * month against a $5 price, instead of the ~$18–20k the plan assumes. Sleeping
 * idle apps is the single change that separates those two numbers.
 *
 * MEASURED, NOT TIMED
 *
 * Traefik exports a request counter per router, and a router is per hostname.
 * That is the granularity the decision is actually made at, and it is the
 * difference between "no requests since we last looked" and "we did not look".
 *
 * A timer that does not know whether anyone is using an app is how a platform
 * takes down a live one. So idleness here is only ever concluded from two
 * readings of a counter that did not move — never from elapsed time alone, and
 * never from a single reading.
 *
 * NEVER SLEEP ON A MISSING READING. If the counter cannot be read, the app is
 * NOT idle as far as this module is concerned. An unreadable gateway means we
 * are blind, and sleeping a live app because we could not see its traffic is
 * exactly the failure that makes an availability feature into an outage.
 */

/** One router's request count at a moment in time. */
export interface RouterCount {
  hostname: string;
  requests: number;
}

/**
 * Parse `traefik_router_requests_total` out of a Prometheus exposition.
 *
 * Router names look like:
 *   websecure-app-prj-13cc6161e14a-als-95a640354458-v2-flask-ahurasense-com@kubernetes
 *
 * The hostname is embedded with dots replaced by dashes, so it is recovered
 * from the Ingress rule rather than by guessing where the host starts — see
 * `hostnamesFromRouters`. Counts are summed across status codes and methods,
 * because ANY request means the app is in use: a 404 or a 500 is still someone
 * out there depending on it being up.
 */
export function parseRouterCounts(exposition: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of exposition.split("\n")) {
    if (!line.startsWith("traefik_router_requests_total")) continue;
    const router = /router="([^"]+)"/.exec(line)?.[1];
    if (!router) continue;
    const value = Number.parseFloat(line.slice(line.lastIndexOf(" ") + 1));
    if (!Number.isFinite(value)) continue;
    out.set(router, (out.get(router) ?? 0) + value);
  }
  return out;
}

/**
 * Match a hostname to its router by the dashed form Traefik builds.
 *
 * Returns null when no router matches, which is NOT zero: a hostname with no
 * router has never been routed, and treating "no router" as "no traffic" would
 * put an app to sleep on the strength of a gateway that has not seen it yet.
 */
export function requestsForHostname(counts: Map<string, number>, hostname: string): number | null {
  const dashed = hostname.replace(/\./g, "-");
  for (const [router, n] of counts) {
    if (router.includes(dashed)) return n;
  }
  return null;
}

export interface IdleSample {
  hostname: string;
  requests: number;
  at: number;
}

export type IdleVerdict =
  | { idle: true; forMs: number }
  | { idle: false; reason: "traffic" | "no-reading" | "no-baseline" | "too-recent" | "counter-reset" };

/**
 * Decide whether a hostname has been idle long enough to sleep.
 *
 * Requires TWO readings. A single reading cannot distinguish an app with no
 * traffic from an app whose counter we are seeing for the first time — and the
 * second of those is every app immediately after a gateway restart, which is
 * precisely when sleeping everything would be most damaging.
 */
export function verdict(
  previous: IdleSample | undefined,
  current: { requests: number | null; at: number },
  idleMs: number,
): IdleVerdict {
  if (current.requests === null) return { idle: false, reason: "no-reading" };
  if (!previous) return { idle: false, reason: "no-baseline" };
  if (current.requests > previous.requests) return { idle: false, reason: "traffic" };

  // A counter that went BACKWARDS means Traefik restarted and zeroed it. The
  // naive reading is "no increase, therefore idle" — but the window we would be
  // calling idle spans a gateway restart, and we have no idea what traffic
  // arrived before it. Re-baseline instead: the next pair of readings is
  // evidence, this one is not.
  if (current.requests < previous.requests) return { idle: false, reason: "counter-reset" };

  const forMs = current.at - previous.at;
  if (forMs < idleMs) return { idle: false, reason: "too-recent" };
  return { idle: true, forMs };
}

/** Platform default. Overridden per project by projects.idle_seconds. */
export const DEFAULT_IDLE_SECONDS = 900;
