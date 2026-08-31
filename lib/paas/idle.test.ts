import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRouterCounts, requestsForHostname, verdict, type IdleSample } from "./idle.ts";

const EXPO = `
# HELP traefik_router_requests_total How many HTTP requests processed.
traefik_router_requests_total{code="200",method="GET",router="websecure-app-prj-13-als-95-v2-flask-ahurasense-com@kubernetes"} 6
traefik_router_requests_total{code="404",method="GET",router="websecure-app-prj-13-als-95-v2-flask-ahurasense-com@kubernetes"} 2
traefik_router_requests_total{code="200",method="GET",router="websecure-app-prj-93-als-bc-v2-docker-ahurasense-com@kubernetes"} 3
traefik_entrypoint_requests_total{code="200"} 99
`;

test("counts are summed across status codes and methods", () => {
  // A 404 is still someone depending on the app being up. Counting only 200s
  // would sleep an app that is serving errors — which is when it is most likely
  // to be actively looked at.
  const c = parseRouterCounts(EXPO);
  assert.equal(requestsForHostname(c, "v2-flask.ahurasense.com"), 8);
  assert.equal(requestsForHostname(c, "v2-docker.ahurasense.com"), 3);
});

test("only router counters are parsed, not entrypoint totals", () => {
  const c = parseRouterCounts(EXPO);
  assert.equal([...c.keys()].every((k) => k.includes("v2-")), true);
});

test("a hostname with no router reads as NULL, not zero", () => {
  // "No router" means the gateway has never routed it. Treating that as "no
  // traffic" would sleep an app on the strength of a gateway that has not seen
  // it yet.
  assert.equal(requestsForHostname(parseRouterCounts(EXPO), "unknown.ahurasense.com"), null);
});

const prev = (requests: number, at = 0): IdleSample => ({ hostname: "h", requests, at });

test("a counter that moved means NOT idle", () => {
  assert.deepEqual(verdict(prev(5), { requests: 6, at: 900_000 }, 900_000), { idle: false, reason: "traffic" });
});

test("an unreadable counter never sleeps an app", () => {
  // THE IMPORTANT ONE. Blind is not idle. Sleeping a live app because the
  // gateway could not be read turns an availability feature into an outage.
  assert.deepEqual(verdict(prev(5), { requests: null, at: 900_000 }, 900_000), { idle: false, reason: "no-reading" });
});

test("a single reading is never enough", () => {
  // Every app looks like this immediately after a gateway restart — precisely
  // when sleeping everything would be most damaging.
  assert.deepEqual(verdict(undefined, { requests: 0, at: 900_000 }, 900_000), { idle: false, reason: "no-baseline" });
});

test("an unmoved counter for long enough IS idle", () => {
  assert.deepEqual(verdict(prev(5), { requests: 5, at: 900_000 }, 900_000), { idle: true, forMs: 900_000 });
});

test("an unmoved counter for not long enough is not yet idle", () => {
  assert.deepEqual(verdict(prev(5), { requests: 5, at: 100_000 }, 900_000), { idle: false, reason: "too-recent" });
});

test("a counter that RESET forces a re-baseline instead of reading as idle", () => {
  // Traefik restarting zeroes its counters. The naive reading is "no increase,
  // therefore idle" — but the window being called idle spans a gateway restart,
  // and we have no idea what arrived before it. Sleeping every app on the
  // platform is a plausible consequence of getting this wrong, since one
  // restart resets every counter at once.
  assert.deepEqual(
    verdict(prev(5), { requests: 3, at: 900_000 }, 900_000),
    { idle: false, reason: "counter-reset" },
  );
});

test("a gateway restart cannot sleep the whole fleet", () => {
  // The fleet-wide version of the case above: every hostname's counter drops to
  // zero simultaneously, and every one of them must decline to sleep.
  for (const before of [1, 50, 10_000]) {
    assert.equal(verdict(prev(before), { requests: 0, at: 86_400_000 }, 900_000).idle, false);
  }
});
