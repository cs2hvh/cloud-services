/**
 * DNS over HTTPS.
 *
 * WHY NOT node:dns. `dns.resolveTxt` sends queries directly to whatever is in
 * the system resolver configuration, and when that is wrong it does not degrade
 * — it fails completely. On this machine `dns.getServers()` returns
 * `['127.0.0.1']` with nothing listening, so every lookup returns ECONNREFUSED
 * while `fetch` to the same domains works fine, because `fetch` goes through
 * getaddrinfo instead.
 *
 * That is not a local curiosity. Domain verification is a customer-facing
 * decision — "you have not added the record yet" — and basing it on a resolver
 * path that can be silently misconfigured means telling customers they got it
 * wrong when we did. DoH is plain HTTPS: it works wherever the platform can
 * already reach the internet, which is a precondition for the platform running
 * at all.
 *
 * It also removes a class of answer we must never accept: a resolver that
 * returns a WRONG answer rather than no answer. DoH to a known resolver over
 * TLS at least authenticates who answered.
 */

export interface DnsAnswer {
  /** RR type: 16 = TXT, 1 = A, 5 = CNAME, 28 = AAAA. */
  type: number;
  data: string;
}

export interface DnsResult {
  /** RCODE. 0 = NOERROR, 3 = NXDOMAIN. */
  status: number;
  answers: DnsAnswer[];
}

const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  // A second operator, because a verification service that fails when one
  // provider has a bad hour tells every customer mid-setup that they made a
  // mistake. Different company, different network, different failure.
  "https://dns.google/resolve",
];

export class DnsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DnsUnavailable";
  }
}

/**
 * Query a name, trying each resolver in turn.
 *
 * Throws `DnsUnavailable` when NO resolver answered. That is deliberately
 * distinct from an empty answer: "nobody could tell us" and "the record is not
 * there" lead to opposite messages, and conflating them is how an outage on our
 * side reads to a customer as a mistake on theirs.
 */
export async function resolve(name: string, type: "TXT" | "A" | "AAAA" | "CNAME"): Promise<DnsResult> {
  const failures: string[] = [];

  for (const base of DOH_ENDPOINTS) {
    try {
      const url = `${base}?name=${encodeURIComponent(name)}&type=${type}`;
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        failures.push(`${base} -> HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { Status?: number; Answer?: Array<{ type: number; data: string }> };
      if (typeof body.Status !== "number") {
        // A 200 with an unexpected shape is a failure, not an empty answer. It
        // would otherwise read as NOERROR-with-no-records, which is exactly the
        // "parsed nothing, reported nothing wrong" defect this codebase keeps
        // producing.
        failures.push(`${base} -> 200 with no Status field`);
        continue;
      }
      return {
        status: body.Status,
        answers: (body.Answer ?? []).map((a) => ({ type: a.type, data: a.data })),
      };
    } catch (err) {
      failures.push(`${base} -> ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new DnsUnavailable(`no resolver answered for ${name} ${type}: ${failures.join("; ")}`);
}

/** TXT values arrive quoted and may be split into 255-byte chunks. */
export function txtValues(result: DnsResult): string[] {
  return result.answers
    .filter((a) => a.type === 16)
    .map((a) =>
      a.data
        // Concatenate the chunks, then strip the quoting the JSON API adds.
        .split(/"\s+"/)
        .map((s) => s.replace(/^"|"$/g, ""))
        .join(""),
    );
}

export function addressValues(result: DnsResult): string[] {
  return result.answers.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
}

export function cnameValues(result: DnsResult): string[] {
  return result.answers.filter((a) => a.type === 5).map((a) => a.data.replace(/\.$/, ""));
}
