/**
 * How a custom domain row is presented, in ONE place.
 *
 * The API route had this mapping and the project page had its own. The page's
 * copy was written against guessed column names — it selected `hostname` and
 * `status`, and the table has `domain` and `state` — so the query errored and
 * the Domains tab rendered "Could not load custom domains" against a table that
 * was perfectly readable.
 *
 * The second copy was wrong in a quieter way too: it passed `verification: null`
 * unconditionally, discarding `verification_txt`. Even with the columns fixed,
 * the customer would never have been shown the DNS record they need to add — a
 * domains page that lists a domain and cannot tell you how to verify it is
 * worse than one that admits it is broken.
 *
 * So there is one column list and one mapper, and both live here. A route and a
 * server component can both import this; it holds no JSX and no client
 * directive, so it crosses nothing.
 */

/**
 * Where a customer points their domain.
 *
 * ONE zone-level Cloudflare for SaaS fallback origin serves every customer
 * domain; it only gets the request into the cluster, and the custom hostname
 * record decides which project answers.
 *
 * It lived in the API route, which meant the list — and therefore the UI — had
 * no way to say where to CNAME. The customer was shown an ownership TXT and
 * nothing about the record that actually routes traffic.
 */
export const FALLBACK_ORIGIN = "fallback.ahurasense.com";

/** One DNS record a customer has to create. */
export interface DnsInstruction {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  /** Why this record exists, in the customer's terms. */
  purpose: string;
}

/**
 * ONE STRING LITERAL. supabase-js parses this at the TYPE level to infer the
 * row shape, and it can only do that for a literal — splitting it across a `+`
 * collapses the row to GenericStringError and produces a dozen "property does
 * not exist" errors that every one of them names a perfectly correct column.
 */
export const DOMAIN_COLUMNS =
  "id, ref, domain, state, verification_txt, verified_at, last_error, created_at";

export interface DomainRow {
  /** Selected because the issuance path addresses the row by primary key. */
  id: string;
  ref: string;
  domain: string;
  state: string;
  verification_txt: string | null;
  verified_at: string | null;
  last_error: string | null;
  created_at: string;
}

/**
 * What Cloudflare says about a hostname right now.
 *
 * The database records what we CLAIMED; only Cloudflare knows whether the
 * certificate issued and which DCV record it is currently waiting on. Those
 * rotate, so storing them would hand customers a stale value — worse than
 * none, because they would add it and then wait for something that can never
 * validate.
 */
export interface LiveHostname {
  status: string;
  sslStatus: string;
  /** The certificate-validation record. Absent once the certificate issues. */
  dcv: { name: string; value: string } | null;
}

export interface DomainDto {
  ref: string;
  domain: string;
  state: string;
  url: string;
  verification: { type: string; name: string; value: string } | null;
  verifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  serving: boolean;
  /** Everything the customer must create at their DNS provider. */
  records: DnsInstruction[];
  /** Cloudflare's own view, when we could read it. Null means we could not ask. */
  live: LiveHostname | null;
  /**
   * Whether this hostname actually serves traffic yet.
   *
   * OWNERSHIP VERIFIED IS NOT A CERTIFICATE. Cloudflare reports status=active
   * the moment it can prove you own the name, while the certificate can still
   * be pending_validation — and until that issues the hostname answers
   * nothing. Treating status alone as ready is what makes a domain look
   * configured while returning no traffic.
   */
  ready: boolean;
}

export function toDomainDto(row: DomainRow, live: LiveHostname | null = null): DomainDto {
  return {
    ref: row.ref,
    domain: row.domain,
    state: row.state,
    url: `https://${row.domain}`,
    // `_cf-custom-hostname`, NOT a name of our own invention.
    //
    // This once said `_ahura-verify.${domain}` — a prefix nothing on
    // Cloudflare's side has ever heard of. The claim response returned the real
    // record and the list returned a different one, so a customer following the
    // list added a TXT that could never verify, and the failure looked like
    // Cloudflare being slow rather than us giving the wrong instruction.
    //
    // The name is DERIVED because Cloudflare's ownership record is
    // deterministic: `_cf-custom-hostname.<hostname>`. Only the value is
    // unpredictable, and only the value is stored. If Cloudflare ever changes
    // the prefix this becomes wrong silently, which is why the claim path
    // returns Cloudflare's own record verbatim and this is the fallback for
    // rows claimed before issuance ran.
    verification: row.verification_txt
      ? { type: "TXT", name: `_cf-custom-hostname.${row.domain}`, value: row.verification_txt }
      : null,
    verifiedAt: row.verified_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    /** Honest: nothing serves a custom hostname until SaaS mode is on. */
    serving: row.state === "active",
    // THE CNAME IS ALWAYS INCLUDED, the TXT only once Cloudflare has issued
    // one. The CNAME is the record that actually carries traffic and it is
    // deterministic, so there is never a reason to withhold it — a customer
    // shown only an ownership TXT has been told how to prove they own a domain
    // and not how to make it serve anything.
    records: [
      {
        type: "CNAME" as const,
        name: row.domain,
        value: FALLBACK_ORIGIN,
        purpose: "Routes traffic to the platform. Cloudflare also accepts this as proof of ownership.",
      },
      ...(row.verification_txt
        ? [
            {
              type: "TXT" as const,
              name: `_cf-custom-hostname.${row.domain}`,
              value: row.verification_txt,
              purpose: "Proves you own the domain. Often unnecessary once the CNAME resolves.",
            },
          ]
        : []),
      // THE CERTIFICATE RECORD, which the database does not hold and which was
      // therefore never shown. Cloudflare verified ownership, reported the
      // hostname active, and then sat on pending_validation waiting for a TXT
      // nobody had been told about — so the domain looked configured and served
      // nothing. It disappears from this list once the certificate issues.
      ...(live?.dcv
        ? [
            {
              type: "TXT" as const,
              name: live.dcv.name,
              value: live.dcv.value,
              purpose:
                "Issues the TLS certificate. Until this resolves the domain will not serve, even though it shows as verified.",
            },
          ]
        : []),
    ],
    live,
    // Both halves. Ownership alone cannot serve a request.
    ready: live !== null && live.status === "active" && live.sslStatus === "active",
  };
}

/**
 * Cloudflare's current view of these hostnames.
 *
 * ONE call for the whole list rather than one per domain: the zone endpoint
 * returns every custom hostname, and a project with six domains should not make
 * six round trips on a page render.
 *
 * A FAILURE RETURNS AN EMPTY MAP, NOT AN EXCEPTION. Cloudflare being
 * unreachable must not blank the domains tab — the rows still exist, the CNAME
 * instruction is still correct, and everything that comes from the database is
 * still true. What is lost is the certificate status and the DCV record, and
 * the DTO says so by leaving `live` null rather than inventing a status.
 */
export async function liveStateFor(hostnames: readonly string[]): Promise<Map<string, LiveHostname>> {
  const out = new Map<string, LiveHostname>();
  if (hostnames.length === 0) return out;

  try {
    // Imported here rather than at module scope so this file stays importable
    // from anywhere; only the caller that needs live state pays for the edge
    // client.
    const { listCustomHostnames } = await import("./edge/cloudflare.ts");
    const all = await listCustomHostnames();
    const wanted = new Set(hostnames.map((h) => h.toLowerCase()));

    for (const ch of all) {
      const name = String(ch.hostname ?? "").toLowerCase();
      if (!wanted.has(name)) continue;

      // `validation_records` is where the pending DCV record lives. It empties
      // once the certificate issues, which is exactly when the instruction
      // should stop being shown.
      const record = ch.ssl?.validation_records?.find(
        (r) => typeof r?.txt_name === "string" && typeof r?.txt_value === "string",
      );

      out.set(name, {
        status: String(ch.status ?? "unknown"),
        sslStatus: String(ch.ssl?.status ?? "unknown"),
        dcv: record ? { name: String(record.txt_name), value: String(record.txt_value) } : null,
      });
    }
  } catch (e) {
    console.error("[domain-view] could not read live hostnames:", (e as Error).message.slice(0, 200));
  }

  return out;
}
