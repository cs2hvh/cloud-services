/**
 * Is a customer's domain actually pointed at us — including when it is behind
 * Cloudflare's proxy?
 *
 * THE CASE THAT BREAKS THE NAIVE CHECK. The obvious routing test is "resolve the
 * hostname and see whether it points at our gateway". It is wrong for a large
 * fraction of real customers, and wrong in the direction that blames them.
 *
 * If the customer's domain is on Cloudflare with the orange cloud on — which is
 * the DEFAULT when you add a record in their dashboard — then `app.customer.com`
 * resolves to Cloudflare's anycast addresses, not to ours. Their DNS is correct.
 * Their traffic reaches us. And an IP comparison says "not pointed at us", so we
 * tell a customer who did everything right to go and fix it.
 *
 * The same applies to any proxy in front: a CDN, another PaaS, a corporate
 * reverse proxy. Cloudflare is simply the one most customers will hit.
 *
 * So routing is established by TWO tests, in order of strength:
 *
 *   1. DNS points at us directly — CNAME to our target, or A to our gateway.
 *      Unambiguous, and free.
 *
 *   2. A REQUEST FOR THAT HOSTNAME REACHES US. We serve a challenge token at a
 *      well-known path for every alias we hold. If fetching
 *      `https://<domain>/.well-known/ahura-challenge` returns the token, then
 *      traffic for that hostname arrives here regardless of how many proxies sit
 *      in between and regardless of what DNS looks like from where we stand.
 *
 * The second test is strictly stronger than the first: it proves the thing we
 * actually care about — that requests arrive — rather than a fact we hope
 * implies it. It is second only because it costs an HTTP round trip and cannot
 * run until an Ingress exists to answer it.
 */

import { resolve, addressValues, cnameValues, DnsUnavailable } from "./dns-resolver.ts";

export const CHALLENGE_PATH = "/.well-known/ahura-challenge";

/**
 * Cloudflare's published ranges, fetched from their API and cached.
 *
 * Fetched rather than hardcoded because the list changes; cached because a
 * verification that fails when Cloudflare's own API has a bad minute is a
 * verification nobody can rely on.
 */
let cfRanges: { v4: string[]; fetchedAt: number } | null = null;
const CF_TTL_MS = 6 * 60 * 60 * 1000;

/** Last-resort list. Deliberately not the whole set: this exists only so that a
 *  fetch failure degrades to "probably proxied" rather than to a wrong answer. */
const CF_FALLBACK_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];

export async function cloudflareRangesV4(): Promise<string[]> {
  if (cfRanges && Date.now() - cfRanges.fetchedAt < CF_TTL_MS) return cfRanges.v4;
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/ips", { signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as { success?: boolean; result?: { ipv4_cidrs?: string[] } };
    const v4 = body.success ? body.result?.ipv4_cidrs ?? [] : [];
    if (v4.length) {
      cfRanges = { v4, fetchedAt: Date.now() };
      return v4;
    }
  } catch {
    /* fall through */
  }
  return CF_FALLBACK_V4;
}

export function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (s: string) => {
    const parts = s.split(".");
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
      const v = Number(p);
      if (!Number.isInteger(v) || v < 0 || v > 255) return null;
      n = (n << 8) | v;
    }
    return n >>> 0;
  };
  const a = toInt(ip);
  const b = toInt(net);
  if (a === null || b === null) return false;
  // A /0 shift by 32 is undefined in JS and would produce a mask of ~0 rather
  // than 0 — a bug that makes every address match every range.
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

export type RoutingVerdict =
  | { routed: true; via: "dns_direct" | "proxy_reaches_us"; detail: string }
  | { routed: false; reason: "not_pointed_at_us"; detail: string; proxied: boolean }
  | { routed: false; reason: "unverifiable"; detail: string };

export interface RoutingProbe {
  /** Fetch the challenge path for a hostname; returns the body, or null. */
  fetchChallenge(hostname: string): Promise<string | null>;
}

const httpProbe: RoutingProbe = {
  async fetchChallenge(hostname) {
    try {
      const res = await fetch(`https://${hostname}${CHALLENGE_PATH}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "ahuracloud-domain-verify" },
      });
      if (!res.ok) return null;
      return (await res.text()).trim();
    } catch {
      return null;
    }
  },
};

/**
 * Establish whether traffic for `domain` reaches us.
 *
 * `expectedToken` is the value we serve at the challenge path for this alias.
 * `gatewayIps` and `cnameTarget` describe where we told the customer to point.
 */
export interface RoutingLookup {
  addresses(domain: string): Promise<string[]>;
  cnames(domain: string): Promise<string[]>;
}

const dohLookup: RoutingLookup = {
  addresses: async (d) => addressValues(await resolve(d, "A")),
  cnames: async (d) => cnameValues(await resolve(d, "CNAME")),
};

export async function verifyRouting(
  domain: string,
  opts: {
    expectedToken: string;
    gatewayIps?: string[];
    cnameTarget?: string;
    probe?: RoutingProbe;
    /**
     * Injectable so the DNS-direct path is testable without owning a domain.
     * Without this the only reachable branch in a test is the HTTP probe, and a
     * branch no test can reach is a branch no test is checking.
     */
    lookup?: RoutingLookup;
  },
): Promise<RoutingVerdict> {
  const probe = opts.probe ?? httpProbe;
  const lookup = opts.lookup ?? dohLookup;

  // ── 1. does DNS point at us directly? ─────────────────────────────────────
  let addresses: string[] = [];
  let cnames: string[] = [];
  let dnsFailed = false;

  try {
    const [a, c] = await Promise.all([lookup.addresses(domain), lookup.cnames(domain)]);
    addresses = a;
    cnames = c;
  } catch (err) {
    // No answer is not a negative answer. Fall through to the HTTP probe: if
    // requests reach us, routing works whatever our view of DNS says.
    dnsFailed = err instanceof DnsUnavailable;
  }

  if (opts.cnameTarget && cnames.some((c) => c.toLowerCase() === opts.cnameTarget!.toLowerCase())) {
    return { routed: true, via: "dns_direct", detail: `CNAME -> ${opts.cnameTarget}` };
  }
  if (opts.gatewayIps?.length && addresses.some((a) => opts.gatewayIps!.includes(a))) {
    return { routed: true, via: "dns_direct", detail: `A -> ${addresses.join(", ")}` };
  }

  // ── 2. is it proxied? ─────────────────────────────────────────────────────
  const cfV4 = await cloudflareRangesV4();
  const proxied = addresses.some((ip) => cfV4.some((cidr) => ipv4InCidr(ip, cidr)));

  // ── 3. do requests actually reach us? ─────────────────────────────────────
  // Runs whether or not it looked proxied, because "some proxy we do not
  // recognise" is indistinguishable from "misconfigured" by DNS alone — and the
  // request either arrives or it does not.
  const body = await probe.fetchChallenge(domain);
  if (body !== null && body === opts.expectedToken) {
    return {
      routed: true,
      via: "proxy_reaches_us",
      detail: proxied
        ? "behind Cloudflare's proxy; requests for this hostname reach us"
        : "behind a proxy; requests for this hostname reach us",
    };
  }

  if (dnsFailed && body === null) {
    return { routed: false, reason: "unverifiable", detail: "no resolver answered and the challenge did not respond" };
  }

  return {
    routed: false,
    reason: "not_pointed_at_us",
    proxied,
    detail: proxied
      ? `resolves to Cloudflare (${addresses.slice(0, 2).join(", ")}) but the challenge did not return our token — ` +
        `check that the proxied record points at our origin, and that SSL mode is Full or Full (strict)`
      : addresses.length || cnames.length
        ? `points at ${[...cnames, ...addresses].slice(0, 3).join(", ")}, which is not us`
        : "no A or CNAME record found",
  };
}
