import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appIngress,
  gatewayTlsConfigMap,
  TENANT_RATELIMIT_MIDDLEWARE,
  TENANT_RATELIMIT_NAME,
  TENANT_RATELIMIT_AVERAGE,
} from "./gateway.ts";

const ing = (over: Record<string, unknown> = {}) =>
  appIngress({
    aliasRef: "als-test",
    namespace: "app-prj-test",
    projectRef: "prj-test",
    hostname: "app.example.com",
    serviceName: "dpl-test",
    port: 3000,
    ...over,
  } as Parameters<typeof appIngress>[0]);

test("EVERY tenant route carries the rate limit, not just opted-in ones", () => {
  // An opt-in control protects only the tenants who did not need protecting.
  const a = ing().metadata.annotations as Record<string, string>;
  assert.equal(a["traefik.ingress.kubernetes.io/router.middlewares"], TENANT_RATELIMIT_MIDDLEWARE);
});

test("the reference keeps its @file provider qualifier", () => {
  // Without `@file` Traefik looks in the Kubernetes CRD provider, which is not
  // enabled here. A router referencing a middleware that does not resolve simply
  // has no middleware — no error, no limit, and the annotation still reads
  // correctly on the object. This is the assertion that catches a "tidy-up"
  // dropping the suffix.
  assert.match(TENANT_RATELIMIT_MIDDLEWARE, /@file$/);
});

test("THE MIDDLEWARE THE ROUTES REFERENCE IS THE ONE THE CONFIGMAP DEFINES", () => {
  // The pairing that matters, and the failure it prevents is silent on both
  // sides: routes referencing a name nothing defines, or a definition nothing
  // references. Either way every request passes and the platform looks fine.
  const yml = gatewayTlsConfigMap().data["middlewares.yml"];
  assert.ok(yml.includes(`    ${TENANT_RATELIMIT_NAME}:`), "ConfigMap must define the referenced name");
  assert.ok(TENANT_RATELIMIT_MIDDLEWARE.startsWith(TENANT_RATELIMIT_NAME + "@"));
});

test("the ConfigMap still carries the TLS store", () => {
  // The rate limit was first applied by hand to this ConfigMap in the cluster.
  // Regenerating it here without tls.yml would drop the default certificate and
  // every hostname would fail TLS — the fix for one silent removal causing
  // another.
  const d = gatewayTlsConfigMap().data;
  assert.ok(d["tls.yml"].includes("defaultCertificate"));
  assert.ok(d["middlewares.yml"].includes("rateLimit"));
});

test("the limit is identified by CLIENT, never by socket peer", () => {
  // Behind Cloudflare the socket peer is always a Cloudflare address. Limiting
  // on it would share one bucket across every visitor of every tenant, so one
  // busy app throttles the platform. Proven live at average=1: 19 of 20 requests
  // to one host returned 429 while a second host returned 20 of 20 as 200 —
  // which also proves the buckets are per-route, not global.
  const yml = gatewayTlsConfigMap().data["middlewares.yml"];
  assert.match(yml, /requestHeaderName: CF-Connecting-IP/);
});

test("the configured limit is a real number, not zero or absent", () => {
  // average: 0 in Traefik means NO LIMIT, not "block everything" — so a config
  // that looks like the strictest possible setting is in fact the weakest.
  assert.ok(TENANT_RATELIMIT_AVERAGE > 0);
  assert.match(gatewayTlsConfigMap().data["middlewares.yml"], new RegExp(`average: ${TENANT_RATELIMIT_AVERAGE}\\b`));
});

test("a sleeping app keeps BOTH its wake target and its rate limit", () => {
  // These share an annotations block. An earlier version built that block only
  // when a wake target existed, so adding the rate limit naively would have
  // applied it to sleeping apps only — or dropped the wake target for awake
  // ones, which breaks scale-to-zero.
  const awake = ing().metadata.annotations as Record<string, string>;
  assert.ok(!("ahura.cloud/wake-target" in awake), "an awake app must not carry a stale wake target");
  assert.ok("traefik.ingress.kubernetes.io/router.middlewares" in awake);

  const asleep = ing({ wakeTarget: "activator", wakePort: 8080 }).metadata.annotations as Record<string, string>;
  assert.equal(asleep["ahura.cloud/wake-target"], "activator");
  assert.equal(asleep["ahura.cloud/wake-port"], "8080");
  assert.equal(asleep["traefik.ingress.kubernetes.io/router.middlewares"], TENANT_RATELIMIT_MIDDLEWARE);
});
