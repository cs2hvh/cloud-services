import { test } from "node:test";
import assert from "node:assert/strict";
import { orphanedRoutes, type RouteObject } from "./reconciler.ts";

const route = (name: string, aliasRef?: string): RouteObject => ({
  metadata: {
    name,
    labels: {
      "app.kubernetes.io/managed-by": "ahura-paas",
      ...(aliasRef ? { "ahura.cloud/alias": aliasRef } : {}),
    },
  },
});

test("a route whose alias is gone is orphaned; one whose alias exists is not", () => {
  const known = new Set(["als-alive"]);
  const found = orphanedRoutes([route("als-alive", "als-alive"), route("als-dead", "als-dead")], known);
  assert.deepEqual(found, [{ name: "als-dead", aliasRef: "als-dead" }]);
});

test("UNLABELLED IS NOT ORPHANED", () => {
  // The distinction with a delete attached. An object with no alias label might
  // belong to anyone — a human, another controller, a future feature. "We cannot
  // say whose this is" must never become "nobody's", because here that reasoning
  // deletes it. Proven live: an unlabelled Ingress survived a real GC pass that
  // removed the orphan sitting beside it.
  const found = orphanedRoutes([route("human-made-thing"), route("no-labels-at-all")], new Set());
  assert.deepEqual(found, []);
});

test("an object with no name is skipped rather than acted on", () => {
  assert.deepEqual(orphanedRoutes([{ metadata: { labels: { "ahura.cloud/alias": "als-x" } } }], new Set()), []);
  assert.deepEqual(orphanedRoutes([{}], new Set()), []);
});

test("the collector is not a pass-through in either direction", () => {
  // The paired proof. Returning [] unconditionally satisfies every refusal test
  // above while collecting nothing ever — orphaned routes would accumulate and a
  // reaped preview would keep serving, which is the entire failure this closes.
  // Returning everything would delete the platform's routing.
  const items = [route("a", "als-a"), route("b", "als-b")];
  assert.equal(orphanedRoutes(items, new Set()).length, 2, "must be capable of finding orphans");
  assert.equal(orphanedRoutes(items, new Set(["als-a", "als-b"])).length, 0, "must be capable of finding none");
});

test("an empty alias set orphans every LABELLED route, which is why the read must throw on failure", () => {
  // Pinning the assumption the caller depends on. With no aliases, every route
  // carrying an alias label is orphaned — correct when the project genuinely has
  // none, catastrophic if an empty list ever came back from a failed database
  // read. `aliases.forProject` throws rather than returning [], and this test
  // exists to make that a stated dependency rather than an accident: if someone
  // makes that read fail soft, this is the behaviour they are arming.
  const items = [route("a", "als-a"), route("b", "als-b"), route("c", "als-c")];
  assert.equal(orphanedRoutes(items, new Set()).length, 3);
});
