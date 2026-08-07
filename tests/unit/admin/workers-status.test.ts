import { describe, it, expect } from "vitest";
import {
  STATUS,
  TONE_CLASS,
  DOT_CLASS,
  attentionStatuses,
  humanMs,
  humanSince,
  needsAttention,
  presentationFor,
  probeVantageWarning,
  unconfirmedCount,
  unknownMeaning,
  vantageSuspect,
} from "@/components/admin/inference-workers/status";
import type { FleetStatus } from "@/lib/admin/fleet";

// Doc: nextstespsAI/21-admin-platform.md (§8). The presentation layer carries a
// real rule, not just styling: a state we could not determine must never be
// painted as a failure, or an operator learns to ignore the page.

const ALL: FleetStatus[] = [
  "working", "idle", "degraded", "backed_up", "not_ticking", "down", "not_deployed", "unknown",
];

describe("STATUS coverage", () => {
  it("every fleet status has a presentation — a missing one would render blank", () => {
    for (const s of ALL) {
      expect(STATUS[s], s).toBeDefined();
      expect(STATUS[s].label.length).toBeGreaterThan(0);
      expect(STATUS[s].meaning.length).toBeGreaterThan(0);
    }
    expect(Object.keys(STATUS).sort()).toEqual([...ALL].sort());
  });

  it("every tone has both a badge class and a dot class", () => {
    for (const s of ALL) {
      expect(TONE_CLASS[STATUS[s].tone], s).toBeTruthy();
      expect(DOT_CLASS[STATUS[s].tone], s).toBeTruthy();
    }
  });

  it("every state that needs a human carries an action, and healthy states do not", () => {
    for (const s of ALL) {
      const p = STATUS[s];
      if (p.tone === "bad" || p.tone === "warn") expect(p.action, s).toBeTruthy();
      if (p.tone === "good") expect(p.action, s).toBeNull();
    }
  });
});

describe("undeterminable states must not read as failures", () => {
  it("'unknown' is muted, not red — it means we did not check, not that it is broken", () => {
    expect(STATUS.unknown.tone).toBe("muted");
    expect(needsAttention("unknown")).toBe(false);
    expect(STATUS.unknown.label).not.toMatch(/down|fail|error/i);
    expect(STATUS.unknown.meaning).toMatch(/not a fault/i);
  });

  it("'not_deployed' is muted too — nothing to fix if it was never rolled out", () => {
    expect(STATUS.not_deployed.tone).toBe("muted");
    expect(needsAttention("not_deployed")).toBe(false);
  });

  it("a fleet that is entirely un-probed produces ZERO attention rows", () => {
    // The failure mode this guards: six red rows on an undeployed fleet.
    const fleet: FleetStatus[] = ["unknown", "unknown", "unknown", "unknown", "unknown", "not_deployed"];
    expect(fleet.filter(needsAttention)).toHaveLength(0);
  });

  it("but the states that DO need action are flagged", () => {
    expect(needsAttention("degraded")).toBe(true);
    expect(needsAttention("not_ticking")).toBe(true);
    expect(needsAttention("down")).toBe(true);
    expect(needsAttention("backed_up")).toBe(true);
    expect(needsAttention("working")).toBe(false);
    expect(needsAttention("idle")).toBe(false);
  });

  it("'idle' is explicitly described as healthy — an operator must not read it as stalled", () => {
    expect(STATUS.idle.tone).toBe("good");
    expect(STATUS.idle.meaning).toMatch(/healthy/i);
  });

  it("'not_ticking' says k8s will not save you — that is the whole point of the state", () => {
    expect(STATUS.not_ticking.meaning).toMatch(/kubernetes/i);
    expect(STATUS.not_ticking.action).toMatch(/restart/i);
  });
});

describe("probeVantageWarning — a probe from the wrong place is not an outage", () => {
  it("warns when a forced probe reports most of the fleet unreachable", () => {
    // The real 2026-07-30 result of pressing "Probe health" from a laptop: three
    // accurate 'Not checked' rows became three false 'Down' rows.
    const w = probeVantageWarning(["down", "down", "down", "not_deployed", "degraded", "idle"], true);
    expect(w).toMatch(/only reachable from inside the cluster/i);
    expect(w).toMatch(/not proof of an outage/i);
    expect(w).toContain("4 of 6");
  });

  it("stays silent when ONE runner is down and the rest answer — that is a real outage", () => {
    expect(probeVantageWarning(["down", "idle", "idle", "working", "idle", "idle"], true)).toBeNull();
  });

  it("stays silent when unreachable does not outnumber reachable", () => {
    // 3 down vs 3 answering is ambiguous; explaining it away would hide an outage.
    expect(probeVantageWarning(["down", "down", "down", "idle", "idle", "working"], true)).toBeNull();
  });

  it("never appears when probing is off — there is nothing to explain", () => {
    expect(probeVantageWarning(["unknown", "unknown", "unknown", "unknown"], false)).toBeNull();
    expect(probeVantageWarning(["down", "down", "down", "down"], false)).toBeNull();
  });

  it("handles an empty fleet without throwing", () => {
    expect(probeVantageWarning([], true)).toBeNull();
  });

  it("'unknown' rows do not count as reachable — they were not probed at all", () => {
    // media is never probed; it must not dilute the majority test either way.
    expect(probeVantageWarning(["down", "down", "down", "unknown"], true)).toMatch(/3 of 4/);
  });
});

describe("unknownMeaning — 'Not checked' has two different causes", () => {
  it("a runner with NO /health says so, and never claims probing is off", () => {
    // The bug: media landed on `unknown` while probing was ENABLED, and the
    // static text told the operator "health probing is off" on a server where it
    // was on. Observed in the rendered page 2026-07-30.
    const m = unknownMeaning(false, true);
    expect(m).toMatch(/no \/health endpoint/i);
    expect(m).not.toMatch(/probing is off/i);
    expect(m).toMatch(/never be confirmed/i);
    expect(m).toMatch(/not a fault/i);
  });

  it("says the same thing whether or not probing happens to be on", () => {
    // Un-probeable is a permanent fact about the runner, not about this check.
    expect(unknownMeaning(false, true)).toBe(unknownMeaning(false, false));
  });

  it("a probeable runner with probing OFF gets the 'probing is off' wording", () => {
    expect(unknownMeaning(true, false)).toMatch(/probing is off/i);
  });

  it("a probeable runner with probing ON says its endpoint was not reached", () => {
    const m = unknownMeaning(true, true);
    expect(m).not.toMatch(/probing is off/i);
    expect(m).toMatch(/not reached/i);
  });

  it("every variant still reassures that it is not a fault", () => {
    for (const [pr, on] of [[false, true], [false, false], [true, true], [true, false]] as const) {
      expect(unknownMeaning(pr, on), `${pr}/${on}`).toMatch(/not a fault/i);
    }
  });
});

describe("the summary cards must agree with the vantage warning", () => {
  // Observed 2026-07-30 after pressing "Probe health" from a laptop: the banner
  // said "not proof of an outage" while the headline card said "Needs attention 4"
  // and "2 cannot be confirmed" when 5 runners had failed to answer. The page
  // contradicted itself in two places at once.
  const LAPTOP_PROBE: FleetStatus[] = ["down", "down", "down", "down", "not_deployed", "unknown"];

  it("a vantage-suspect run raises the warning", () => {
    expect(vantageSuspect(LAPTOP_PROBE, true)).toBe(true);
    expect(probeVantageWarning(LAPTOP_PROBE, true)).toContain("5 of 6");
  });

  it("does NOT count unreachable rows as needing attention — that was the contradiction", () => {
    expect(attentionStatuses(LAPTOP_PROBE, true)).toEqual([]);
  });

  it("counts every runner it could not confirm, not just the un-probed ones", () => {
    // 4 down + 1 not_deployed + 1 unknown = 6, not the 2 it used to report.
    expect(unconfirmedCount(LAPTOP_PROBE, true)).toBe(6);
  });

  it("queue-derived problems still count during a vantage-suspect run", () => {
    // Stuck jobs come from the database, so where we probed from is irrelevant.
    const withStuck: FleetStatus[] = ["down", "down", "down", "degraded", "not_deployed"];
    expect(vantageSuspect(withStuck, true)).toBe(true);
    expect(attentionStatuses(withStuck, true)).toEqual(["degraded"]);
  });

  it("backed_up and not_ticking are also kept — both are real regardless of vantage", () => {
    const mixed: FleetStatus[] = ["down", "down", "down", "backed_up", "not_ticking"];
    expect(attentionStatuses(mixed, true)).toEqual(["backed_up", "not_ticking"]);
  });

  it("a REAL single outage is still counted and not explained away", () => {
    const realOutage: FleetStatus[] = ["down", "idle", "idle", "working", "idle", "idle"];
    expect(vantageSuspect(realOutage, true)).toBe(false);
    expect(attentionStatuses(realOutage, true)).toEqual(["down"]);
    expect(unconfirmedCount(realOutage, true)).toBe(0);
  });

  it("with probing off, nothing is suspect and unknown rows are simply unconfirmed", () => {
    const derived: FleetStatus[] = ["unknown", "unknown", "unknown", "unknown", "unknown", "degraded"];
    expect(vantageSuspect(derived, false)).toBe(false);
    expect(attentionStatuses(derived, false)).toEqual(["degraded"]);
    expect(unconfirmedCount(derived, false)).toBe(5);
  });
});

describe("humanMs", () => {
  it("scales units instead of printing raw milliseconds", () => {
    expect(humanMs(704)).toBe("704ms");
    expect(humanMs(3_000)).toBe("3s");
    expect(humanMs(250_710)).toBe("4m"); // the real not_ticking reading
    expect(humanMs(7_200_000)).toBe("2h");
    expect(humanMs(30 * 24 * 3_600_000)).toBe("30d");
  });

  it("null renders as an em dash, not '0ms' or 'NaN'", () => {
    expect(humanMs(null)).toBe("—");
  });
});

describe("humanSince", () => {
  const NOW = Date.parse("2026-07-30T12:00:00Z");

  it("reads as an age", () => {
    expect(humanSince("2026-07-30T11:59:30Z", NOW)).toBe("30s ago");
    // Minutes are kept until 90 rather than switching at 60, so an hour reads
    // "60m ago". Deliberate: it avoids collapsing 61–89 minutes to a flat "1h".
    expect(humanSince("2026-07-30T11:00:00Z", NOW)).toBe("60m ago");
    expect(humanSince("2026-07-30T10:00:00Z", NOW)).toBe("2h ago");
  });

  it("null is 'never', not an error", () => {
    expect(humanSince(null, NOW)).toBe("never");
  });

  it("an unparseable timestamp degrades quietly", () => {
    expect(humanSince("garbage", NOW)).toBe("—");
  });

  it("a future timestamp does not render as negative", () => {
    // Clock skew between the DB and the browser must not print "-3s ago".
    expect(humanSince("2026-07-30T12:00:05Z", NOW)).toBe("0ms ago");
  });
});

describe("on-hold runners must not read as incidents", () => {
  // Five of six runners are deliberately undeployed. Without this they render as
  // `not_deployed` forever — one useful row out of six — and the page teaches an
  // operator to stop reading it. Same reasoning that keeps `unused` capabilities
  // muted in feature-health.ts.
  const HOLD = "Evals are on hold — the runner is built but not deployed.";

  it("reframes 'not deployed' as 'On hold' with the reason as its meaning", () => {
    const p = presentationFor("not_deployed", HOLD);
    expect(p.label).toBe("On hold");
    expect(p.tone).toBe("muted");
    expect(p.meaning).toBe(HOLD);
    expect(p.action).toBeNull();
  });

  it("also covers 'down' and 'unknown' — a paused runner fails a probe too", () => {
    for (const s of ["down", "unknown"] as const) {
      expect(presentationFor(s, HOLD).label, s).toBe("On hold");
    }
  });

  it("NEVER softens a queue-derived problem, even on a paused runner", () => {
    // Stuck jobs are read from the database, not from a probe. A paused runner
    // holding stuck work is still a real problem someone must clear.
    for (const s of ["degraded", "backed_up", "not_ticking"] as const) {
      expect(presentationFor(s, HOLD).label, s).toBe(STATUS[s].label);
      expect(presentationFor(s, HOLD).tone, s).toBe(STATUS[s].tone);
    }
  });

  it("leaves a runner with no hold reason exactly as it was", () => {
    expect(presentationFor("not_deployed", null)).toEqual(STATUS.not_deployed);
    expect(presentationFor("idle", null)).toEqual(STATUS.idle);
  });

  it("does not soften a genuinely healthy row into 'On hold'", () => {
    // A paused runner that somehow answers is news, and must keep saying so.
    expect(presentationFor("idle", HOLD).label).toBe(STATUS.idle.label);
    expect(presentationFor("working", HOLD).label).toBe(STATUS.working.label);
  });
});
