import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

const MIGRATION = join(process.cwd(), "supabase/migrations/20260804000001_ai_admin_operations.sql");

/** Keys the migration seeds into public.platform_settings. */
function seededKeys(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  return [...new Set([...sql.matchAll(/'(ai_[a-z_]+_enabled)'/g)].map((m) => m[1]))].sort();
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

  it("seeds every switch ENABLED, so applying the migration cannot take the platform down", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    for (const spec of FEATURE_SWITCHES) {
      // Each seed row is `('key', 'true'::jsonb)`.
      const seeded = new RegExp(`'${spec.key}'\\s*,\\s*'true'::jsonb`).test(sql);
      expect(seeded, `${spec.key} is not seeded 'true'`).toBe(true);
    }
  });
});

describe("every switch has somewhere that reads it", () => {
  // Two are enforced in the control plane rather than the gateway, so they are
  // legitimately absent from GATED_KEYS — but each must still name a real file
  // or route, or it is a switch that does nothing.
  const CONTROL_PLANE_ONLY = ["ai_connector_sync_enabled", "ai_finetuning_enabled"];

  it("is enforced either at the gateway or in a named control-plane route", () => {
    for (const spec of FEATURE_SWITCHES) {
      const atGateway = GATED_KEYS.includes(spec.key);
      const inControlPlane = CONTROL_PLANE_ONLY.includes(spec.key);
      expect(atGateway || inControlPlane, `${spec.key} has no enforcement point`).toBe(true);
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
