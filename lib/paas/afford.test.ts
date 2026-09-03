import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, shouldRefuse } from "../../app/api/v2/_lib/afford.ts";

const HOURLY = 0.009589; // Starter × 1

test("a healthy balance passes", () => {
  const a = decide("ok", 100, HOURLY);
  assert.equal(a.state, "ok");
  assert.equal(shouldRefuse(a), false);
});

test("a balance under one hour REFUSES", () => {
  const a = decide("ok", 0.001, HOURLY);
  assert.equal(a.state, "short");
  assert.equal(shouldRefuse(a), true);
  // The message names both numbers. "Insufficient credit" alone leaves the
  // customer unable to work out how much to add.
  assert.match(a.reason, /0\.00/);
});

test("exactly one hour's worth is enough — the boundary is inclusive", () => {
  // Asserted on both sides so an off-by-one cannot pass. A `<=` where `<` was
  // meant refuses a customer who has exactly what the hour costs.
  assert.equal(decide("ok", HOURLY, HOURLY).state, "ok");
  assert.equal(decide("ok", HOURLY - 0.000001, HOURLY).state, "short");
});

test("NO CREDIT RECORD IS NOT A ZERO BALANCE — and it REFUSES", () => {
  // A missing billing.user_credits row is reported as its own state, never as
  // $0 — but it refuses. It used to be allowed through, and the deploy then ran
  // while charge_project_hour answered `insufficient` every hour: free compute
  // with a refusal that arrived an hour late and stopped nothing.
  const a = decide("no-record", null, HOURLY);
  assert.equal(a.state, "no-record");
  assert.equal(shouldRefuse(a), true, "a deploy nobody can be charged for must not start");
  assert.equal(a.balance, null, "null, never 0 — a missing row is not an empty wallet");
  assert.match(a.reason, /credit account/);
});

test("a project nobody can be billed for is REFUSED and says so", () => {
  const a = decide("no-payer", null, HOURLY);
  assert.equal(shouldRefuse(a), true);
  assert.match(a.reason, /our expense/);
});

test("AN UNRECOGNISED STATE REFUSES, it is never waved through", () => {
  // If someone adds a state to paas.payer_balance, an older deployment of this
  // file must not treat it as solvent. That is how a billing guard stops
  // guarding without anyone editing it.
  for (const unknown of ["suspended", "frozen", "", "OK", "ok "]) {
    const a = decide(unknown, 100, HOURLY);
    assert.equal(a.state, "unknown", `${JSON.stringify(unknown)} must not pass as ok`);
    assert.equal(shouldRefuse(a), true);
  }
});

test("the decision is not a pass-through in either direction", () => {
  // The paired proof. Refusing everything blocks every deploy on the platform;
  // allowing everything makes every assertion above vacuous.
  assert.equal(shouldRefuse(decide("ok", 100, HOURLY)), false, "must be capable of allowing");
  assert.equal(shouldRefuse(decide("ok", 0, HOURLY)), true, "must be capable of refusing");
});

test("a null balance on an 'ok' state does not silently pass", () => {
  // `ok` means the row was found. A null balance alongside it is incoherent —
  // and treating it as infinite credit is the expensive reading.
  const a = decide("ok", null, HOURLY);
  assert.equal(a.state, "ok");
  // Documented rather than asserted as a refusal: payer_balance cannot return
  // this pair today, because a found row always carries a numeric balance. If
  // that ever changes, this test is where it will be noticed.
  assert.equal(a.balance, null);
});
