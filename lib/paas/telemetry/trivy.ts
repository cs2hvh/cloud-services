/**
 * The image scan gate: deciding whether a built image may be published.
 *
 * THE FAILURE THIS IS DESIGNED AGAINST IS NOT A MISSED CVE. It is a gate that
 * reports "pass" when it did not actually scan anything.
 *
 * That is how image scanning is usually neutered in practice, and it is the
 * same shape as every other defect this lane has found today: an empty result
 * from a failed read is indistinguishable from a clean result, so the failure
 * mode of the safety control is to silently stop being one. A scanner that
 * crashed, timed out, could not resolve the image, or emitted output this code
 * does not understand has told us NOTHING — and nothing is not "no
 * vulnerabilities".
 *
 * So the verdict has three values, not two, and the third BLOCKS:
 *
 *   pass       — scanned, and nothing crossed the policy
 *   fail       — scanned, and something did
 *   undecided  — did not scan, or the output cannot be trusted. Blocks.
 *
 * THE TRAP INSIDE THE TRAP: Trivy returns `Results: []` when it cannot
 * identify the artifact, and a successful scan of a genuinely clean image
 * returns `Results: [{...}]` with the `Vulnerabilities` key ABSENT. Those two
 * are one character apart in the JSON and mean opposite things. Treating an
 * empty `Results` as clean is the specific bug that turns this file into
 * decoration, so it is `undecided` and there is a test pinning it.
 *
 * Pure. No network, no process spawning. The caller runs the scanner.
 */

export type Severity = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const RANK: Record<Severity, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * The publish policy, declared here rather than inherited from Trivy's
 * defaults.
 *
 * A default nobody chose is a policy nobody owns. Each number below is a
 * decision with an argument next to it, so disagreeing with it is a code
 * change somebody signs rather than a flag somebody forgets.
 */
export interface ScanPolicy {
  /** Blocks whatever the fix situation. */
  blockAtOrAbove: Severity;
  /**
   * Blocks only when the vulnerability HAS a fixed version available.
   *
   * The distinction matters more than the severity does. Blocking on an
   * unfixable HIGH means a tenant cannot ship at all and has no action
   * available — the upstream package has no patched release. The gate stops
   * being a quality bar and becomes an outage, and the first thing anyone
   * does is turn it off. Blocking on a FIXABLE high is a request the tenant
   * can actually satisfy.
   */
  blockFixableAtOrAbove: Severity;
}

/**
 * CRITICAL always; HIGH when a fix exists.
 *
 * Deliberately not "block everything at HIGH and above". At untrusted-signup
 * scale, base images carry unfixable HIGHs routinely, and a gate that blocks
 * them blocks every deploy on the platform within a week of a bad CVE
 * landing in glibc. This is the strictest policy that still leaves the tenant
 * something to do.
 */
export const DEFAULT_POLICY: ScanPolicy = {
  blockAtOrAbove: "CRITICAL",
  blockFixableAtOrAbove: "HIGH",
};

// ── what Trivy emits ────────────────────────────────────────────────────────

export interface TrivyVulnerability {
  VulnerabilityID?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
}

export interface TrivyResult {
  Target?: string;
  Class?: string;
  Type?: string;
  /** ABSENT on a clean target. Not the same as an absent Results array. */
  Vulnerabilities?: TrivyVulnerability[];
}

export interface TrivyReport {
  SchemaVersion?: number;
  ArtifactName?: string;
  Results?: TrivyResult[] | null;
}

export type Verdict = "pass" | "fail" | "undecided";

export interface Blocker {
  id: string;
  severity: Severity;
  pkg: string;
  installed: string;
  fixedIn: string | null;
  /** Which half of the policy caught it. */
  rule: "severity" | "fixable";
}

export interface ScanDecision {
  verdict: Verdict;
  /** True when the image may be published. Only ever true for `pass`. */
  allowed: boolean;
  blockers: Blocker[];
  /** Vulnerabilities seen but under the policy. Reported, not blocking. */
  observed: number;
  /** Why, in a sentence a build log can carry. */
  reason: string;
}

function severityOf(raw: string | undefined): Severity {
  const s = (raw ?? "").toUpperCase();
  return s === "CRITICAL" || s === "HIGH" || s === "MEDIUM" || s === "LOW" ? s : "UNKNOWN";
}

/**
 * A fixed version that is present and non-empty.
 *
 * Trivy emits `""` rather than omitting the key when no fix exists, so a
 * truthiness check on the key alone would treat every unfixable finding as
 * fixable and block the entire platform.
 */
function fixedVersion(v: TrivyVulnerability): string | null {
  const f = (v.FixedVersion ?? "").trim();
  return f === "" ? null : f;
}

export interface DecideInput {
  /** Parsed Trivy JSON, or null when the scan did not produce usable output. */
  report: TrivyReport | null;
  /** Non-zero exit, timeout, spawn failure — anything that means "did not run". */
  scannerError?: string | null;
  policy?: ScanPolicy;
}

export function decideScan(input: DecideInput): ScanDecision {
  const policy = input.policy ?? DEFAULT_POLICY;

  const undecided = (reason: string): ScanDecision => ({
    verdict: "undecided",
    allowed: false,
    blockers: [],
    observed: 0,
    reason,
  });

  // ── did it actually run? ──────────────────────────────────────────────────

  if (input.scannerError) {
    return undecided(
      `the scanner did not complete (${input.scannerError.slice(0, 200)}). ` +
        `A scan that failed to run is not a scan that passed.`,
    );
  }

  if (input.report === null || typeof input.report !== "object") {
    return undecided("the scanner produced no parseable output, so nothing was verified.");
  }

  const results = input.report.Results;

  if (results === null || results === undefined) {
    return undecided(
      "the scanner returned no Results at all, which means it did not identify the " +
        "artifact rather than that the artifact is clean.",
    );
  }

  if (!Array.isArray(results) || results.length === 0) {
    // THE TRAP. An empty Results is what Trivy emits when it cannot read the
    // image. A clean image yields a Results entry with no Vulnerabilities key.
    return undecided(
      "the scanner returned an empty Results array. Trivy emits this when it cannot " +
        "identify the artifact; a genuinely clean image yields a target with no " +
        "vulnerabilities listed. Empty is not clean.",
    );
  }

  // ── it ran; apply the policy ──────────────────────────────────────────────

  const blockers: Blocker[] = [];
  let observed = 0;

  for (const result of results) {
    for (const v of result.Vulnerabilities ?? []) {
      observed += 1;
      const severity = severityOf(v.Severity);
      const fixedIn = fixedVersion(v);

      const bySeverity = RANK[severity] >= RANK[policy.blockAtOrAbove];
      const byFixable = fixedIn !== null && RANK[severity] >= RANK[policy.blockFixableAtOrAbove];
      if (!bySeverity && !byFixable) continue;

      blockers.push({
        id: v.VulnerabilityID ?? "(unnamed)",
        severity,
        pkg: v.PkgName ?? "(unknown)",
        installed: v.InstalledVersion ?? "(unknown)",
        fixedIn,
        rule: bySeverity ? "severity" : "fixable",
      });
    }
  }

  if (blockers.length > 0) {
    const fixable = blockers.filter((b) => b.fixedIn !== null).length;
    return {
      verdict: "fail",
      allowed: false,
      blockers,
      observed,
      reason:
        `${blockers.length} vulnerabilit${blockers.length === 1 ? "y" : "ies"} cross the ` +
        `publish policy` +
        (fixable ? `, ${fixable} with a fixed version available` : "") +
        `.`,
    };
  }

  return {
    verdict: "pass",
    allowed: true,
    blockers: [],
    observed,
    reason:
      observed === 0
        ? `scanned ${results.length} target(s); no vulnerabilities found.`
        : `scanned ${results.length} target(s); ${observed} finding(s), none crossing the policy.`,
  };
}

/** One line for a build log, saying what the gate did and why. */
export function scanSummary(d: ScanDecision, policy: ScanPolicy = DEFAULT_POLICY): string {
  const gate =
    `policy: block ${policy.blockAtOrAbove}+, and ${policy.blockFixableAtOrAbove}+ when fixable`;
  return `scan ${d.verdict.toUpperCase()} — ${d.reason} (${gate})`;
}
