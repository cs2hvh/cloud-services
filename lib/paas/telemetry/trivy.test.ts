/**
 * Image scan gate tests.
 *
 *   node --test lib/paas/telemetry/trivy.test.ts
 *
 * Most of these are about the gate REFUSING to say pass. A scanner that
 * crashed and a clean image produce outputs one character apart, and getting
 * that wrong turns the whole control into decoration that reports green.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  decideScan,
  scanSummary,
  type TrivyReport,
  type TrivyVulnerability,
} from "./trivy.ts";

function vuln(over: Partial<TrivyVulnerability> = {}): TrivyVulnerability {
  return {
    VulnerabilityID: "CVE-2026-0001",
    PkgName: "openssl",
    InstalledVersion: "3.0.1",
    FixedVersion: "3.0.2",
    Severity: "HIGH",
    ...over,
  };
}

function report(vulns: TrivyVulnerability[] = []): TrivyReport {
  return {
    SchemaVersion: 2,
    ArtifactName: "registry.svc/app@sha256:abc",
    // A scanned target with findings; when clean, Vulnerabilities is ABSENT.
    Results: [{ Target: "app (alpine 3.19)", Class: "os-pkgs", ...(vulns.length ? { Vulnerabilities: vulns } : {}) }],
  };
}

// ── a scan that did not happen is never a pass ──────────────────────────────

test("a scanner error blocks, and says a failed scan is not a passed one", () => {
  const d = decideScan({ report: null, scannerError: "exit 137: OOMKilled" });

  assert.equal(d.verdict, "undecided");
  assert.equal(d.allowed, false);
  assert.match(d.reason, /did not complete/);
  assert.match(d.reason, /not a scan that passed/);
});

test("unparseable output blocks", () => {
  assert.equal(decideScan({ report: null }).verdict, "undecided");
  assert.equal(decideScan({ report: undefined as never }).verdict, "undecided");
});

test("no Results key at all blocks — it means the artifact was not identified", () => {
  assert.equal(decideScan({ report: { SchemaVersion: 2 } }).verdict, "undecided");
  assert.equal(decideScan({ report: { Results: null } }).verdict, "undecided");
});

test("an EMPTY Results array blocks, because empty is not clean", () => {
  // The trap inside the trap. Trivy emits Results: [] when it cannot identify
  // the image; a genuinely clean image emits a target with no Vulnerabilities
  // key. One character apart, opposite meanings, and reading empty as clean is
  // the specific bug that turns this file into decoration.
  const d = decideScan({ report: { SchemaVersion: 2, Results: [] } });

  assert.equal(d.verdict, "undecided");
  assert.equal(d.allowed, false);
  assert.match(d.reason, /Empty is not clean/);
});

test("a CLEAN image passes — a target present, no Vulnerabilities key", () => {
  const d = decideScan({ report: report([]) });

  assert.equal(d.verdict, "pass");
  assert.equal(d.allowed, true);
  assert.equal(d.observed, 0);
  assert.match(d.reason, /no vulnerabilities found/);
});

test("undecided is never allowed, whatever caused it", () => {
  for (const input of [
    { report: null, scannerError: "timeout" },
    { report: null },
    { report: { Results: [] } },
    { report: { Results: null } },
  ]) {
    assert.equal(decideScan(input).allowed, false, JSON.stringify(input));
  }
});

// ── the policy, and why it is what it is ────────────────────────────────────

test("a CRITICAL blocks whether or not a fix exists", () => {
  const fixable = decideScan({ report: report([vuln({ Severity: "CRITICAL" })]) });
  const unfixable = decideScan({
    report: report([vuln({ Severity: "CRITICAL", FixedVersion: "" })]),
  });

  assert.equal(fixable.verdict, "fail");
  assert.equal(unfixable.verdict, "fail");
  assert.equal(unfixable.blockers[0].rule, "severity");
});

test("a FIXABLE high blocks — the tenant has something they can do", () => {
  const d = decideScan({ report: report([vuln({ Severity: "HIGH", FixedVersion: "3.0.2" })]) });

  assert.equal(d.verdict, "fail");
  assert.equal(d.blockers[0].rule, "fixable");
  assert.equal(d.blockers[0].fixedIn, "3.0.2");
  assert.match(d.reason, /with a fixed version available/);
});

test("an UNFIXABLE high passes, and that is the deliberate choice", () => {
  // Base images carry unfixable HIGHs routinely. Blocking them blocks every
  // deploy on the platform within a week of a bad CVE landing in glibc, the
  // tenant has no action available, and the first thing anyone does is turn
  // the gate off. A gate that gets disabled protects nothing.
  const d = decideScan({ report: report([vuln({ Severity: "HIGH", FixedVersion: "" })]) });

  assert.equal(d.verdict, "pass");
  assert.equal(d.allowed, true);
  assert.equal(d.observed, 1, "seen and reported, just not blocking");
});

test("FixedVersion is empty-string when absent, not missing — truthiness alone would misread it", () => {
  // Trivy emits "" rather than omitting the key. Treating the key's presence
  // as "fixable" would block every unfixable finding and take the platform
  // down.
  const empty = decideScan({ report: report([vuln({ Severity: "HIGH", FixedVersion: "" })]) });
  const whitespace = decideScan({ report: report([vuln({ Severity: "HIGH", FixedVersion: "  " })]) });
  const absent = decideScan({ report: report([vuln({ Severity: "HIGH", FixedVersion: undefined })]) });

  for (const d of [empty, whitespace, absent]) assert.equal(d.verdict, "pass");
});

test("MEDIUM and below do not block under the default policy", () => {
  const d = decideScan({
    report: report([
      vuln({ Severity: "MEDIUM" }),
      vuln({ Severity: "LOW" }),
      vuln({ Severity: "UNKNOWN" }),
    ]),
  });

  assert.equal(d.verdict, "pass");
  assert.equal(d.observed, 3, "counted and reported");
  assert.match(d.reason, /none crossing the policy/);
});

test("an unrecognised severity string is UNKNOWN, not silently high or low", () => {
  const d = decideScan({ report: report([vuln({ Severity: "SEVERE" })]) });
  assert.equal(d.verdict, "pass");
  assert.equal(d.observed, 1);
});

test("the policy is overridable, because it is a decision and not a constant", () => {
  const strict = decideScan({
    report: report([vuln({ Severity: "MEDIUM", FixedVersion: "1.2.3" })]),
    policy: { blockAtOrAbove: "HIGH", blockFixableAtOrAbove: "MEDIUM" },
  });

  assert.equal(strict.verdict, "fail");
  assert.equal(strict.blockers[0].rule, "fixable");
});

// ── shape ───────────────────────────────────────────────────────────────────

test("blockers carry what a tenant needs to act", () => {
  const d = decideScan({
    report: report([
      vuln({ VulnerabilityID: "CVE-2026-9999", PkgName: "zlib", InstalledVersion: "1.2.11", FixedVersion: "1.2.12", Severity: "CRITICAL" }),
    ]),
  });

  assert.deepEqual(d.blockers[0], {
    id: "CVE-2026-9999",
    severity: "CRITICAL",
    pkg: "zlib",
    installed: "1.2.11",
    fixedIn: "1.2.12",
    rule: "severity",
  });
});

test("findings across multiple targets are all considered", () => {
  const d = decideScan({
    report: {
      SchemaVersion: 2,
      Results: [
        { Target: "os", Vulnerabilities: [vuln({ Severity: "LOW" })] },
        { Target: "node_modules", Vulnerabilities: [vuln({ Severity: "CRITICAL" })] },
      ],
    },
  });

  assert.equal(d.verdict, "fail");
  assert.equal(d.observed, 2);
  assert.equal(d.blockers.length, 1);
});

test("the summary states the policy, so a build log records what it was judged against", () => {
  const s = scanSummary(decideScan({ report: report([]) }), DEFAULT_POLICY);

  assert.match(s, /^scan PASS/);
  assert.match(s, /block CRITICAL\+/);
  assert.match(s, /HIGH\+ when fixable/);
});
