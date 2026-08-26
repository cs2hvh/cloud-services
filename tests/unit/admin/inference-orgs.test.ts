import { describe, it, expect } from "vitest";
import {
  capState,
  keyIdleDays,
  keyRisks,
  keyState,
  overview,
  rollupOrg,
  type ApiKeyRow,
  type ByokKeyRow,
  type OrgMemberRow,
  type OrgRow,
  type UsageRow,
  violatesZdrSupplyRule,
} from "@/lib/admin/inference-orgs";

// Doc: nextstespsAI/21-admin-platform.md (§4, A2). Org-scoped by decision in
// §5.1 — pure derivations, testable without a DB.

const NOW = Date.parse("2026-07-29T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function key(p: Partial<ApiKeyRow> & Pick<ApiKeyRow, "id">): ApiKeyRow {
  return {
    org_id: "org-1",
    name: "k",
    key_prefix: "ahu_live_x",
    key_last_four: "abcd",
    key_tier: "live",
    is_internal_service: false,
    rate_limit_rpm: 60,
    hard_cap_cents: 1000,
    monthly_budget_cents: null,
    allowed_models: null,
    revoked_at: null,
    expires_at: null,
    last_used_at: daysAgo(1),
    created_at: daysAgo(30),
    ...p,
  };
}

describe("keyState", () => {
  it("reports a normal live key as active", () => {
    expect(keyState(key({ id: "a" }), NOW)).toBe("active");
  });

  it("revoked outranks everything — it was chosen deliberately", () => {
    expect(keyState(key({ id: "b", revoked_at: daysAgo(2), expires_at: daysAgo(5), last_used_at: null }), NOW)).toBe("revoked");
  });

  it("expired outranks unused — a dead key is dead either way", () => {
    expect(keyState(key({ id: "c", expires_at: daysAgo(1), last_used_at: null }), NOW)).toBe("expired");
  });

  it("flags a key that was never called", () => {
    expect(keyState(key({ id: "d", last_used_at: null }), NOW)).toBe("unused");
  });

  it("a future expiry is not expired", () => {
    expect(keyState(key({ id: "e", expires_at: inDays(30) }), NOW)).toBe("active");
  });
});

describe("keyIdleDays", () => {
  it("counts days since last use, null when never used", () => {
    expect(keyIdleDays(key({ id: "a", last_used_at: daysAgo(9) }), NOW)).toBe(9);
    expect(keyIdleDays(key({ id: "b", last_used_at: null }), NOW)).toBeNull();
  });
});

describe("keyRisks", () => {
  it("flags a key with no spend cap at all", () => {
    expect(keyRisks(key({ id: "a", hard_cap_cents: null, monthly_budget_cents: null }), NOW)).toContain("no spend cap");
  });

  it("does not flag a key capped by either mechanism", () => {
    expect(keyRisks(key({ id: "b", hard_cap_cents: null, monthly_budget_cents: 5000 }), NOW)).not.toContain("no spend cap");
  });

  it("flags a missing rate limit and the internal-service flag", () => {
    const risks = keyRisks(key({ id: "c", rate_limit_rpm: null, is_internal_service: true }), NOW);
    expect(risks).toEqual(expect.arrayContaining(["no rate limit", "internal service"]));
  });

  it("says nothing about a revoked key — it cannot be used", () => {
    expect(keyRisks(key({ id: "d", revoked_at: daysAgo(1), hard_cap_cents: null, rate_limit_rpm: null }), NOW)).toEqual([]);
  });
});

describe("capState", () => {
  it("distinguishes NO cap from being safely under one", () => {
    // An uncapped org is unbounded, not safe — the two must not look alike.
    expect(capState(50_000, null)).toBe("none");
    expect(capState(50_000, 0)).toBe("none");
    expect(capState(10, 1000)).toBe("under");
  });

  it("warns at 80% and reports breach at 100%", () => {
    expect(capState(799, 1000)).toBe("under");
    expect(capState(800, 1000)).toBe("near");
    expect(capState(1000, 1000)).toBe("over");
    expect(capState(1200, 1000)).toBe("over");
  });
});

describe("rollupOrg", () => {
  const org: OrgRow = {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    owner_user_id: "u1",
    billing_user_id: "u1",
    hard_cap_cents: 1000,
    monthly_budget_cents: null,
    zdr_default: false,
    region_pin: null,
    deleted_at: null,
    created_at: daysAgo(90),
  };
  const members: OrgMemberRow[] = [
    { org_id: "org-1", user_id: "u1", role: "owner", status: "active", joined_at: daysAgo(90), invited_at: null },
    { org_id: "org-1", user_id: "u2", role: "member", status: "active", joined_at: daysAgo(10), invited_at: null },
    { org_id: "org-2", user_id: "u3", role: "owner", status: "active", joined_at: daysAgo(5), invited_at: null },
  ];
  const keys = [
    key({ id: "k1" }),
    key({ id: "k2", revoked_at: daysAgo(1) }),
    key({ id: "k3", is_internal_service: true }),
    key({ id: "k4", org_id: "org-2" }),
  ];
  const byok: ByokKeyRow[] = [
    { id: "b1", org_id: "org-1", provider: "openai", name: null, key_last_four: "1234", is_valid: true, last_verified_at: null, last_verify_error: null },
  ];
  const usage: UsageRow[] = [
    { org_id: "org-1", cost_cents: 300, created_at: daysAgo(2) },
    { org_id: "org-1", cost_cents: 550, created_at: daysAgo(1) },
    { org_id: "org-2", cost_cents: 999, created_at: daysAgo(1) },
  ];

  it("counts only this org's members, keys, byok and spend", () => {
    const s = rollupOrg(org, members, keys, byok, usage, NOW);
    expect(s.members).toBe(2);
    expect(s.keys_total).toBe(3);
    expect(s.keys_active).toBe(2); // k2 revoked
    expect(s.keys_internal).toBe(1);
    expect(s.byok_keys).toBe(1);
    expect(s.spend_cents).toBe(850);
  });

  it("derives the cap state from that spend", () => {
    // 850 of a 1000 cap = 85% -> near
    expect(rollupOrg(org, members, keys, byok, usage, NOW).cap_state).toBe("near");
  });

  it("excludes revoked keys from the internal count", () => {
    const revokedInternal = [key({ id: "k5", is_internal_service: true, revoked_at: daysAgo(1) })];
    expect(rollupOrg(org, [], revokedInternal, [], [], NOW).keys_internal).toBe(0);
  });
});

describe("overview", () => {
  it("counts the platform-wide risks an operator should see first", () => {
    const orgs: OrgRow[] = [
      { id: "o1", name: "A", slug: "a", owner_user_id: null, billing_user_id: null, hard_cap_cents: 1000, monthly_budget_cents: null, zdr_default: null, region_pin: null, deleted_at: null, created_at: daysAgo(10) },
      { id: "o2", name: "B", slug: "b", owner_user_id: null, billing_user_id: null, hard_cap_cents: null, monthly_budget_cents: null, zdr_default: null, region_pin: null, deleted_at: null, created_at: daysAgo(10) },
      { id: "o3", name: "gone", slug: "c", owner_user_id: null, billing_user_id: null, hard_cap_cents: null, monthly_budget_cents: null, zdr_default: null, region_pin: null, deleted_at: daysAgo(1), created_at: daysAgo(20) },
    ];
    const keys = [
      key({ id: "k1", hard_cap_cents: null, monthly_budget_cents: null }), // uncapped
      key({ id: "k2", is_internal_service: true }),
      key({ id: "k3", revoked_at: daysAgo(1), hard_cap_cents: null, monthly_budget_cents: null }), // revoked, not counted
    ];
    const o = overview(orgs, [], keys, NOW);
    expect(o.orgs).toBe(3);
    expect(o.active_orgs).toBe(2); // o3 soft-deleted
    expect(o.keys_live).toBe(2);
    expect(o.keys_uncapped).toBe(1); // revoked one excluded
    expect(o.internal_keys_live).toBe(1);
    expect(o.orgs_without_cap).toBe(1); // o2 only; o3 is deleted
  });
});

describe("violatesZdrSupplyRule", () => {
  // ZDR and marketplace supply are incompatible promises: marketplace capacity
  // may retain a failed request's payload for 14 days, unredacted.
  it("refuses turning marketplace supply on for an org that already has ZDR", () => {
    expect(violatesZdrSupplyRule({ zdr_default: true }, { allow_marketplace_supply: true })).toBe(true);
  });

  it("refuses turning ZDR on for an org that already uses marketplace supply", () => {
    expect(violatesZdrSupplyRule({ allow_marketplace_supply: true }, { zdr_default: true })).toBe(true);
  });

  it("refuses setting BOTH in one request — the way it would actually happen", () => {
    expect(
      violatesZdrSupplyRule(null, { zdr_default: true, allow_marketplace_supply: true })
    ).toBe(true);
  });

  it("allows either one alone", () => {
    expect(violatesZdrSupplyRule({ zdr_default: true }, { allow_marketplace_supply: false })).toBe(false);
    expect(violatesZdrSupplyRule({ allow_marketplace_supply: true }, { zdr_default: false })).toBe(false);
  });

  it("allows turning ZDR ON while turning marketplace supply OFF in the same request", () => {
    expect(
      violatesZdrSupplyRule({ allow_marketplace_supply: true }, { zdr_default: true, allow_marketplace_supply: false })
    ).toBe(false);
  });

  it("treats absent and null as false, not as unknown", () => {
    expect(violatesZdrSupplyRule(null, {})).toBe(false);
    expect(violatesZdrSupplyRule({ zdr_default: null, allow_marketplace_supply: null }, {})).toBe(false);
  });
});
