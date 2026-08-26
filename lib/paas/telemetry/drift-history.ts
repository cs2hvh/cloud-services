/**
 * Persist drift findings, so "when did this appear and how long did it last"
 * becomes answerable.
 *
 * Drift detected once and corrected is invisible afterwards. That is the
 * difference between a report and a record: the $116.07/month gap existed for
 * an unknown length of time, and nobody can now say how long, because nothing
 * was writing it down. A recurrence looks identical to a first occurrence.
 *
 * `paas.record_drift` is idempotent for an OPEN observation — re-recording
 * something already open returns the existing id and does NOT reset
 * observed_at, so a sweep every five minutes measures duration rather than
 * restarting the clock. `paas.resolve_drift_not_in` closes anything no longer
 * seen. A recurrence after resolution is correctly a new row.
 *
 * MAPPING IS DELIBERATELY CONSERVATIVE. `paas.drift_kind` has four values and
 * my classifier has more states than that. Where a finding does not map
 * cleanly it is NOT recorded under an approximate kind — a history whose
 * categories are nearly right is worse than one with gaps, because the gaps
 * are visible and the approximations are not. What is skipped is listed in
 * `UNMAPPED` and reported by the caller.
 */

import type { Finding } from "./reconcile.ts";
import type { HostnameFinding } from "./dns-drift.ts";
import type { R2Finding } from "./r2-drift.ts";

export type DriftKind = "unrecorded" | "stale" | "denied" | "unpriced";

export interface Observation {
  kind: DriftKind;
  /** Free text, constrained to ^[a-z][a-z0-9_-]{0,40}$ by the schema. */
  resourceType: string;
  cloudId: string | null;
  ref: string | null;
  hourlyUsd: number | null;
  detail: string;
}

/**
 * Finding statuses with no honest home in `paas.drift_kind`.
 *
 * `expired` — a live build VM past its deadline. The row is CORRECT; the
 *   reaper failed. That is an operational failure, not a record-versus-reality
 *   mismatch, and calling it `stale` would say the control plane is lying when
 *   it is telling the truth.
 * `claimable` — a hostname resolving to the gateway with nothing routing it.
 *   A security finding, not a bookkeeping one. Recording it as `unrecorded`
 *   would bury the most serious thing this platform can detect under the
 *   heading used for untracked spend.
 */
export const UNMAPPED = ["expired", "claimable"] as const;

const FLEET_KIND: Record<string, DriftKind | null> = {
  unrecorded: "unrecorded",
  denied: "denied",
  phantom: "stale",
  // Row and cloud both exist and disagree on a field: the control plane's
  // record is wrong, which is what `stale` means.
  mismatched: "stale",
  expired: null,
  reserved: null, // benign by design — this is RECORD BEFORE CREATE working
  foreign: null, // not ours
  tracked: null,
};

/** `resource_type` values this module writes. Kept short and stable. */
export function fleetResourceType(kind: Finding["kind"]): string {
  switch (kind) {
    case "lke":
      return "lke_cluster";
    case "build-vm":
    case "build-vm-row":
      return "build_vm";
    case "cluster-row":
      return "lke_cluster";
    case "nodebalancer":
      return "nodebalancer";
    default:
      return "instance";
  }
}

export function observationsFromFleet(findings: Finding[], unpriced: string[]): Observation[] {
  const out: Observation[] = [];

  for (const f of findings) {
    const kind = FLEET_KIND[f.status] ?? null;
    if (!kind) continue;
    out.push({
      kind,
      resourceType: fleetResourceType(f.kind),
      cloudId: f.cloudId === null ? null : String(f.cloudId),
      ref: f.ref,
      hourlyUsd: f.hourly,
      detail: f.detail,
    });
  }

  // A resource found but unpriced is its own finding. A cost report that
  // silently prices it at zero is worse than one that says it does not know,
  // and the history should show how long we were flying blind on it.
  for (const u of unpriced) {
    out.push({
      kind: "unpriced",
      resourceType: "instance",
      cloudId: null,
      ref: u.slice(0, 200),
      hourlyUsd: null,
      detail: `no price in /linode/types: ${u}`,
    });
  }

  return out;
}

export function observationsFromHostnames(findings: HostnameFinding[]): Observation[] {
  const out: Observation[] = [];

  for (const f of findings) {
    // `claimable` is skipped on purpose — see UNMAPPED.
    const kind: DriftKind | null =
      f.status === "unrecorded" ? "unrecorded" : f.status === "phantom" ? "stale" : null;
    if (!kind) continue;

    out.push({
      kind,
      resourceType: "hostname",
      cloudId: f.recordId,
      ref: f.ref ?? f.hostname,
      hourlyUsd: null,
      detail: `${f.hostname}: ${f.detail}`,
    });
  }

  return out;
}

export function observationsFromR2(findings: R2Finding[]): Observation[] {
  return findings
    .filter((f) => f.disposition === "orphan")
    .map((f) => ({
      kind: "unrecorded" as DriftKind,
      resourceType: "r2_object",
      cloudId: null,
      ref: f.key.slice(0, 200),
      hourlyUsd: null,
      detail: f.detail,
    }));
}

/** Identity `resolve_drift_not_in` matches on: `coalesce(cloud_id, ref)`. */
export function identityOf(o: Observation): string {
  return o.cloudId ?? o.ref ?? "";
}

export interface SweepScope {
  kind: DriftKind;
  resourceType: string;
}

/**
 * Every (kind, resourceType) pair a sweep is AUTHORITATIVE for.
 *
 * Declared rather than derived from the findings, and that is the whole
 * subtlety here. Deriving them means a sweep that finds nothing produces no
 * groups, so nothing is ever resolved — drift would be recorded the moment it
 * appears and stay open forever, including long after it was fixed. A history
 * showing every problem the platform has ever had as still unresolved is the
 * same as showing nothing.
 */
export const FLEET_SCOPE: SweepScope[] = [
  { kind: "unrecorded", resourceType: "lke_cluster" },
  { kind: "unrecorded", resourceType: "build_vm" },
  { kind: "unrecorded", resourceType: "instance" },
  { kind: "unrecorded", resourceType: "nodebalancer" },
  { kind: "stale", resourceType: "lke_cluster" },
  { kind: "stale", resourceType: "build_vm" },
  { kind: "denied", resourceType: "lke_cluster" },
  { kind: "denied", resourceType: "build_vm" },
  { kind: "unpriced", resourceType: "instance" },
];

export const HOSTNAME_SCOPE: SweepScope[] = [
  { kind: "unrecorded", resourceType: "hostname" },
  { kind: "stale", resourceType: "hostname" },
];

export const R2_SCOPE: SweepScope[] = [{ kind: "unrecorded", resourceType: "r2_object" }];

/**
 * Pair each scoped (kind, resourceType) with the identities still seen for it.
 *
 * Resolution MUST be scoped to BOTH fields. Calling resolve_drift_not_in for
 * kind `unrecorded` with only the hostnames still open would close every
 * unrecorded CLUSTER too, because they share a kind — the sweep would silently
 * mark real, ongoing, money-costing drift as fixed. That is why the RPC takes
 * a resource_type, and why a caller must pass its own scope and nobody else's.
 */
export function groupForResolve(
  observations: Observation[],
  scope: SweepScope[],
): Array<{ kind: DriftKind; resourceType: string; stillOpen: string[] }> {
  return scope.map((s) => ({
    kind: s.kind,
    resourceType: s.resourceType,
    stillOpen: observations
      .filter((o) => o.kind === s.kind && o.resourceType === s.resourceType)
      .map(identityOf),
  }));
}

