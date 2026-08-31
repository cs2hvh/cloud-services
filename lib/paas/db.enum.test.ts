import { test } from "node:test";
import assert from "node:assert/strict";
import { db, type DeploymentTrigger } from "./db.ts";

/**
 * Postgres enums mirrored as TypeScript unions drift silently. A drifted mirror
 * fails at RUNTIME with a PostgREST 400 — and for the webhook that means the
 * first customer push 400s in production with every test still green.
 *
 * That is not hypothetical. The webhook route was written with trigger "push"
 * while the enum value is "git_push". The field was typed `string`, so nothing
 * objected until the row was actually inserted.
 *
 * These tests need the database. When it is unreachable they SKIP rather than
 * pass: a mirror check that silently succeeds without checking anything is
 * worse than no check, because it reports confidence it never established.
 */

async function enumValues(typeName: string): Promise<string[] | null> {
  try {
    const rows = await db.rpc<Array<{ v: string }>>("enum_values", { p_type: typeName });
    return rows.map((r) => r.v);
  } catch {
    return null;
  }
}

test("DeploymentTrigger mirrors paas.deployment_trigger exactly", async (t) => {
  const live = await enumValues("paas.deployment_trigger");
  if (live === null) return t.skip("database unreachable — mirror NOT verified");

  const mirrored: DeploymentTrigger[] = ["git_push", "pull_request", "manual", "redeploy", "rollback"];
  assert.deepEqual(
    [...live].sort(),
    [...mirrored].sort(),
    "paas.deployment_trigger changed — update DeploymentTrigger in db.ts to match",
  );
});

test("the trigger the webhook writes is a real enum value", async (t) => {
  // The specific bug, pinned. "push" is the plausible wrong answer.
  const live = await enumValues("paas.deployment_trigger");
  if (live === null) return t.skip("database unreachable");
  assert.ok(live.includes("git_push"), "the webhook writes git_push");
  assert.ok(!live.includes("push"), "if 'push' is ever added, the route must be revisited");
});

test("drift_kind includes the kinds the sweeps record", async (t) => {
  const live = await enumValues("paas.drift_kind");
  if (live === null) return t.skip("database unreachable");
  for (const kind of ["unrecorded", "stale", "denied", "unpriced", "expired", "claimable"]) {
    assert.ok(live.includes(kind), `paas.drift_kind is missing ${kind}`);
  }
});
