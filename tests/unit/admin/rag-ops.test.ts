import { describe, it, expect } from "vitest";
import {
  DEFAULT_VECTOR_QUOTA,
  ENFORCED_VECTOR_QUOTA,
  findBillingIssues,
  humanBytes,
  quotaState,
  rollupByOrg,
  sortByRisk,
  summarize,
  summarizeBillingIntegrity,
  type CollectionRow,
  type ConnectorRow,
  type DocumentRow,
} from "@/lib/admin/rag-ops";

// Doc: nextstespsAI/21-admin-platform.md (§3 lists vector collections as having
// no operator surface). Verified against the live schema 2026-07-30.

const col = (p: Partial<CollectionRow> & Pick<CollectionRow, "id" | "org_id">): CollectionRow => ({
  name: "kb",
  row_count: 10,
  size_bytes: 1024,
  dimensions: 1536,
  embedding_model_id: "openai/text-embedding-3-small",
  index_type: "hnsw",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  ...p,
});
const conn = (p: Partial<ConnectorRow> & Pick<ConnectorRow, "id" | "org_id">): ConnectorRow => ({
  collection_id: "c1",
  display_name: "site",
  kind: "web_crawl",
  status: "idle",
  sync_schedule: "manual",
  last_error: null,
  last_synced_at: null,
  next_sync_at: null,
  docs_total: 5,
  docs_failed: 0,
  ...p,
});
const names = { o1: "Acme", o2: "Globex" };

describe("the quota must be read the way it is ENFORCED", () => {
  it("sums row_count, not measured vector rows", () => {
    // lib/inference/vector-quota.ts sums vector_collections.row_count. If this
    // module counted vector_rows instead, support would quote a customer a
    // different number from the one refusing their upload.
    const cols = [col({ id: "c1", org_id: "o1", row_count: 40 })];
    const [o] = rollupByOrg(cols, [], [], names, { c1: 999 });
    expect(o.vectors_used).toBe(40);
    expect(o.vectors_actual).toBe(999);
  });

  it("treats a null row_count as zero rather than skipping the collection", () => {
    const [o] = rollupByOrg([col({ id: "c1", org_id: "o1", row_count: null })], [], [], names, null);
    expect(o.vectors_used).toBe(0);
    expect(o.collections[0].counted).toBe(0);
  });

  it("reports drift, because the cached counter is what the gate trusts", () => {
    // Reading low gives a customer free headroom; reading high refuses storage
    // they are entitled to. Either way an operator needs to see it.
    const [o] = rollupByOrg([col({ id: "c1", org_id: "o1", row_count: 10 })], [], [], names, { c1: 7 });
    expect(o.collections[0].drift).toBe(-3);
    expect(o.drift).toBe(-3);
  });

  it("reports drift as null — not zero — when rows were not counted", () => {
    // Zero drift is a measurement. Null means "we did not check".
    const [o] = rollupByOrg([col({ id: "c1", org_id: "o1" })], [], [], names, null);
    expect(o.collections[0].drift).toBeNull();
    expect(o.drift).toBeNull();
    expect(o.vectors_actual).toBeNull();
  });

  it("uses the same ceiling the code enforces", () => {
    expect(ENFORCED_VECTOR_QUOTA).toBe(1_000_000);
    const [o] = rollupByOrg([col({ id: "c1", org_id: "o1", row_count: 1 })], [], [], names, null);
    expect(o.quota).toBe(1_000_000);
  });
});

describe("quotaState", () => {
  it("escalates as the org approaches the ceiling", () => {
    expect(quotaState(0, 1000)).toBe("ok");
    expect(quotaState(499, 1000)).toBe("ok");
    expect(quotaState(500, 1000)).toBe("watch");
    expect(quotaState(900, 1000)).toBe("near");
    expect(quotaState(1000, 1000)).toBe("full");
    expect(quotaState(1001, 1000)).toBe("full");
  });

  it("a zero or negative quota is full, never ok — nothing may be stored", () => {
    expect(quotaState(0, 0)).toBe("full");
    expect(quotaState(0, -1)).toBe("full");
  });
});

describe("rollupByOrg", () => {
  it("groups by org, which is the unit the quota applies to", () => {
    const cols = [
      col({ id: "c1", org_id: "o1", row_count: 5 }),
      col({ id: "c2", org_id: "o1", row_count: 7 }),
      col({ id: "c3", org_id: "o2", row_count: 2 }),
    ];
    const orgs = rollupByOrg(cols, [], [], names, null);
    expect(orgs).toHaveLength(2);
    expect(orgs.find((o) => o.org_id === "o1")!.vectors_used).toBe(12);
    expect(orgs.find((o) => o.org_id === "o2")!.vectors_used).toBe(2);
  });

  it("includes an org that has connectors but no collections yet", () => {
    // Otherwise a broken connector on a fresh org would be invisible.
    const orgs = rollupByOrg([], [conn({ id: "k1", org_id: "o2", status: "error" })], [], names, null);
    expect(orgs).toHaveLength(1);
    expect(orgs[0].broken_connectors).toBe(1);
  });

  it("links connectors to the collection they feed", () => {
    const orgs = rollupByOrg(
      [col({ id: "c1", org_id: "o1" })],
      [conn({ id: "k1", org_id: "o1", collection_id: "c1" }), conn({ id: "k2", org_id: "o1", collection_id: null })],
      [],
      names,
      null
    );
    expect(orgs[0].collections[0].connector_ids).toEqual(["k1"]);
  });

  it("counts only failed documents, not indexed ones", () => {
    const docs: DocumentRow[] = [
      { connector_id: "k1", status: "indexed", chunk_count: 3 },
      { connector_id: "k1", status: "failed", chunk_count: 0 },
      { connector_id: "k1", status: "removed", chunk_count: 0 },
    ];
    const orgs = rollupByOrg([col({ id: "c1", org_id: "o1" })], [conn({ id: "k1", org_id: "o1" })], docs, names, null);
    expect(orgs[0].failed_documents).toBe(1);
  });

  it("flags an empty collection, which is usually abandoned", () => {
    const orgs = rollupByOrg([col({ id: "c1", org_id: "o1", row_count: 0 })], [], [], names, { c1: 0 });
    expect(orgs[0].empty_collections).toBe(1);
    expect(orgs[0].collections[0].empty).toBe(true);
  });

  it("does not call a collection empty when rows were never counted and the cache says non-zero", () => {
    const orgs = rollupByOrg([col({ id: "c1", org_id: "o1", row_count: 5 })], [], [], names, null);
    expect(orgs[0].collections[0].empty).toBe(false);
  });

  it("lists distinct embedding models — mixed models mean mismatched dimensions", () => {
    // Live finding: one org has both 3-small (1536) and 3-large (3072). A query
    // embedded with one cannot search a collection built with the other.
    const cols = [
      col({ id: "c1", org_id: "o1", embedding_model_id: "openai/text-embedding-3-small", dimensions: 1536 }),
      col({ id: "c2", org_id: "o1", embedding_model_id: "openai/text-embedding-3-large", dimensions: 3072 }),
    ];
    const [o] = rollupByOrg(cols, [], [], names, null);
    expect(o.embedding_models).toHaveLength(2);
  });

  it("names an unknown org rather than rendering a bare uuid", () => {
    const [o] = rollupByOrg([col({ id: "c1", org_id: "ghost" })], [], [], {}, null);
    expect(o.org_name).toBe("(unknown org)");
  });

  it("sorts an org's collections largest first", () => {
    const cols = [
      col({ id: "small", org_id: "o1", row_count: 1 }),
      col({ id: "big", org_id: "o1", row_count: 99 }),
    ];
    const [o] = rollupByOrg(cols, [], [], names, null);
    expect(o.collections.map((c) => c.id)).toEqual(["big", "small"]);
  });
});

describe("summarize", () => {
  it("keeps actual as null when any org was unmeasured", () => {
    const orgs = rollupByOrg([col({ id: "c1", org_id: "o1" })], [], [], names, null);
    const s = summarize(orgs);
    expect(s.vectors_actual).toBeNull();
    expect(s.total_drift).toBeNull();
  });

  it("counts drifted collections and totals the drift", () => {
    const cols = [
      col({ id: "c1", org_id: "o1", row_count: 10 }),
      col({ id: "c2", org_id: "o1", row_count: 10 }),
    ];
    const s = summarize(rollupByOrg(cols, [], [], names, { c1: 12, c2: 10 }));
    expect(s.drifted_collections).toBe(1);
    expect(s.total_drift).toBe(2);
  });

  it("rolls up quota pressure across orgs", () => {
    const cols = [
      col({ id: "c1", org_id: "o1", row_count: ENFORCED_VECTOR_QUOTA }),
      col({ id: "c2", org_id: "o2", row_count: Math.round(ENFORCED_VECTOR_QUOTA * 0.95) }),
    ];
    const s = summarize(rollupByOrg(cols, [], [], names, null));
    expect(s.orgs_full).toBe(1);
    expect(s.orgs_near_quota).toBe(1);
  });
});

describe("sortByRisk", () => {
  it("puts a full quota first, then broken ingestion", () => {
    const orgs = rollupByOrg(
      [
        col({ id: "cf", org_id: "full", row_count: ENFORCED_VECTOR_QUOTA }),
        col({ id: "cb", org_id: "broken", row_count: 1 }),
        col({ id: "ci", org_id: "idle", row_count: 0 }),
      ],
      [conn({ id: "k1", org_id: "broken", status: "error" })],
      [],
      { full: "full", broken: "broken", idle: "idle" },
      null
    );
    expect(sortByRisk(orgs).map((o) => o.org_name)).toEqual(["full", "broken", "idle"]);
  });
});

describe("humanBytes", () => {
  it("scales units", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(512)).toBe("512 B");
    expect(humanBytes(1024)).toBe("1.0 KB");
    expect(humanBytes(1_032_192)).toBe("1008 KB"); // the live total
    expect(humanBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("never renders a negative or NaN size", () => {
    expect(humanBytes(-5)).toBe("0 B");
  });
});

describe("per-org quota resolution — the bug live testing caught", () => {
  // `Number(null)` is 0, not NaN. An earlier version coerced first and then
  // checked `Number.isFinite(n) && n >= 0`, so an org with NO override — the
  // normal case for every org — resolved to a quota of ZERO. The admin reported
  // every customer as "full", and the two vendored copies of this logic (the
  // gateway and the data-runner) would have refused every vector write and every
  // connector sync on the platform. No unit test caught it; a live run did.
  const collection = (orgId: string, rows: number) => ({
    id: `c-${orgId}`,
    name: "c",
    org_id: orgId,
    row_count: rows,
    size_bytes: 0,
    dimensions: 1536,
    embedding_model_id: "m",
    index_type: "hnsw",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
  const roll = (quotas: Record<string, number | null | undefined>) =>
    rollupByOrg([collection("org-1", 10)], [], [], { "org-1": "Acme" }, null, quotas);

  it("no entry at all falls back to the platform default", () => {
    expect(roll({})[0].quota).toBe(DEFAULT_VECTOR_QUOTA);
  });

  it("an explicit NULL means 'no override', not 'zero'", () => {
    expect(roll({ "org-1": null })[0].quota).toBe(DEFAULT_VECTOR_QUOTA);
    expect(roll({ "org-1": null })[0].quota_state).not.toBe("full");
  });

  it("undefined behaves the same as absent", () => {
    expect(roll({ "org-1": undefined })[0].quota).toBe(DEFAULT_VECTOR_QUOTA);
  });

  it("a real override IS honoured, including a deliberate zero", () => {
    expect(roll({ "org-1": 5 })[0].quota).toBe(5);
    expect(roll({ "org-1": 5 })[0].quota_state).toBe("full");
    // 0 set on purpose is a valid ceiling — "this org may store nothing".
    expect(roll({ "org-1": 0 })[0].quota).toBe(0);
  });

  it("nonsense values fall back rather than refusing the customer", () => {
    expect(roll({ "org-1": Number.NaN })[0].quota).toBe(DEFAULT_VECTOR_QUOTA);
    expect(roll({ "org-1": -1 })[0].quota).toBe(DEFAULT_VECTOR_QUOTA);
  });
});

describe("billing integrity — the live bug this exists to catch", () => {
  // Found 2026-08-05 on the real database: 20 active meters against 11
  // collections. Eleven billed $8/month each for collections that no longer
  // existed; two collections stored vectors with no meter at all. Money leaking
  // in both directions, invisible because the admin loaded collections and
  // never the meters beside them.
  const coll = (id: string, org = "org-1", rows = 10) => ({ id, name: `c-${id}`, org_id: org, row_count: rows });
  const meter = (service_id: string, hourly: number | string | null = 0.011111, status = "active") => ({
    service_id,
    user_id: "payer-1",
    hourly_rate: hourly,
    status,
  });

  it("flags a meter whose collection is gone, and prices the harm", () => {
    const out = findBillingIssues([coll("a")], [meter("a"), meter("deleted-1")]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("orphaned_meter");
    expect(out[0].id).toBe("deleted-1");
    // 0.011111/hr × 720 = $8.00/month, the real rate from production.
    expect(out[0].monthly_cents).toBe(800);
    expect(out[0].detail).toContain("$8.00/month");
  });

  it("flags a collection nothing meters", () => {
    const out = findBillingIssues([coll("a"), coll("b", "org-2", 3)], [meter("a")], { "org-2": "Acme" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "unbilled_collection", id: "b", org_name: "Acme" });
    expect(out[0].detail).toContain("3 vector(s)");
  });

  it("a CLOSED meter is history, not an orphan", () => {
    // Flagging settled rows would bury the live charges among them.
    expect(findBillingIssues([], [meter("gone", 0.01, "terminated")])).toEqual([]);
  });

  it("a meter with no status is treated as active — the safe direction", () => {
    const out = findBillingIssues([], [meter("gone", 0.01, null as unknown as string)]);
    expect(out).toHaveLength(1);
  });

  it("wrongly-charged money is listed before un-charged money", () => {
    // One is a refund conversation with a customer; the other is our own
    // revenue. They are not equally urgent.
    const out = findBillingIssues([coll("unbilled")], [meter("ghost-1"), meter("ghost-2")]);
    expect(out.map((i) => i.kind)).toEqual(["orphaned_meter", "orphaned_meter", "unbilled_collection"]);
  });

  it("orders orphans by how much they are wrongly charging", () => {
    const out = findBillingIssues([], [meter("cheap", 0.001), meter("dear", 0.05)]);
    expect(out.map((i) => i.id)).toEqual(["dear", "cheap"]);
  });

  it("handles NUMERIC arriving as a string, and refuses to invent a number", () => {
    // hourly_rate is NUMERIC — it comes over the wire as a string.
    expect(findBillingIssues([], [meter("s", "0.011111")])[0].monthly_cents).toBe(800);
    for (const junk of [null, "abc", Number.NaN]) {
      const got = findBillingIssues([], [meter("x", junk as never)])[0];
      expect(got.monthly_cents).toBeNull();
      expect(got.detail).not.toContain("$");
    }
  });

  it("a healthy platform reports nothing", () => {
    expect(findBillingIssues([coll("a"), coll("b")], [meter("a"), meter("b")])).toEqual([]);
  });
});

describe("summarizeBillingIntegrity", () => {
  const coll = (id: string) => ({ id, name: id, org_id: "org-1", row_count: 1 });
  const meter = (service_id: string) => ({ service_id, user_id: "u", hourly_rate: 0.011111, status: "active" });

  it("totals the money being wrongly charged", () => {
    const s = summarizeBillingIntegrity([coll("a")], [meter("a"), meter("x"), meter("y")]);
    expect(s).toMatchObject({ checked: true, orphaned_meters: 2, unbilled_collections: 0 });
    expect(s.wrongly_charged_monthly_cents).toBe(1600);
  });

  it("an unreadable billing table reports UNCHECKED, never '0 issues'", () => {
    // The difference between "nothing is wrong" and "we could not look" is the
    // whole point — reporting a clean bill of health from a failed query is how
    // this bug stayed invisible in the first place.
    const s = summarizeBillingIntegrity([coll("a")], null, {}, "permission denied");
    expect(s.checked).toBe(false);
    expect(s.error).toBe("permission denied");
    expect(s.orphaned_meters).toBe(0);
    expect(s.issues).toEqual([]);
  });
});
