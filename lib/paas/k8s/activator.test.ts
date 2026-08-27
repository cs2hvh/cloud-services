import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVATOR_SCRIPT,
  activatorAliasService,
  activatorClusterRole,
  activatorDeployment,
} from "./activator.ts";
import { appIngress } from "./gateway.ts";

test("the activator script parses as JavaScript", () => {
  // It is mounted from a ConfigMap and run by a stock node image, so a syntax
  // error would only surface as a CrashLoopBackOff in front of sleeping apps.
  assert.doesNotThrow(() => new Function(ACTIVATOR_SCRIPT));
});

test("the tenant-side activator Service is ExternalName to the platform one", () => {
  // An Ingress backend can only name a Service in its OWN namespace. Pointing a
  // sleeping app's Ingress straight at ahura-system produced a backend
  // Kubernetes could not resolve, and Traefik answered 404 — not an error
  // anywhere, just the app gone.
  const s = activatorAliasService("app-prj-abc") as any;
  assert.equal(s.metadata.namespace, "app-prj-abc");
  assert.equal(s.spec.type, "ExternalName");
  assert.equal(s.spec.externalName, "activator.ahura-system.svc.cluster.local");
});

test("the activator can scale and stamp deployments but never create or delete", () => {
  const rules = (activatorClusterRole() as any).rules as Array<{ resources: string[]; verbs: string[] }>;
  const verbs = new Set(rules.flatMap((r) => r.verbs));
  assert.ok(!verbs.has("create"), "must not create");
  assert.ok(!verbs.has("delete"), "must not delete");
  const resources = new Set(rules.flatMap((r) => r.resources));
  assert.ok(!resources.has("secrets"), "must never read secrets");
  assert.ok(resources.has("deployments/scale"), "must be able to wake an app");
  assert.ok(resources.has("endpointslices"), "ready is not reachable — it checks endpoints");
});

test("a script change rolls the pod", () => {
  // Kubernetes does NOT restart pods when a ConfigMap changes. Without the
  // hash annotation the activator keeps running an old script and the symptom
  // is a fix that appears not to work.
  const a = (activatorDeployment("aaaa") as any).spec.template.metadata.annotations;
  const b = (activatorDeployment("bbbb") as any).spec.template.metadata.annotations;
  assert.notDeepEqual(a, b);
});

test("an awake Ingress carries NO wake annotations", () => {
  // Not empty strings. A null serialises to "" and an empty string is a value
  // that looks like data — the same smell as the '0000000' git sha. Under
  // Server-Side Apply, omitting removes.
  //
  // This asserted `annotations === undefined` until the per-tenant rate limit
  // started populating that block for every route. That was a PROXY for the real
  // rule and the proxy became wrong while the rule did not: an awake app must
  // carry no WAKE annotations, which says nothing about annotations in general.
  // Asserting the absence of the specific keys is what was always meant, and it
  // cannot be broken by the next thing that legitimately needs an annotation.
  const ing = appIngress({
    aliasRef: "als-1", projectRef: "prj-1", namespace: "app-prj-1",
    hostname: "x.example.com", serviceName: "dpl-1",
  }) as any;
  const a = ing.metadata.annotations ?? {};
  assert.ok(!("ahura.cloud/wake-target" in a), "no wake target on an awake app");
  assert.ok(!("ahura.cloud/wake-port" in a), "no wake port on an awake app");
  // And specifically not as empty strings, which is the failure the original
  // test was written to catch.
  assert.notEqual(a["ahura.cloud/wake-target"], "");
});

test("a sleeping Ingress names what to wake and on which port", () => {
  const ing = appIngress({
    aliasRef: "als-1", projectRef: "prj-1", namespace: "app-prj-1",
    hostname: "x.example.com", serviceName: "activator",
    wakeTarget: "dpl-1", wakePort: 8000,
  }) as any;
  assert.equal(ing.metadata.annotations["ahura.cloud/wake-target"], "dpl-1");
  assert.equal(ing.metadata.annotations["ahura.cloud/wake-port"], "8000");
  assert.equal(ing.spec.rules[0].http.paths[0].backend.service.name, "activator");
});

test("the activator reads the body BEFORE waking", () => {
  // The client sends it immediately and will not resend. Waking first and
  // piping afterwards loses whatever arrived while the app was starting, so a
  // POST to a sleeping app would arrive empty.
  const readAt = ACTIVATOR_SCRIPT.indexOf("await readBody(req)");
  const wakeAt = ACTIVATOR_SCRIPT.indexOf("await wake(host)");
  assert.ok(readAt > 0 && wakeAt > 0);
  assert.ok(readAt < wakeAt, "body must be buffered before the wake");
});

test("the activator stamps woken-at BEFORE removing itself from the path", () => {
  // Otherwise there is a window where the app is reachable, the database still
  // says asleep, and a reconciler pass in that window undoes the wake.
  const stamp = ACTIVATOR_SCRIPT.indexOf("woken-at");
  const repoint = ACTIVATOR_SCRIPT.indexOf("networking.k8s.io/v1/namespaces/' + ns + '/ingresses/");
  assert.ok(stamp > 0 && repoint > 0);
  assert.ok(stamp < repoint, "stamp the wake before taking ourselves out of the path");
});
