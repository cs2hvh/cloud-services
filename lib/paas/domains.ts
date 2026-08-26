/**
 * Custom domains — proving a customer controls the domain they are claiming.
 *
 * THE v1 DEFECT THIS IS WRITTEN AGAINST, because it is the whole design.
 *
 * v1's `resolveOwnershipMode` decided whether a hostname could be claimed by
 * asking the REGISTRAR whether the platform knew the domain — and it asked with
 * NO USER SCOPING. Every domain sitting in the shared Name.com account therefore
 * auto-verified for ANY authenticated user, DNS verification skipped entirely.
 * Activation then wrote a routing record into the victim's zone and wired the
 * attacker's app into ingress.
 *
 * The bug was not a missing check. It was asking the wrong question: "does the
 * platform know this domain?" instead of "can THIS CLAIMANT prove they control
 * it?". A platform-wide fact can never answer a per-tenant question, and any
 * amount of extra checking layered on top would still have been answering the
 * wrong thing.
 *
 * So verification here is a CHALLENGE-RESPONSE and nothing else:
 *
 *   1. A claim mints a token that exists nowhere else. It is unguessable and
 *      bound to one (team, domain) pair.
 *   2. The claimant publishes it as a TXT record under a name only someone with
 *      DNS control can write.
 *   3. We resolve that name and compare. Nothing about who we are, what we host,
 *      or what our registrar knows enters the decision.
 *
 * Possession of the token in DNS is the proof. There is no other path to
 * `active`, and no lookup anywhere in this file consults an account-wide fact.
 */

import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";

/** The label a claimant publishes under. Deliberately ours, so it cannot collide. */
export const VERIFY_PREFIX = "_ahura-challenge";

export interface DomainClaim {
  domain: string;
  /** Where the claimant must publish. */
  recordName: string;
  /** What they must publish there. */
  token: string;
}

/**
 * Mint a challenge for a domain.
 *
 * The token is 32 random bytes. It is not derived from the domain, the team, or
 * anything else knowable — a derived token is forgeable by whoever knows the
 * inputs, and the inputs here are a domain name and a team id, neither secret.
 */
export function mintClaim(domain: string): DomainClaim {
  const normalised = normaliseDomain(domain);
  if (!normalised) throw new Error(`[paas/domains] not a usable domain: ${JSON.stringify(domain)}`);
  return {
    domain: normalised,
    recordName: `${VERIFY_PREFIX}.${normalised}`,
    token: randomBytes(32).toString("base64url"),
  };
}

/**
 * Normalise to the form the database stores, or null if it is not a domain.
 *
 * Returns null rather than throwing, and rather than "cleaning up" input into
 * something that looks valid: a claim for `evil.com#.victim.com` must fail, not
 * quietly become a claim for something else.
 */
export function normaliseDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/\.$/, "");
  if (!d || d.length > 253) return null;
  // Reject a scheme, a path, a port, or credentials — all signs the caller
  // passed a URL where a hostname was expected.
  if (/[:/@?#\s]/.test(d)) return null;
  const labels = d.split(".");
  if (labels.length < 2) return null; // a bare label is not a domain we can verify
  for (const l of labels) {
    if (!l || l.length > 63) return null;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l)) return null;
  }
  return d;
}

export type VerifyOutcome =
  | { ok: true; found: string[] }
  /**
   * Deliberately three failure shapes, not one boolean. "The record is absent"
   * and "DNS did not answer" lead to different UI and different retry
   * behaviour, and collapsing them is how a resolver outage reads to a customer
   * as "you configured it wrong".
   */
  | { ok: false; reason: "not_found"; found: string[] }
  | { ok: false; reason: "mismatch"; found: string[] }
  | { ok: false; reason: "unresolvable"; error: string };

export interface Resolver {
  resolveTxt(name: string): Promise<string[][]>;
}

const systemResolver: Resolver = { resolveTxt: (n) => dns.resolveTxt(n) };

/**
 * Does the claimant's DNS carry the token?
 *
 * NXDOMAIN is `not_found` — an answer, and a normal one while a customer is
 * still setting up. Any other resolver failure is `unresolvable`, which is NOT
 * a verification failure: it is the absence of a verification result, and
 * treating the two alike would fail a correctly-configured domain during a
 * resolver blip and tell the customer they had made a mistake.
 */
export async function verifyClaim(
  claim: DomainClaim,
  resolver: Resolver = systemResolver,
): Promise<VerifyOutcome> {
  let records: string[][];
  try {
    records = await resolver.resolveTxt(claim.recordName);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { ok: false, reason: "not_found", found: [] };
    }
    return { ok: false, reason: "unresolvable", error: `${code || (err as Error).message}` };
  }

  // A TXT record arrives as an array of strings that must be joined: values over
  // 255 bytes are split into chunks by the protocol, and comparing the chunks
  // individually would fail a correct token purely because of its length.
  const found = records.map((chunks) => chunks.join(""));
  if (!found.length) return { ok: false, reason: "not_found", found };

  // Any ONE record matching is sufficient. A domain may legitimately carry
  // several TXT records at the same name, and requiring exclusivity would make
  // verification fail for reasons unrelated to control.
  return found.some((v) => timingSafeEqualStr(v.trim(), claim.token))
    ? { ok: true, found }
    : { ok: false, reason: "mismatch", found };
}

/**
 * Constant-time string compare.
 *
 * The token is a secret being checked against attacker-supplied DNS content, so
 * an early-exit comparison leaks its prefix a byte at a time to anyone who can
 * publish records and time the response. Cheap to avoid; awkward to retrofit
 * after someone notices.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Is this domain one a tenant may claim at all?
 *
 * Our own zone is refused: `<anything>.ahurasense.com` is served from the
 * platform wildcard, and letting a tenant "claim" a name inside it would route
 * platform hostnames through the custom-domain path — which is the same
 * takeover as v1's, arriving from the other direction.
 */
export function claimable(domain: string, appDomain: string): { ok: boolean; reason?: string } {
  const d = normaliseDomain(domain);
  if (!d) return { ok: false, reason: "not a valid domain name" };

  const platform = normaliseDomain(appDomain);
  if (platform && (d === platform || d.endsWith(`.${platform}`))) {
    return { ok: false, reason: `${platform} is the platform's own zone and cannot be claimed as a custom domain` };
  }

  // A public suffix cannot be claimed by anyone. This list is short and
  // deliberately incomplete — it catches the obvious mistake, and the real
  // control is the challenge, which nobody can pass for a TLD they do not own.
  if (d.split(".").length < 2) return { ok: false, reason: "a public suffix cannot be claimed" };

  return { ok: true };
}
