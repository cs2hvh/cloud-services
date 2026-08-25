import { describe, it, expect } from "vitest";
import {
  bulkRepriceEntry,
  diffFields,
  keyEntry,
  modelActivationEntry,
  modelPriceEntry,
  orgLimitsEntry,
} from "@/lib/admin/audit";

// Doc: nextstespsAI/21-admin-platform.md (§5.2). The entry builders are pure so
// the audit trail's SHAPE is tested without a database — what a row contains is
// the whole value of an audit log.

describe("diffFields", () => {
  it("keeps only fields that actually moved", () => {
    // A PUT sends the whole form; recording unchanged fields would bury the
    // one real change and make "what changed?" unanswerable.
    const changes = diffFields(
      { input_cents_per_mtok: 30, output_cents_per_mtok: 60 },
      { input_cents_per_mtok: 30, output_cents_per_mtok: 120 },
      ["input_cents_per_mtok", "output_cents_per_mtok"]
    );
    expect(changes).toEqual([{ field: "output_cents_per_mtok", from: 60, to: 120 }]);
  });

  it("records a value being set for the first time, and being cleared", () => {
    expect(diffFields({}, { hard_cap_cents: 5000 }, ["hard_cap_cents"])).toEqual([
      { field: "hard_cap_cents", from: null, to: 5000 },
    ]);
    expect(diffFields({ hard_cap_cents: 5000 }, { hard_cap_cents: null }, ["hard_cap_cents"])).toEqual([
      { field: "hard_cap_cents", from: 5000, to: null },
    ]);
  });

  it("ignores fields outside the watched list", () => {
    expect(diffFields({ a: 1 }, { a: 2 }, ["b"])).toEqual([]);
  });

  it("returns nothing when a save changed nothing", () => {
    expect(diffFields({ x: 1 }, { x: 1 }, ["x"])).toEqual([]);
  });
});

describe("modelPriceEntry", () => {
  const changes = [{ field: "output_cents_per_mtok", from: 60, to: 120 }];

  it("is platform-scoped — a catalog price belongs to no customer", () => {
    // org_id null also keeps admin rows out of org-scoped RLS reads.
    expect(modelPriceEntry("openai/gpt-4o-mini", changes, false).org_id).toBeNull();
  });

  it("carries the before value, not just the after", () => {
    const entry = modelPriceEntry("openai/gpt-4o-mini", changes, false);
    expect(entry.metadata.changes).toEqual(changes);
    expect(entry.target_id).toBe("openai/gpt-4o-mini");
  });

  it("flags a deliberate below-cost save", () => {
    // The single most important thing to be able to find later.
    expect(modelPriceEntry("m", changes, true).metadata.below_cost_override).toBe(true);
    expect(modelPriceEntry("m", changes, false).metadata.below_cost_override).toBe(false);
  });
});

describe("modelActivationEntry", () => {
  it("records enable and disable distinctly", () => {
    expect(modelActivationEntry("m", false).metadata.is_active).toBe(false);
    expect(modelActivationEntry("m", true).action).toBe("admin.model_activation_changed");
  });
});

describe("bulkRepriceEntry", () => {
  const changes = [
    { model_id: "a", field: "output_cents_per_mtok", from: 5, to: 26 },
    { model_id: "b", field: "output_cents_per_mtok", from: 60, to: 120 },
  ];

  it("records the full diff so a bad run can be reversed by hand", () => {
    const entry = bulkRepriceEntry(50, ["a", "b"], changes, "underwater");
    expect(entry.metadata.changes).toEqual(changes);
    expect(entry.metadata.models).toEqual(["a", "b"]);
    expect(entry.metadata.models_updated).toBe(2);
  });

  it("records the rule that produced it, not only the result", () => {
    const entry = bulkRepriceEntry(50, ["a"], changes, "all");
    expect(entry.metadata.target_margin_pct).toBe(50);
    expect(entry.metadata.scope).toBe("all");
  });

  it("targets the catalog, not one model", () => {
    const entry = bulkRepriceEntry(50, [], [], "underwater");
    expect(entry.target_type).toBe("model_catalog");
    expect(entry.target_id).toBeNull();
    expect(entry.org_id).toBeNull();
  });
});

describe("orgLimitsEntry", () => {
  it("is scoped to the org it concerns", () => {
    const entry = orgLimitsEntry("org-1", [{ field: "hard_cap_cents", from: null, to: 5000 }]);
    expect(entry.org_id).toBe("org-1");
    expect(entry.target_id).toBe("org-1");
    expect(entry.action).toBe("admin.org_limits_updated");
  });
});

describe("keyEntry", () => {
  it("uses a distinct action for revocation — the irreversible one", () => {
    expect(keyEntry("k1", "org-1", [], true).action).toBe("admin.key_revoked");
    expect(keyEntry("k1", "org-1", [], false).action).toBe("admin.key_updated");
  });

  it("stays scoped to the owning org", () => {
    expect(keyEntry("k1", "org-1", [{ field: "is_internal_service", from: false, to: true }], false).org_id).toBe("org-1");
  });
});
