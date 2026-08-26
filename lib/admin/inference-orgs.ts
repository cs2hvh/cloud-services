/**
 * Org & customer derivations for the admin — pure, DB-free, UI-free.
 *
 * Identity model (doc 21 §5.1, decided 2026-07-29): the AI platform is
 * ORG-scoped. Every resource — keys, collections, runs, usage — hangs off
 * `org_id`, never `user_id`, so an org is the only unit that can carry a quota,
 * a spend cap or a bill. People are resolved through org_members → user_profiles
 * for display only.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§4, section A2).
 */

export interface OrgRow {
  id: string;
  name: string | null;
  slug: string | null;
  owner_user_id: string | null;
  billing_user_id: string | null;
  hard_cap_cents: number | null;
  monthly_budget_cents: number | null;
  /** Per-org vector ceiling; null = platform default (migration 20260804000001). */
  vector_quota: number | null;
  zdr_default: boolean | null;
  /** May this org be served by marketplace supply (resold subscription
   *  capacity)? Default false. Mutually exclusive with zdr_default — the API
   *  refuses to set both, because marketplace suppliers may retain request
   *  payloads for 14 days on failed requests. */
  allow_marketplace_supply: boolean | null;
  region_pin: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface OrgMemberRow {
  org_id: string;
  user_id: string;
  role: string;
  status: string | null;
  joined_at: string | null;
  invited_at: string | null;
}

export interface ApiKeyRow {
  id: string;
  org_id: string;
  name: string | null;
  key_prefix: string | null;
  key_last_four: string | null;
  key_tier: string | null;
  is_internal_service: boolean | null;
  rate_limit_rpm: number | null;
  hard_cap_cents: number | null;
  monthly_budget_cents: number | null;
  allowed_models: unknown;
  revoked_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ByokKeyRow {
  id: string;
  org_id: string;
  provider: string | null;
  name: string | null;
  key_last_four: string | null;
  is_valid: boolean | null;
  last_verified_at: string | null;
  last_verify_error: string | null;
}

export interface UsageRow {
  org_id: string;
  cost_cents: number | null;
  created_at: string;
}

function cents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

// ── API key state ────────────────────────────────────────────────────────────

export type KeyState = "active" | "revoked" | "expired" | "unused";

/**
 * What an operator needs to know about a key at a glance.
 *
 * `expired` outranks `unused`: a key past its expiry is dead regardless of
 * whether it was ever called. `revoked` outranks everything — it is the only
 * state that was chosen deliberately.
 */
export function keyState(key: ApiKeyRow, now: number): KeyState {
  if (key.revoked_at) return "revoked";
  const expires = ms(key.expires_at);
  if (expires !== null && expires < now) return "expired";
  if (!key.last_used_at) return "unused";
  return "active";
}

/** Days since a key was last used, or null if never. */
export function keyIdleDays(key: ApiKeyRow, now: number): number | null {
  const last = ms(key.last_used_at);
  if (last === null) return null;
  return Math.floor((now - last) / 86_400_000);
}

/**
 * Keys worth an operator's attention: live keys nobody has used, and keys with
 * no spend cap. An uncapped key is the blast radius if it ever leaks.
 */
export function keyRisks(key: ApiKeyRow, now: number): string[] {
  const risks: string[] = [];
  if (keyState(key, now) === "revoked") return risks;
  if (cents(key.hard_cap_cents) === 0 && cents(key.monthly_budget_cents) === 0) risks.push("no spend cap");
  if (!key.rate_limit_rpm) risks.push("no rate limit");
  if (key.is_internal_service) risks.push("internal service");
  return risks;
}

// ── Spend caps ───────────────────────────────────────────────────────────────

export type CapState = "none" | "under" | "near" | "over";

/**
 * Where an org sits against its own cap. `near` fires at 80% — early enough to
 * act on, late enough not to be noise.
 *
 * A missing cap is "none", never "under": an uncapped org is not safe, it is
 * simply unbounded, and the two must not look alike on screen.
 */
export function capState(spentCents: number, capCents: number | null): CapState {
  const cap = cents(capCents);
  if (cap <= 0) return "none";
  const ratio = spentCents / cap;
  if (ratio >= 1) return "over";
  if (ratio >= 0.8) return "near";
  return "under";
}

// ── Org rollup ───────────────────────────────────────────────────────────────

export interface OrgSummary {
  org_id: string;
  members: number;
  keys_total: number;
  keys_active: number;
  keys_internal: number;
  byok_keys: number;
  spend_cents: number;
  cap_state: CapState;
}

export function rollupOrg(
  org: OrgRow,
  members: OrgMemberRow[],
  keys: ApiKeyRow[],
  byok: ByokKeyRow[],
  usage: UsageRow[],
  now: number
): OrgSummary {
  const orgKeys = keys.filter((k) => k.org_id === org.id);
  const spend = usage.filter((u) => u.org_id === org.id).reduce((sum, u) => sum + cents(u.cost_cents), 0);
  return {
    org_id: org.id,
    members: members.filter((m) => m.org_id === org.id).length,
    keys_total: orgKeys.length,
    keys_active: orgKeys.filter((k) => keyState(k, now) === "active").length,
    keys_internal: orgKeys.filter((k) => k.is_internal_service && !k.revoked_at).length,
    byok_keys: byok.filter((b) => b.org_id === org.id).length,
    spend_cents: spend,
    cap_state: capState(spend, org.hard_cap_cents),
  };
}

// ── Platform-wide counters ───────────────────────────────────────────────────

export interface OrgsOverview {
  orgs: number;
  active_orgs: number;
  members: number;
  keys: number;
  keys_live: number;
  keys_uncapped: number;
  internal_keys_live: number;
  orgs_without_cap: number;
}

export function overview(orgs: OrgRow[], members: OrgMemberRow[], keys: ApiKeyRow[]): OrgsOverview {
  const live = keys.filter((k) => !k.revoked_at);
  return {
    orgs: orgs.length,
    active_orgs: orgs.filter((o) => !o.deleted_at).length,
    members: members.length,
    keys: keys.length,
    keys_live: live.length,
    keys_uncapped: live.filter((k) => cents(k.hard_cap_cents) === 0 && cents(k.monthly_budget_cents) === 0).length,
    internal_keys_live: live.filter((k) => k.is_internal_service).length,
    orgs_without_cap: orgs.filter((o) => !o.deleted_at && cents(o.hard_cap_cents) === 0).length,
  };
}

// ── Supply policy ────────────────────────────────────────────────────────────

/**
 * Would this update leave an org both zero-data-retention AND permitted to use
 * marketplace supply?
 *
 * Those are incompatible promises. Marketplace capacity is resold subscription
 * quota, and the supplier's own terms allow keeping the full request payload
 * for 14 days on failed or abnormal requests, unredacted. An org told it has
 * ZDR must never be routed there.
 *
 * Evaluated against the state AFTER the patch, not before, so setting both in
 * one request is caught too — which is exactly how it would happen: somebody
 * clicks two toggles and saves once.
 *
 * Pure so it can be tested without a database, like every other rule here.
 */
export function violatesZdrSupplyRule(
  before: { zdr_default?: unknown; allow_marketplace_supply?: unknown } | null,
  patch: { zdr_default?: unknown; allow_marketplace_supply?: unknown },
): boolean {
  const after = (field: "zdr_default" | "allow_marketplace_supply"): boolean =>
    typeof patch[field] === "boolean" ? (patch[field] as boolean) : before?.[field] === true;
  return after("zdr_default") && after("allow_marketplace_supply");
}
