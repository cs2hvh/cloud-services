/**
 * Test-only: the sweeps' ClusterRole may never grant a write verb.
 *
 * WHY THIS IS A TEST. The deploy lane granted the preview reaper cluster access
 * so it could tell a running pod from an idle one, and recorded "this sweep
 * must never gain write access" as a note in the job definition. A note is an
 * assertion. This lane's whole argument is that a rule which can be enforced
 * should be, because the thing that erodes a note is a reasonable-looking edit
 * six months later that nobody reviews against a comment.
 *
 * THE ASYMMETRY THAT MAKES IT WORTH ENFORCING. Every sweep is a reporter: it
 * reads the world and prints a finding, and a person decides. The reap sweeps
 * name resources a `delete` verb would destroy — pods, deployments, preview
 * environments — so a single added verb turns the least trusted code in the
 * system, running unattended on a schedule against every namespace, into
 * something that can act on its own classifications. `r2-reap.ts` has no
 * `--apply` for the same reason; this is that decision expressed in RBAC.
 *
 * Read from `sweeps.ts` rather than from the live cluster on purpose. The
 * cluster is what IS true and drifts back on the next apply; the source is what
 * WILL be true, and that is the thing to hold.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepClusterRole, sweepClusterRoleBinding, SWEEP_JOBS } from "../k8s/sweeps.ts";

/** Anything that can change the world. `*` included — it grants all of these. */
const WRITE_VERBS = new Set(["create", "update", "patch", "delete", "deletecollection", "*"]);

test("the sweep ClusterRole grants no write verb on anything", () => {
  const role = sweepClusterRole();
  const offenders: string[] = [];

  for (const rule of role.rules) {
    for (const verb of rule.verbs) {
      if (WRITE_VERBS.has(verb.toLowerCase())) {
        offenders.push(`${rule.resources.join(",")}: ${verb}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `the sweeps run unattended against every namespace and only ever report — a write verb here ` +
      `lets a classification act on itself:\n  ${offenders.join("\n  ")}`,
  );
});

test("the role has rules at all, so the check is not passing on an empty list", () => {
  // Every assertion above is a search over `rules`. An empty list satisfies all
  // of them, which would make this suite decorative while reporting green —
  // the exact failure this lane keeps finding.
  const role = sweepClusterRole();
  assert.ok(role.rules.length >= 4, `expected the read rules, found ${role.rules.length}`);
  for (const rule of role.rules) {
    assert.ok(rule.verbs.length > 0, `${rule.resources.join(",")} has no verbs`);
    assert.ok(rule.resources.length > 0, "a rule with no resources grants nothing and hides a mistake");
  }
});

test("the checker detects a write verb it has to walk the rules to find", () => {
  // Proves the matcher works rather than trusting that a clean run means clean.
  const planted = [
    { resources: ["pods"], verbs: ["get", "list"] },
    { resources: ["deployments"], verbs: ["get", "delete"] },
  ];
  const hits = planted.flatMap((r) => r.verbs.filter((v) => WRITE_VERBS.has(v)).map((v) => `${r.resources[0]}: ${v}`));
  assert.deepEqual(hits, ["deployments: delete"]);
});

test("a wildcard verb is caught, not just the named ones", () => {
  // `*` is the spelling most likely to arrive from a copied example, and it
  // grants every verb above without naming any of them.
  assert.ok(WRITE_VERBS.has("*"));
});

test("only sweeps that declare k8s are bound to the role", () => {
  // The binding is the other half of least privilege: a sweep that never talks
  // to the cluster must not carry cluster credentials because it sits in the
  // same list.
  const binding = sweepClusterRoleBinding(SWEEP_JOBS);
  const boundNames = new Set(binding.subjects.map((s) => s.name));

  for (const job of SWEEP_JOBS) {
    const shouldBind = job.needs.includes("k8s");
    assert.equal(
      boundNames.has(`sweep-${job.name}`),
      shouldBind,
      `sweep-${job.name} declares needs=[${job.needs.join(",")}] but is ${shouldBind ? "not " : ""}bound`,
    );
  }
});

test("the binding points at the role this file checks", () => {
  // A binding naming a different role would leave the checked role unused and
  // the real one unexamined.
  const role = sweepClusterRole();
  const binding = sweepClusterRoleBinding(SWEEP_JOBS);
  assert.equal(binding.roleRef.name, role.metadata.name);
  assert.equal(binding.roleRef.kind, "ClusterRole");
});

test("every sweep that reads the cluster is actually bound to something", () => {
  // The failure this catches is a sweep granted k8s in its definition and
  // omitted from the binding: it would run, fail on every API call, and — if
  // its own error handling were generous — report an empty world.
  const binding = sweepClusterRoleBinding(SWEEP_JOBS);
  const needK8s = SWEEP_JOBS.filter((j) => j.needs.includes("k8s"));
  assert.ok(needK8s.length > 0, "no sweep declares k8s — this check would pass vacuously");
  assert.equal(binding.subjects.length, needK8s.length);
});
