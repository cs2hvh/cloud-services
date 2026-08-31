import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseCharges, type ChargeRow } from "./usage.ts";

const hour = (day: string, h: number, amount: number | string | null): ChargeRow => ({
  period_start: `${day}T${String(h).padStart(2, "0")}:00:00+00:00`,
  amount_usd: amount,
});

test("an empty statement is zero, not absent", () => {
  const s = summariseCharges([]);
  assert.equal(s.hoursBilled, 0);
  assert.equal(s.totalUsd, 0);
  assert.deepEqual(s.byDay, []);
  assert.equal(s.unreadable, 0);
});

test("PostgREST numerics arrive as strings and must still add up", () => {
  // numeric columns come back quoted. Number() handles it; a change that
  // started trusting the raw value would concatenate instead of add.
  const s = summariseCharges([hour("2026-08-26", 1, "0.000950"), hour("2026-08-26", 2, "0.000950")]);
  assert.equal(s.totalUsd, 0.0019);
  assert.equal(s.hoursBilled, 2);
});

test("THE TOTAL IS SUMMED FROM ROWS, NOT RECOMPUTED FROM A TIER", () => {
  // The rows carry what was actually taken. A project that resized mid-month
  // has hours at two prices, and the statement must show their sum — not 3
  // hours at whichever tier the project happens to be on today.
  const rows: ChargeRow[] = [
    { period_start: "2026-08-26T01:00:00Z", amount_usd: "0.000950", tier: "starter", instances: 1 },
    { period_start: "2026-08-26T02:00:00Z", amount_usd: "0.011400", tier: "pro", instances: 2 },
    { period_start: "2026-08-26T03:00:00Z", amount_usd: "0.011400", tier: "pro", instances: 2 },
  ];
  const s = summariseCharges(rows);
  assert.equal(s.totalUsd, 0.02375);
  assert.notEqual(s.totalUsd, 0.00095 * 3, "must not price every hour at the first tier");
  assert.notEqual(s.totalUsd, 0.0114 * 3, "must not price every hour at the current tier");
});

test("hours group by calendar day, newest first", () => {
  const s = summariseCharges([
    hour("2026-08-24", 5, "0.001"),
    hour("2026-08-26", 1, "0.002"),
    hour("2026-08-26", 2, "0.003"),
    hour("2026-08-25", 9, "0.004"),
  ]);
  assert.deepEqual(s.byDay.map((d) => d.day), ["2026-08-26", "2026-08-25", "2026-08-24"]);
  assert.deepEqual(s.byDay.map((d) => d.hours), [2, 1, 1]);
  assert.equal(s.byDay[0].amountUsd, 0.005);
});

test("AN UNREADABLE AMOUNT IS COUNTED, NEVER ADDED", () => {
  // Number(null) is 0 and Number("abc") is NaN. The zero understates the bill
  // silently; the NaN poisons the total and serialises to JSON null, showing
  // the customer a blank where a figure belongs. Neither may reach the total.
  for (const bad of [null, "", "   ", "abc", "NaN", Infinity, "1e999"] as Array<number | string | null>) {
    const s = summariseCharges([hour("2026-08-26", 1, "0.005"), hour("2026-08-26", 2, bad)]);
    assert.equal(s.totalUsd, 0.005, `${JSON.stringify(bad)} must not change the total`);
    assert.equal(s.hoursBilled, 1, `${JSON.stringify(bad)} must not be billed`);
    assert.equal(s.unreadable, 1, `${JSON.stringify(bad)} must be reported`);
    assert.ok(Number.isFinite(s.totalUsd), "total must stay a real number");
  }
});

test("a row with no readable date cannot appear on a dated statement", () => {
  for (const when of ["", "not-a-date", "2026-13-45T00:00:00Z"]) {
    const s = summariseCharges([{ period_start: when, amount_usd: "0.005" }]);
    assert.equal(s.unreadable, 1, `${JSON.stringify(when)} must be reported`);
    assert.equal(s.totalUsd, 0);
    assert.deepEqual(s.byDay, []);
  }
});

test("hoursBilled counts billed hours, not rows supplied", () => {
  // The difference is the whole point of reporting `unreadable` separately: a
  // caller that trusted rows.length would tell the customer they were billed
  // for an hour that contributed nothing.
  const s = summariseCharges([hour("2026-08-26", 1, "0.005"), hour("2026-08-26", 2, "bad"), hour("2026-08-26", 3, "0.005")]);
  assert.equal(s.hoursBilled, 2);
  assert.equal(s.unreadable, 1);
  assert.equal(s.totalUsd, 0.01);
});

test("a month of fractional hours does not drift", () => {
  // 730 additions of a sub-cent rate. Binary floating point accumulates error;
  // rounding only at the end keeps the statement equal to the arithmetic.
  const rows = Array.from({ length: 730 }, (_, i) =>
    hour(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`, i % 24, "0.000950"),
  );
  const s = summariseCharges(rows);
  assert.equal(s.hoursBilled, 730);
  assert.equal(s.totalUsd, 0.6935, "730 x $0.00095 is exactly $0.6935");
});

test("the day total equals the sum of its days", () => {
  // A statement whose lines do not add to its total is the one thing a
  // customer will always check.
  const rows = [hour("2026-08-26", 1, "0.0019"), hour("2026-08-25", 4, "0.0114"), hour("2026-08-25", 5, "0.000001")];
  const s = summariseCharges(rows);
  const fromDays = s.byDay.reduce((t, d) => t + d.amountUsd, 0);
  assert.equal(Math.round(fromDays * 1e6) / 1e6, s.totalUsd);
  assert.equal(s.byDay.reduce((t, d) => t + d.hours, 0), s.hoursBilled);
});

test("a negative amount is a refund, not an error", () => {
  // Correction rows exist. Rejecting them would leave a refunded hour showing
  // as a charge, which is the direction that costs the customer money.
  const s = summariseCharges([hour("2026-08-26", 1, "0.005"), hour("2026-08-26", 2, "-0.005")]);
  assert.equal(s.totalUsd, 0);
  assert.equal(s.hoursBilled, 2);
  assert.equal(s.unreadable, 0);
});
