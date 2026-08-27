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
}

export function toDomainDto(row: DomainRow): DomainDto {
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
  };
}
