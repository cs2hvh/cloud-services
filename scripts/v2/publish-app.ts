/**
 * Give a running app a public hostname: create the Ingress and the DNS record.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/publish-app.ts <projectRef> <label> [--apply]
 *
 * e.g.  publish-app.ts prj-node-js-getting-started v2-express --apply
 *       -> https://v2-express.ahurasense.com
 *
 * The DNS record is PROXIED, so Cloudflare terminates public TLS and the origin
 * IP is never exposed. v1 created unproxied A records pointing straight at a
 * hardcoded node IP, which put the origin in customer DNS forever.
 */

import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import { appIngress } from "../../lib/paas/k8s/gateway.ts";
import { upsertDnsRecord, listDnsRecords } from "../../lib/paas/edge/cloudflare.ts";
import { paasConfig, appHostname } from "../../lib/paas/config.ts";

const [projectRef, label] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");

if (!projectRef || !label) {
  console.log("usage: publish-app.ts <projectRef> <label> [--apply]");
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/.test(label)) {
  console.log(`label "${label}" must be a single lowercase DNS label`);
  process.exit(1);
}

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

const hostname = appHostname(label);
const namespace = `app-${projectRef}`;
const aliasRef = `als-${label}`;

console.log(`\nPublishing ${projectRef}\n` + "─".repeat(72));
console.log(`hostname   ${hostname}`);
console.log(`namespace  ${namespace}`);

// The gateway's public address, read from the LoadBalancer rather than assumed.
const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
  `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
);
const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip;
if (!gatewayIp) {
  console.log("gateway has no LoadBalancer address — run install-gateway.ts first");
  process.exit(1);
}
console.log(`gateway    ${gatewayIp}`);

// Refuse to touch a hostname that already exists for something else. The zone
// carries live production records and a silent overwrite would break them.
const existing = (await listDnsRecords(hostname)).filter((r) => r.name === hostname);
if (existing.length && existing.some((r) => r.content !== gatewayIp)) {
  console.log(`\nREFUSING: ${hostname} already exists and points at ${existing[0].content}.`);
  console.log(`Pick a different label rather than overwriting a live record.`);
  process.exit(1);
}

if (!APPLY) {
  console.log(`\nWould create:`);
  console.log(`  Ingress ${aliasRef} in ${namespace} routing ${hostname} -> ${projectRef}:80`);
  console.log(`  DNS A ${hostname} -> ${gatewayIp} (proxied)`);
  console.log(`\nDry run. Re-run with --apply.`);
  process.exit(0);
}

await k.apply(
  `/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses/${aliasRef}`,
  appIngress({ aliasRef, projectRef, namespace, hostname }),
);
console.log(`\napplied    Ingress ${aliasRef}`);

const rec = await upsertDnsRecord({ type: "A", name: hostname, content: gatewayIp, proxied: true });
console.log(`applied    DNS ${rec.type} ${rec.name} -> ${rec.content} proxied=${rec.proxied}`);

console.log(`\nLive at https://${hostname}`);
console.log(`(DNS and Cloudflare edge propagation usually takes under a minute.)`);
