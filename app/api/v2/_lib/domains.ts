/**
 * Custom domain validation.
 *
 * Extracted from the route so it can actually be executed. Nothing under app/
 * has ever run in this repo — no typecheck, no lint, no request — so any
 * decision left inline in a handler is verified by reading alone. This module
 * has no imports and runs under `node --test`.
 *
 * The reserved-suffix check is a real security control, not tidiness: a tenant
 * claiming `ahurasense.com` or any subdomain of it would take over platform
 * hostnames, and paas.domains' partial unique index would happily record the
 * claim because it only enforces one holder per domain, not which domains may
 * be held.
 */

/**
 * Hostname shape. Each label 1–63 chars, alphanumeric with internal hyphens,
 * at least two labels, 253 total. Strict because the value becomes a routing
 * key — v1 accepted malformed hostnames and one of them collided across
 * tenants.
 */
export const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Hosts the platform serves itself. */
export const RESERVED_SUFFIXES = ["ahurasense.com", "apps.ahurasense.com"];

export type DomainRejection = "malformed" | "reserved";

export interface DomainCheck {
  ok: boolean;
  /** Normalised form to store. Only meaningful when ok. */
  domain: string;
  reason?: DomainRejection;
}

/**
 * Normalise and check a caller-supplied domain.
 *
 * Case folding happens BEFORE the reserved check. Without that,
 * `AHURASENSE.COM` would pass the suffix comparison and be stored lowercase,
 * i.e. the check would be bypassed by shouting.
 */
export function checkCustomDomain(input: unknown): DomainCheck {
  const domain = typeof input === "string" ? input.trim().toLowerCase() : "";

  if (!HOSTNAME_RE.test(domain)) {
    return { ok: false, domain, reason: "malformed" };
  }

  const reserved = RESERVED_SUFFIXES.some(
    (suffix) => domain === suffix || domain.endsWith(`.${suffix}`)
  );
  if (reserved) return { ok: false, domain, reason: "reserved" };

  return { ok: true, domain };
}
