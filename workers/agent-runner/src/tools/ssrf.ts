/**
 * SSRF guard for outbound function-webhook calls (§11 — egress boundary).
 *
 * Inline function tools POST to a customer-supplied `webhook_url`. Without a
 * guard, the model (or a malicious agent config) could aim that URL at internal
 * infrastructure — the cloud metadata endpoint (169.254.169.254), the k8s API,
 * localhost admin ports, or RFC-1918 hosts — and exfiltrate secrets or pivot.
 *
 * Defense (default-deny of internal targets):
 *   1. Only http/https, no embedded credentials.
 *   2. Resolve the hostname and reject if ANY resolved address is loopback,
 *      private, link-local (incl. the metadata IP), unique-local, or unspecified.
 *   3. The caller must additionally forbid redirects (redirect:"error"), so a
 *      302 to an internal host can't bypass the pre-flight check.
 *
 * Residual risk (documented): DNS rebinding — a hostname that resolves to a
 * public IP here but a private IP at fetch time. Fully closing that needs
 * pinning the validated IP into the connection (custom dispatcher); tracked as a
 * follow-up. Resolve-and-check + no-redirects blocks the common SSRF vectors.
 * Set AGENT_WEBHOOK_ALLOW_PRIVATE=true only for local dev against a local webhook.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`webhook URL blocked: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

/** Parse an IPv4 dotted-quad into its 32-bit value, or null if not IPv4. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let val = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    val = (val << 8) | n;
  }
  return val >>> 0;
}

/** True if the address is loopback/private/link-local/unspecified (v4 or v6). */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);

  if (family === 4) {
    const v = ipv4ToInt(ip);
    if (v === null) return true; // unparseable → treat as unsafe
    const inRange = (base: string, bits: number) => {
      const b = ipv4ToInt(base)!;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (v & mask) === (b & mask);
    };
    return (
      inRange("0.0.0.0", 8) ||       // "this" network / unspecified
      inRange("10.0.0.0", 8) ||      // private
      inRange("100.64.0.0", 10) ||   // CGNAT
      inRange("127.0.0.0", 8) ||     // loopback
      inRange("169.254.0.0", 16) ||  // link-local (incl. 169.254.169.254 metadata)
      inRange("172.16.0.0", 12) ||   // private
      inRange("192.168.0.0", 16) ||  // private
      inRange("192.0.0.0", 24) ||    // IETF protocol assignments
      inRange("192.0.2.0", 24) ||    // TEST-NET
      inRange("224.0.0.0", 4) ||     // multicast
      inRange("240.0.0.0", 4)        // reserved
    );
  }

  if (family === 6) {
    const norm = ip.toLowerCase().replace(/^\[|\]$/g, "");
    // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded v4.
    const mapped = norm.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      norm === "::" ||                // unspecified
      norm === "::1" ||               // loopback
      norm.startsWith("fc") ||        // fc00::/7 unique-local
      norm.startsWith("fd") ||
      norm.startsWith("fe8") ||       // fe80::/10 link-local
      norm.startsWith("fe9") ||
      norm.startsWith("fea") ||
      norm.startsWith("feb")
    );
  }

  // Not a recognizable IP literal.
  return true;
}

/**
 * Validate a webhook URL is safe to call. Throws SsrfBlockedError if not.
 * Resolves DNS and rejects when the target resolves to an internal address.
 */
export async function assertSafeWebhookUrl(
  rawUrl: string,
  opts: { allowPrivate?: boolean } = {}
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("malformed URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`unsupported protocol "${url.protocol}"`);
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("embedded credentials are not allowed");
  }

  if (opts.allowPrivate) return; // explicit dev override

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // Literal IP → check directly (no DNS).
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new SsrfBlockedError(`internal address ${host}`);
    return;
  }

  // Hostname → resolve ALL addresses and reject if any is internal.
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError(`DNS resolution failed for ${host}`);
  }
  if (addrs.length === 0) throw new SsrfBlockedError(`no addresses for ${host}`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new SsrfBlockedError(`${host} resolves to internal address ${a.address}`);
    }
  }
}
