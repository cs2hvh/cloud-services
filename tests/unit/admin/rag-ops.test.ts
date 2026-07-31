import { describe, it, expect } from "vitest";
import {
  ENFORCED_VECTOR_QUOTA,
  humanBytes,
  quotaState,
  rollupByOrg,
  sortByRisk,
  summarize,
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
