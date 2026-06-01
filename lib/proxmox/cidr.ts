// IPv4 CIDR utilities shared by the BYOIP seeding flow and any other
// code that needs to validate / expand / classify v4 addresses.
//
// Intentionally minimal — no IPv6 support, no class checks. The
// platform's BYOIP / failover-IP use cases are all v4.

export class CidrError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CidrError";
    }
}

/** Strict CIDR string regex (a.b.c.d/n, n in [0,32]). */
const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIPv4(ip: string): boolean {
    const m = IPV4_RE.exec(ip);
    if (!m) return false;
    return m.slice(1).every((p) => {
        const n = Number(p);
        return n >= 0 && n <= 255;
    });
}

export function isValidCidr(cidr: string): boolean {
    const m = CIDR_RE.exec(cidr);
    if (!m) return false;
    const octets = [m[1], m[2], m[3], m[4]].map(Number);
    if (octets.some((o) => o < 0 || o > 255)) return false;
    const prefix = Number(m[5]);
    return prefix >= 0 && prefix <= 32;
}

/** RFC1918 + loopback + link-local — the "don't expose this publicly" set. */
export function isPrivateIPv4(ip: string): boolean {
    const m = IPV4_RE.exec(ip);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

/**
 * Expand a CIDR into all addresses it covers.
 *
 *   expandCidr("192.168.0.0/30")
 *   → ["192.168.0.0", "192.168.0.1", "192.168.0.2", "192.168.0.3"]
 *
 * Throws CidrError on malformed input or prefixes that would produce
 * more than 65 536 addresses (a soft cap so a typo can't blow the
 * heap or hammer the DB).
 */
export function expandCidr(cidr: string): string[] {
    const m = CIDR_RE.exec(cidr);
    if (!m) throw new CidrError(`Invalid CIDR: ${cidr}`);
    const octets = [m[1], m[2], m[3], m[4]].map(Number);
    if (octets.some((o) => o < 0 || o > 255)) {
        throw new CidrError(`Invalid CIDR octets: ${cidr}`);
    }
    const prefix = Number(m[5]);
    if (prefix < 16 || prefix > 32) {
        throw new CidrError(`Prefix /${prefix} out of supported range (/16–/32)`);
    }
    const base =
        ((octets[0] & 0xff) << 24) |
        ((octets[1] & 0xff) << 16) |
        ((octets[2] & 0xff) << 8) |
        (octets[3] & 0xff);
    const hostBits = 32 - prefix;
    const networkBase = (base >>> hostBits) << hostBits;
    const size = 1 << hostBits;
    if (size > 65536) {
        throw new CidrError(
            `CIDR /${prefix} would expand to ${size} addresses (max 65536 per call)`
        );
    }
    const ips: string[] = new Array(size);
    for (let i = 0; i < size; i++) {
        const v = (networkBase + i) >>> 0;
        ips[i] =
            `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
    }
    return ips;
}

/**
 * Trim the network + broadcast addresses (and optionally further
 * margin) off both ends of an expanded CIDR.
 */
export function usableAddresses(
    cidr: string,
    opts: { skipFirst?: number; skipLast?: number } = {}
): string[] {
    const skipFirst = opts.skipFirst ?? 1; // .0
    const skipLast = opts.skipLast ?? 1;   // broadcast
    const all = expandCidr(cidr);
    if (skipFirst + skipLast >= all.length) return [];
    return all.slice(skipFirst, all.length - skipLast);
}
