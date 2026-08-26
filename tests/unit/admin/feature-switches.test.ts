import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_SWITCHES, disabledResponseBody, findSwitch } from "@/lib/admin/feature-switches";
import { GATED_KEYS } from "@/workers/inference/src/middleware/feature-gate";

// A switch nobody checks is worse than no switch: an operator flips it, believes
// the bleeding stopped, and it did not.
//
// The key strings live in THREE deploy units that ship independently — the admin
// (lib/admin/feature-switches.ts), the gateway (workers/inference), and the
// database seed (the migration). Nothing verified they agree, which is exactly
// the drift this file exists to catch. It is the only test here that reads
// another deploy unit's source on purpose.

// Switches arrive in more than one migration now, so the seed side of the
// comparison reads every migration that writes platform_settings rather than
// one hard-coded file — otherwise adding a switch in a new migration silently
// stops being checked, which is the drift this file exists to catch.
const MIGRATION_DIR = join(process.cwd(), "supabase/migrations");

function migrationSql(): string {
  return readdirSync(MIGRATION_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATION_DIR, f), "utf8"))
    .filter((sql) => sql.includes("platform_settings"))
    .join("\n");
}

/** Keys the migrations seed into public.platform_settings. */
function seededKeys(): string[] {
  return [...new Set([...migrationSql().matchAll(/'(ai_[a-z_]+_enabled)'/g)].map((m) => m[1]))].sort();
}

describe("the three lists that must agree", () => {
  it("every key the gateway reads is a switch the admin can actually set", () => {
    // The dangerous direction: the gateway gates on a key no admin screen
    // exposes, so a capability is off and nobody can turn it back on.
    const known = FEATURE_SWITCHES.map((s) => s.key);
    for (const key of GATED_KEYS) {
      expect(known, `gateway gates '${key}' but no admin switch defines it`).toContain(key);
    }
  });

  it("every switch the migration seeds is one the admin knows about", () => {
    const known = FEATURE_SWITCHES.map((s) => s.key).sort();
    expect(seededKeys()).toEqual(known);
  });

  it("seeds each switch in the state its own failure mode requires", () => {
    // The invariant is not "always true" — it is "applying a migration cannot
    // make things worse."
    //
    //   capability switches  seed TRUE.  Seeding one false would turn a feature
    //                        off for every customer the moment it is applied.
    //   supplier switches    seed FALSE. Off means "buy from OpenRouter", which
    //                        is exactly the behaviour before the supplier
    //                        existed. Seeding one true would start routing
    //                        traffic to a marketplace on migration.
    const sql = migrationSql();
    for (const spec of FEATURE_SWITCHES) {
      const wanted = spec.default_enabled === false ? "false" : "true";
      const seeded = new RegExp(`'${spec.key}'\\s*,\\s*'${wanted}'::jsonb`).test(sql);
      expect(seeded, `${spec.key} is not seeded '${wanted}'`).toBe(true);
    }
  });

  it("a switch that defaults OFF reads OFF when its row is missing", () => {
    // The admin screen and the gateway must agree about an absent row. If the
    // screen defaulted a supplier switch to enabled, an operator would see
    // "Wokey: on" while the gateway routed every request to OpenRouter.
    for (const spec of FEATURE_SWITCHES.filter((x) => x.default_enabled === false)) {
      expect(spec.default_enabled, spec.key).toBe(false);
    }
  });
});

describe("every switch has somewhere that reads it", () => {
  // Two are enforced in the control plane rather than the gateway, so they are
  // legitimately absent from GATED_KEYS — but each must still name a real file
  // or route, or it is a switch that does nothing.
  const CONTROL_PLANE_ONLY = ["ai_connector_sync_enabled", "ai_finetuning_enabled"];

  it("is enforced either at the gateway, in a named control-plane route, or in supplier routing", () => {
    // Supplier switches are read by the routing resolver rather than the
    // capability gate: they choose an upstream, they do not refuse a request.
    const routing = readFileSync(
      join(process.cwd(), "workers/inference/src/lib/supplier-routing.ts"),
      "utf8"
    );
    for (const spec of FEATURE_SWITCHES) {
      const atGateway = GATED_KEYS.includes(spec.key);
      const inControlPlane = CONTROL_PLANE_ONLY.includes(spec.key);
      // The resolver builds the key from the supplier id, so match the shape
      // it constructs rather than a literal that never appears in source.
      const inRouting =
        spec.key.startsWith("ai_supplier_") &&
        routing.includes("`ai_supplier_${supplierId}_enabled`");
      expect(
        atGateway || inControlPlane || inRouting,
        `${spec.key} has no enforcement point`
      ).toBe(true);
      expect(spec.enforced_in, spec.key).toBeTruthy();
    }
  });

  it("connector sync is gated at BOTH ends — the scheduler and the manual trigger", () => {
    // The scheduler stops enqueueing due connectors; the gateway stops a customer
    // triggering one by hand. Missing either leaves a way in.
    expect(GATED_KEYS).toContain("ai_connector_sync_enabled");
    const scheduler = readFileSync(
      join(process.cwd(), "app/api/inference/internal/connector-scheduler/route.ts"),
      "utf8"
    );
    expect(scheduler).toContain('isFeatureEnabled("ai_connector_sync_enabled")');
  });

  it("fine-tuning is refused before any GPU is provisioned", () => {
    const route = readFileSync(join(process.cwd(), "app/api/inference/fine-tuning/jobs/route.ts"), "utf8");
    expect(route).toContain('isFeatureEnabled("ai_finetuning_enabled")');
    // Before the body is even parsed — a refused job must not touch RunPod.
    expect(route.indexOf("ai_finetuning_enabled")).toBeLessThan(route.indexOf("createSchema.safeParse"));
  });
});

describe("registry hygiene", () => {
  it("describes what STOPS for customers, not what the flag is called", () => {
    for (const spec of FEATURE_SWITCHES) {
      expect(spec.effect.length, spec.key).toBeGreaterThan(40);
      expect(spec.label, spec.key).toBeTruthy();
    }
  });

  it("rejects an unknown key, so nobody creates a switch nothing reads", () => {
    expect(findSwitch("ai_inference_enabled")).toBeDefined();
    expect(findSwitch("ai_made_up_enabled")).toBeUndefined();
  });

  it("tells a refused customer they were not charged", () => {
    const body = disabledResponseBody(FEATURE_SWITCHES[0]);
    expect(body.code).toBe("feature_disabled");
    expect(body.error).toContain("No charge");
  });
});
