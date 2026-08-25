import { describe, it, expect } from "vitest";
import {
  actionCounts,
  actorKind,
  applyFilter,
  changesOf,
  describe as describeRow,
  eventScope,
  isSensitive,
  summarize,
  type AuditRow,
} from "@/lib/admin/audit-view";

// Doc: nextstespsAI/21-admin-platform.md (§3, §4 A6). Reading half of the audit
// trail; lib/admin/audit.ts is the writing half.

function row(p: Partial<AuditRow> & Pick<AuditRow, "action">): AuditRow {
  return {
    id: "1",
    org_id: "org-1",
    actor_user_id: "user-1",
    actor_api_key_id: null,
    target_type: "api_key",
    target_id: "k1",
    metadata: {},
    ip_address: null,
    user_agent: null,
    created_at: "2026-07-29T10:00:00Z",
    ...p,
  };
}

describe("eventScope", () => {
  it("separates staff actions from customer actions by the admin. prefix", () => {
    expect(eventScope(row({ action: "admin.model_price_updated" }))).toBe("admin");
    expect(eventScope(row({ action: "key.created" }))).toBe("customer");
  });
});

describe("actorKind", () => {
  it("distinguishes an API-key actor from a human — it says HOW it happened", () => {
    expect(actorKind(row({ action: "key.created", actor_api_key_id: "k9", actor_user_id: null }))).toBe("api_key");
    expect(actorKind(row({ action: "key.created" }))).toBe("user");
  });

  it("reports system rows with no actor at all", () => {
    expect(actorKind(row({ action: "batch.completed", actor_user_id: null, actor_api_key_id: null }))).toBe("system");
  });

  it("marks any admin.* row as an admin actor", () => {
    expect(actorKind(row({ action: "admin.key_revoked", actor_user_id: "u" }))).toBe("admin");
  });
});

describe("isSensitive", () => {
  it("flags money and access changes", () => {
    expect(isSensitive(row({ action: "admin.model_bulk_repriced" }))).toBe(true);
    expect(isSensitive(row({ action: "admin.org_limits_updated" }))).toBe(true);
    expect(isSensitive(row({ action: "key.revoked" }))).toBe(true);
  });

  it("leaves routine activity unflagged", () => {
    expect(isSensitive(row({ action: "collection.created" }))).toBe(false);
  });
});

describe("changesOf", () => {
  it("reads the before/after list an admin write recorded", () => {
    const r = row({
      action: "admin.model_price_updated",
      metadata: { changes: [{ field: "output_cents_per_mtok", from: 60, to: 120 }] },
    });
    expect(changesOf(r)).toEqual([{ field: "output_cents_per_mtok", from: 60, to: 120 }]);
  });

  it("is empty for rows written before this feature, without throwing", () => {
    expect(changesOf(row({ action: "key.created", metadata: {} }))).toEqual([]);
    expect(changesOf(row({ action: "key.created", metadata: null }))).toEqual([]);
    expect(changesOf(row({ action: "x", metadata: { changes: "nonsense" } }))).toEqual([]);
  });

  it("drops malformed entries rather than rendering junk", () => {
    expect(changesOf(row({ action: "x", metadata: { changes: [{ nope: 1 }, { field: "a", from: 1, to: 2 }] } }))).toEqual([
      { field: "a", from: 1, to: 2 },
    ]);
  });
});

describe("describe", () => {
  it("renders a price change as a sentence with both values", () => {
    const text = describeRow(
      row({
        action: "admin.model_price_updated",
        target_id: "openai/gpt-4o-mini",
        metadata: { changes: [{ field: "output_cents_per_mtok", from: 60, to: 120 }] },
      })
    );
    expect(text).toBe("Repriced openai/gpt-4o-mini: output 60 → 120");
  });

  it("calls out a forced below-cost save", () => {
    const text = describeRow(
      row({
        action: "admin.model_price_updated",
        target_id: "m",
        metadata: { changes: [{ field: "output_cents_per_mtok", from: 60, to: 5 }], below_cost_override: true },
      })
    );
    expect(text).toContain("(below cost, forced)");
  });

  it("summarises a bulk run by count and rule", () => {
    const text = describeRow(
      row({ action: "admin.model_bulk_repriced", metadata: { models_updated: 21, target_margin_pct: 50 } })
    );
    expect(text).toBe("Bulk repriced 21 model(s) to 50% margin");
  });

  it("a bulk row's changes repeat the same field across models", () => {
    // The shape lib/admin/audit.ts actually writes for a bulk reprice. `field`
    // is NOT unique across entries, so any renderer keying on it alone collides
    // — the exact React duplicate-key defect found in review. No bulk row
    // existed in the database yet, so nothing caught it.
    const bulk = row({
      action: "admin.model_bulk_repriced",
      metadata: {
        models_updated: 2,
        target_margin_pct: 50,
        changes: [
          { model_id: "openai/gpt-4o", field: "output_cents_per_mtok", from: 1000, to: 2000 },
          { model_id: "openai/gpt-4o-mini", field: "output_cents_per_mtok", from: 60, to: 120 },
          { model_id: "openai/gpt-4o", field: "input_cents_per_mtok", from: 250, to: 500 },
        ],
      },
    });
    const changes = changesOf(bulk);
    expect(changes).toHaveLength(3);

    const byField = new Set(changes.map((c) => c.field));
    expect(byField.size).toBeLessThan(changes.length); // field alone is NOT unique

    // model_id + field + index is.
    const composite = new Set(
      changes.map((c, i) => `${(c as { model_id?: string }).model_id ?? ""}-${c.field}-${i}`)
    );
    expect(composite.size).toBe(changes.length);
  });

  it("falls back to action · target for anything it does not know", () => {
    expect(describeRow(row({ action: "collection.created", target_id: "col-1" }))).toBe("collection.created · col-1");
  });
});

describe("applyFilter", () => {
  const rows = [
    row({ id: "1", action: "admin.model_price_updated", org_id: null, target_id: "m1" }),
    row({ id: "2", action: "key.created", org_id: "org-1" }),
    row({ id: "3", action: "collection.created", org_id: "org-2", actor_user_id: "user-2" }),
  ];

  it("filters to staff actions only", () => {
    expect(applyFilter(rows, { scope: "admin" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("filters to one org — and a platform action belongs to none", () => {
    expect(applyFilter(rows, { orgId: "org-1" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("filters by actor and by sensitivity", () => {
    expect(applyFilter(rows, { actorUserId: "user-2" }).map((r) => r.id)).toEqual(["3"]);
    expect(applyFilter(rows, { sensitiveOnly: true }).map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("searches the rendered sentence, not just raw columns", () => {
    expect(applyFilter(rows, { search: "repriced" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("returns everything when nothing is filtered", () => {
    expect(applyFilter(rows, {})).toHaveLength(3);
    expect(applyFilter(rows, { scope: "any" })).toHaveLength(3);
  });
});

describe("summarize", () => {
  it("counts staff vs customer events, sensitivity and distinct actors", () => {
    const s = summarize([
      row({ action: "admin.key_revoked", actor_user_id: "a" }),
      row({ action: "key.created", actor_user_id: "b" }),
      row({ action: "collection.created", actor_user_id: "b" }),
      row({ action: "batch.completed", actor_user_id: null, actor_api_key_id: null }),
    ]);
    expect(s.total).toBe(4);
    expect(s.admin_events).toBe(1);
    expect(s.customer_events).toBe(3);
    expect(s.sensitive).toBe(2); // admin.key_revoked + key.created
    expect(s.distinct_actors).toBe(2);
    expect(s.system_events).toBe(1);
  });
});

describe("actionCounts", () => {
  it("ranks by frequency, then alphabetically for stable ordering", () => {
    const counts = actionCounts([
      row({ action: "key.created" }),
      row({ action: "key.created" }),
      row({ action: "collection.created" }),
      row({ action: "app.x" }),
    ]);
    expect(counts[0]).toEqual({ action: "key.created", count: 2 });
    expect(counts.slice(1).map((c) => c.action)).toEqual(["app.x", "collection.created"]);
  });
});
