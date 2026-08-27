/**
 * Reserved hostname labels.
 *
 * Apps are served at `<label>.ahurasense.com` — the same zone that carries the
 * marketing site, the production API and the mail records. Nothing prevented a
 * tenant from claiming `api` or `www` before this file existed: the only check
 * in the deploy path was against `paas.aliases`, which asks "does another
 * PROJECT hold this?" and never "does the business already run something here?"
 *
 * A tenant holding `www` or `api` is not a naming collision, it is a takeover of
 * the company's own hostname, and it is reachable by anyone who can create a
 * project. Two separate harms: breaking a live service, and serving attacker
 * content from a domain customers already trust.
 *
 * THE VACUITY GUARD. Every checker here reports how many labels it actually
 * examined. Today's recurring bug — six instances across three sessions — is a
 * check that examines nothing and reports success: a regex whose backslashes
 * were eaten matched zero call sites and passed; an empty Trivy `Results` array
 * read as "no vulnerabilities"; `allowMissing` on a write turned failure into
 * success. A reserved-label set that silently became empty would fail exactly
 * that way — every name would look available. So `checkedAgainst` is part of the
 * result, and the tests assert on it. A guard that cannot say what it examined
 * cannot be trusted when it says nothing was wrong.
 */

/**
 * Seeded from the live zone on 2026-08-26 — 23 single-label records were
 * present and none of them was protected. These are the ones that are NOT the
 * platform's own `v2-*` apps.
 *
 * Kept as data rather than fetched at deploy time on purpose: a reserved list
 * that depends on a network call fails open when the network is down, which is
 * precisely when a mistake is least likely to be noticed.
 */
import { createHash } from "node:crypto";

export const LIVE_ZONE_LABELS = [
  "api",
  "cpanel",
  "dallas1",
  "db-testing",
  "db-testing-1",
  "dev1",
  "games",
  "indnode",
  "send",
  "test",
  "test1",
  "trade",
  "www",
] as const;

/** Web and mail conventions. Claiming any of these intercepts real traffic. */
const INFRASTRUCTURE = [
  "admin", "app", "apps", "autoconfig", "autodiscover", "beta", "blog", "cdn",
  "cpanel", "dashboard", "dev", "docs", "email", "ftp", "git", "imap", "internal",
  "localhost", "mail", "mx", "ns", "ns1", "ns2", "ns3", "ns4", "owa", "pop",
  "pop3", "preview", "private", "prod", "production", "proxy", "root", "smtp",
  "ssh", "ssl", "staging", "static", "status", "test", "vpn", "webmail", "whm",
  "www", "www1", "www2",
] as const;

/**
 * Names that make a phishing page look official. These matter more than the
 * infrastructure list: nothing breaks when a tenant takes `billing`, which is
 * exactly why it would go unnoticed while it collected credentials.
 */
const TRUST_BEARING = [
  "account", "accounts", "auth", "billing", "checkout", "confirm", "connect",
  "console", "customer", "help", "id", "identity", "invoice", "invoices",
  "legal", "login", "logout", "manage", "my", "oauth", "pay", "payment",
  "payments", "portal", "privacy", "register", "reset", "secure", "security",
  "signin", "signup", "sso", "support", "terms", "trust", "verify", "wallet",
] as const;

/** Platform-owned names. A tenant taking these would shadow our own surfaces. */
const PLATFORM = [
  "activator", "ahura", "ahurasense", "cluster", "gateway", "grafana",
  "ingress", "kubernetes", "metrics", "operator", "paas", "prometheus",
  "registry", "traefik",
  // `fallback` is the Cloudflare for SaaS FALLBACK ORIGIN — the hostname every
  // customer's custom domain resolves to before the Ingress routes it by Host
  // header. A tenant claiming this label would mint fallback.ahurasense.com,
  // claim the Ingress for it, and receive EVERY customer's custom-domain
  // traffic. Cross-tenant hijack of the whole custom-domain feature.
  //
  // Missed because LIVE_ZONE_LABELS was seeded from the zone as it stood, and
  // this record was created afterwards — by me, for the fallback origin. The
  // list is a SNAPSHOT, so anything added to the zone later is unreserved until
  // someone remembers. Caught by the operator dashboard's own hostname panel
  // reporting it as claimable, the first time that page was ever rendered.
  //
  // The general rule, and the reason this comment is long: CREATING A PLATFORM
  // DNS RECORD IS ALSO A RESERVATION. A record with no paas.aliases row is
  // invisible to the deploy path's collision check, which only asks whether
  // another PROJECT holds the hostname.
  "fallback",
] as const;

/**
 * ACME and well-known prefixes. `_acme-challenge` in particular: a tenant
 * holding it could complete a certificate challenge for the apex domain.
 */
const PROTOCOL = ["_acme-challenge", "_dmarc", "_domainkey", "_well-known"] as const;

export const RESERVED_LABELS: ReadonlySet<string> = new Set<string>([
  ...LIVE_ZONE_LABELS,
  ...INFRASTRUCTURE,
  ...TRUST_BEARING,
  ...PLATFORM,
  ...PROTOCOL,
]);

/**
 * Mint the hostname label for a branch preview.
 *
 * THREE CONSTRAINTS, none of them stylistic:
 *
 *   ONE LABEL. The zone certificate covers `*.ahurasense.com`, and a wildcard
 *   covers exactly one label deep. `myapp-featurex.ahurasense.com` is covered;
 *   `featurex.myapp.ahurasense.com` is not, and the customer gets a TLS error
 *   rather than a 404 — a failure that looks like the platform is broken.
 *
 *   63 CHARACTERS. A DNS label's hard limit. Project slugs are capped at 40, so
 *   the branch portion and a disambiguator have to fit in what remains.
 *
 *   [a-z0-9-] ONLY. Branch names routinely contain `/`, `_`, `.` and uppercase —
 *   `feature/JIRA-123_fix` is entirely ordinary and none of it is legal here.
 *
 * The hash is what makes truncation safe. Sanitising and truncating alone maps
 * many branches onto one label: `feature/user-authentication-v1` and
 * `feature/user-authentication-v2` both truncate to the same 15 characters, and
 * the second push would silently take over the first branch's preview URL. The
 * suffix is derived from the FULL original branch name, so distinct branches
 * cannot collide however similar their prefixes.
 */
export function previewLabel(projectSlug: string, branch: string): string {
  const BRANCH_CHARS = 15;
  const hash = createHash("sha256").update(branch).digest("hex").slice(0, 6);

  const cleaned = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BRANCH_CHARS)
    .replace(/-+$/g, ""); // a trailing hyphen from truncation would double up

  const parts = [projectSlug.slice(0, 40), cleaned, hash].filter(Boolean);
  return parts.join("-");
}

export interface LabelVerdict {
  ok: boolean;
  label: string;
  reason: string | null;
  /**
   * How many reserved labels were actually consulted. A caller that sees a 0
   * here has a broken checker, not an available name — the distinction the rest
   * of this codebase keeps between "observed nothing" and "could not observe".
   */
  checkedAgainst: number;
}

/**
 * Labels that are structurally invalid rather than reserved. Kept separate
 * because the two failures need different messages: one is "pick another name",
 * the other is "that is not a name".
 */
function structuralProblem(label: string): string | null {
  if (label.length === 0) return "hostname label is empty";
  if (label.length > 63) return `hostname label is ${label.length} characters; DNS allows 63`;
  // NOTE: there is deliberately no "must be lowercase" check here. Callers reach
  // this function only after normalisation, so such a branch could never fire —
  // it would be a guard incapable of executing, which is the same class of
  // defect as a guard that examines nothing. DNS is case-insensitive, so `MyApp`
  // is folded and accepted; what matters is that folding happens BEFORE the
  // reserved lookup, or `WWW` walks straight past a lowercase set.
  if (!/^[a-z0-9-]+$/.test(label)) return "hostname labels may contain only a-z, 0-9 and hyphen";
  if (label.startsWith("-") || label.endsWith("-")) return "hostname labels may not start or end with a hyphen";
  if (label.startsWith("xn--")) return "punycode-prefixed labels are reserved";
  // A label that is entirely digits is legal in DNS but ambiguous with an IP
  // octet in enough tooling to be worth refusing.
  if (/^\d+$/.test(label)) return "hostname labels may not be purely numeric";
  return null;
}

/**
 * Is this label safe for a tenant to claim?
 *
 * Never throws — the caller decides what to do with a refusal. `checkedAgainst`
 * is populated on every path, including the structural ones, so a test can
 * assert the checker was not vacuous regardless of which branch it took.
 */
export function checkLabel(label: string): LabelVerdict {
  const checkedAgainst = RESERVED_LABELS.size;
  const normalised = label.trim().toLowerCase();

  const structural = structuralProblem(normalised);
  if (structural) return { ok: false, label: normalised, reason: structural, checkedAgainst };

  if (RESERVED_LABELS.has(normalised)) {
    return {
      ok: false,
      label: normalised,
      reason: `"${normalised}" is reserved by the platform and cannot be used as an app hostname`,
      checkedAgainst,
    };
  }

  // `_`-prefixed labels are used by protocols (SRV, DKIM, ACME). Refuse the
  // whole shape rather than enumerating every one that might be invented later.
  if (normalised.startsWith("_")) {
    return {
      ok: false,
      label: normalised,
      reason: `"${normalised}" uses the underscore prefix reserved for DNS protocol records`,
      checkedAgainst,
    };
  }

  return { ok: true, label: normalised, reason: null, checkedAgainst };
}

/**
 * Throwing form, for the deploy path.
 *
 * Refuses if the reserved set is empty. That is not defensive noise: an empty
 * set is the exact failure mode this module is written to prevent, and it would
 * otherwise present as every hostname being available.
 */
export function assertLabelAvailable(label: string): void {
  const verdict = checkLabel(label);
  if (verdict.checkedAgainst === 0) {
    throw new Error(
      "[paas/hostnames] reserved-label set is empty — refusing to validate. " +
        "An empty set would report every hostname as available, including www and api.",
    );
  }
  if (!verdict.ok) throw new Error(`[paas/hostnames] ${verdict.reason}`);
}
