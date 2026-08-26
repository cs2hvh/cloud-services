import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TIERS,
  MAX_INSTANCES,
  clampInstances,
  costFor,
  marginPct,
  priceFor,
  requireTier,
  resourcesFor,
  tierById,
} from "./tiers.ts";

/**
 * The price table exists in two places — this module and docs/v2/05-pricing.md —
 * because one is executable and the other is what a human reads before deciding
 * to charge someone. Two copies of a number drift, and a price that drifts is a
 * customer billed for something other than what they were shown.
 *
 * So the document is PARSED and compared. As with every other check written
 * today, the parse is guarded first: a regex that matches nothing would report
 * every tier as consistent, which is the exact failure this suite exists to
 * prevent and the one that has recurred nine times.
 */

const DOC = readFileSync(new URL("../../docs/v2/05-pricing.md", import.meta.url), "utf8");

/** Rows look like: | **Starter** | 512 MB | 1 shared | 200 GB | $4.01 | **$5** | ₹449 | 20% | */
function parseDocTiers(md: string): Array<{ label: string; price: number; inr: number }> {
  const out: Array<{ label: string; price: number; inr: number }> = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // A tier row carries TWO dollar figures — our cost and the price — so
    // "the first $ cell" silently reads the cost. The price is the cell
    // immediately before the ₹, which is unambiguous and survives the columns
    // being reordered.
    const inrIndex = cells.findIndex((c) => /^₹[\d,]+$/.test(c));
    if (inrIndex < 1) continue;
    const inrCell = cells[inrIndex];
    const usdCell = cells[inrIndex - 1];
    if (!/^\*?\*?\$[\d.]+\*?\*?$/.test(usdCell)) continue;
    const label = cells[1]?.replace(/\*/g, "").trim();
    if (!label) continue;
    out.push({
      label,
      price: Number(usdCell.replace(/[^\d.]/g, "")),
      inr: Number(inrCell.replace(/[^\d]/g, "")),
    });
  }
  return out;
}

const DOC_TIERS = parseDocTiers(DOC);

// ── the parse must be capable of failing ────────────────────────────────────

test("the pricing document was actually parsed", () => {
  // Zero rows would make every consistency test below vacuously pass.
  assert.equal(
    DOC_TIERS.length,
    TIERS.length,
    `parsed ${DOC_TIERS.length} priced rows from 05-pricing.md but the code declares ${TIERS.length}`,
  );
});

test("the parser reads real numbers, not zeroes", () => {
  for (const row of DOC_TIERS) {
    assert.ok(row.price > 0, `${row.label} parsed a price of ${row.price}`);
    assert.ok(row.inr > 0, `${row.label} parsed an INR price of ${row.inr}`);
  }
});

test("the document and the code agree on every price", () => {
  // The actual point of the file.
  for (const tier of TIERS) {
    const row = DOC_TIERS.find((r) => r.label === tier.label);
    assert.ok(row, `${tier.label} is in the code but not in 05-pricing.md`);
    assert.equal(row!.price, tier.priceUsd, `${tier.label}: doc says $${row!.price}, code says $${tier.priceUsd}`);
    assert.equal(row!.inr, tier.priceInr, `${tier.label}: doc says ₹${row!.inr}, code says ₹${tier.priceInr}`);
  }
});

// ── the economics that set the prices ───────────────────────────────────────

test("every tier is profitable ALWAYS AWAKE, not merely when asleep", () => {
  // Under flat pricing the customer pays the same either way, and keeping an app
  // warm takes a free uptime pinger. A tier priced below its always-awake cost
  // is a tier any customer can make unprofitable without trying.
  for (const t of TIERS) {
    assert.ok(
      t.priceUsd > t.costUsd,
      `${t.label} costs $${t.costUsd}/mo awake and sells for $${t.priceUsd}`,
    );
  }
});

test("margins are what the document claims and none is dangerously thin", () => {
  for (const t of TIERS) {
    const m = marginPct(t);
    assert.ok(m >= 10, `${t.label} margin is ${m}% — below the 10% floor`);
    assert.ok(m <= 60, `${t.label} margin is ${m}%, which is high enough to suspect an arithmetic error`);
  }
});

test("price rises with resources, in both directions", () => {
  // Guards the transposition that a table makes easy: a bigger tier priced below
  // a smaller one reads fine in a list and is obviously wrong here.
  const shared = TIERS.filter((t) => t.cls === "shared").sort((a, b) => a.memoryMib - b.memoryMib);
  for (let i = 1; i < shared.length; i++) {
    assert.ok(shared[i].priceUsd > shared[i - 1].priceUsd, `${shared[i].label} must cost more than ${shared[i - 1].label}`);
    assert.ok(shared[i].costUsd > shared[i - 1].costUsd, `${shared[i].label} must COST us more than ${shared[i - 1].label}`);
  }
});

test("dedicated costs more than shared at the same memory", () => {
  // If it did not, the tier would be a strictly better deal and nobody would
  // ever choose shared — which would collapse our density and our margin.
  for (const ded of TIERS.filter((t) => t.cls === "dedicated")) {
    const peer = TIERS.find((t) => t.cls === "shared" && t.memoryMib === ded.memoryMib);
    if (!peer) continue;
    assert.ok(ded.priceUsd > peer.priceUsd, `${ded.label} must cost more than ${peer.label} at the same memory`);
  }
});

// ── how the tier reaches Kubernetes ─────────────────────────────────────────

test("dedicated reserves CPU; shared does not", () => {
  // This is the entire mechanical difference between the two classes, and the
  // only thing that makes "dedicated" mean anything to the scheduler.
  for (const t of TIERS) {
    const r = resourcesFor(t);
    if (t.cls === "dedicated") {
      assert.equal(r.requests.cpu, r.limits.cpu, `${t.label} is dedicated: request must equal limit`);
    } else {
      assert.notEqual(r.requests.cpu, r.limits.cpu, `${t.label} is shared: reserving the ceiling would pack as sparsely as dedicated`);
    }
  }
});

test("memory request always equals memory limit", () => {
  // Overcommitting memory does not throttle, it OOM-kills — possibly a different
  // tenant's pod than the one that over-allocated.
  for (const t of TIERS) {
    const r = resourcesFor(t);
    assert.equal(r.requests.memory, r.limits.memory, `${t.label} must not overcommit memory`);
    assert.equal(r.limits.memory, `${t.memoryMib}Mi`, `${t.label} must get exactly the memory it advertises`);
  }
});

test("CPU is expressed in millicores so nothing is rounded", () => {
  for (const t of TIERS) {
    const r = resourcesFor(t);
    assert.match(r.limits.cpu, /^\d+m$/, `${t.label} cpu limit ${r.limits.cpu} is not millicores`);
    assert.match(r.requests.cpu, /^\d+m$/, `${t.label} cpu request ${r.requests.cpu} is not millicores`);
  }
});

// ── refusals ────────────────────────────────────────────────────────────────

test("an unknown tier throws rather than falling back to the cheapest", () => {
  // The dangerous default. Substituting starter would run a Plus customer on
  // Starter resources and report success; the symptom is an OOM days later with
  // nothing linking it to the typo.
  assert.throws(() => requireTier("enterprise"), /unknown tier/);
  assert.throws(() => requireTier(""), /unknown tier/);
  assert.equal(tierById("nope"), null);
  assert.doesNotThrow(() => requireTier("starter"));
});

test("instance counts outside the bounds are refused", () => {
  assert.throws(() => clampInstances(0), /outside/);
  assert.throws(() => clampInstances(MAX_INSTANCES + 1), /outside/);
  assert.throws(() => clampInstances(1.5), /integer/);
  assert.equal(clampInstances(1), 1);
  assert.equal(clampInstances(MAX_INSTANCES), MAX_INSTANCES);
});

test("price and cost scale linearly with instance count", () => {
  const t = requireTier("standard");
  assert.equal(priceFor(t, 1).usd, t.priceUsd);
  assert.equal(priceFor(t, 3).usd, t.priceUsd * 3);
  assert.equal(priceFor(t, 3).inr, t.priceInr * 3);
  assert.equal(costFor(t, 3), Math.round(t.costUsd * 3 * 100) / 100);
  // Still profitable at every count, since both sides scale together.
  assert.ok(priceFor(t, 7).usd > costFor(t, 7));
});
