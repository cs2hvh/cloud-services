/**
 * Live health check across every external layer v2 depends on.
 *
 * Read-only and side-effect free except for one R2 object it writes and then
 * deletes. Run it before any deploy work to prove the platform's credentials
 * and assumptions still hold:
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/health-check.ts
 */

import { getAppMetadata, listInstallations } from "../../lib/paas/github/app.ts";
import { instances, lke, regions, linode, LinodeError } from "../../lib/paas/linode/client.ts";
import { headBucket, putObject, getObject, deleteObject, presign } from "../../lib/paas/build/r2.ts";
import {
  verifyToken,
  getZone,
  listCertificatePacks,
  certCovers,
  listCustomHostnames,
} from "../../lib/paas/edge/cloudflare.ts";
import { paasConfig, appHostname } from "../../lib/paas/config.ts";

type Status = "ok" | "warn" | "fail";
const results: Array<{ layer: string; check: string; status: Status; detail: string }> = [];

function record(layer: string, check: string, status: Status, detail: string) {
  results.push({ layer, check, status, detail });
  const icon = status === "ok" ? "  ok  " : status === "warn" ? " warn " : " FAIL ";
  console.log(`[${icon}] ${layer.padEnd(11)} ${check.padEnd(34)} ${detail}`);
}

async function check(layer: string, name: string, fn: () => Promise<string | { warn: string }>) {
  try {
    const out = await fn();
    if (typeof out === "string") record(layer, name, "ok", out);
    else record(layer, name, "warn", out.warn);
  } catch (e) {
    record(layer, name, "fail", (e as Error).message.slice(0, 160));
  }
}

console.log("\nDeploy v2 — live layer health check\n" + "─".repeat(96));

// ── GitHub ──────────────────────────────────────────────────────────────────
await check("github", "App JWT signs and authenticates", async () => {
  const app = await getAppMetadata();
  return `"${app.name}" id=${app.id} owner=${app.owner?.login}`;
});

await check("github", "permissions are least-privilege", async () => {
  const app = await getAppMetadata();
  const p = app.permissions ?? {};
  if (p.contents !== "read") throw new Error(`contents must be "read", got "${p.contents}"`);
  const writes = Object.entries(p).filter(([, v]) => v === "write").map(([k]) => k);
  return `contents=read; writes limited to [${writes.join(", ")}]`;
});

await check("github", "installations", async () => {
  const list = await listInstallations();
  if (!list.length) {
    return { warn: "0 installations — install the App on an account before any repo can deploy" };
  }
  return list.map((i) => `${i.account?.login} (${i.repository_selection})`).join(", ");
});

// ── Linode ──────────────────────────────────────────────────────────────────
await check("linode", "token authenticates", async () => {
  const v = await lke.versions();
  return `LKE versions available: ${v.map((x) => x.id).join(", ")}`;
});

await check("linode", "BLAST RADIUS: prod invisible", async () => {
  const [list, clusters] = await Promise.all([instances.list(), lke.listClusters()]);
  const ourClusterIds = new Set(clusters.map((c) => String(c.id)));

  // An instance is legitimately ours if we tagged it, or if it is a worker node
  // of one of our LKE clusters. LKE node instances are labelled
  // `lke<clusterId>-<poolId>-<suffix>` and do NOT inherit the cluster's tags,
  // so a tag-only check reports our own nodes as foreign.
  const foreign = list.filter((i) => {
    if (i.tags.includes("ahura-v2") || i.tags.includes("ahura-v2-build")) return false;
    const m = i.label.match(/^lke(\d+)-/);
    return !(m && ourClusterIds.has(m[1]));
  });

  if (foreign.length) {
    throw new Error(
      `token can see ${foreign.length} Linode(s) it did not create: ${foreign.map((i) => i.label).join(", ")}`,
    );
  }
  return `${list.length} instance(s) visible, all ours — production is out of reach`;
});

await check("linode", "billing endpoint denied", async () => {
  try {
    await linode.get("/account");
    throw new Error("token CAN read /account — it is over-scoped");
  } catch (e) {
    // Match on the categorized error code, not on prose: Linode phrases this
    // as "not authorized to use this endpoint", which contains neither "401"
    // nor "Unauthorized".
    if (e instanceof LinodeError && e.code === "AUTH") return "GET /account correctly denied (AUTH)";
    throw e;
  }
});

await check("linode", "region supports what v2 needs", async () => {
  const region = paasConfig.linode.region();
  await regions.assertCapable(region, ["Kubernetes", "VPCs", "NodeBalancers"]);
  const all = await regions.list();
  const r = all.find((x) => x.id === region)!;
  return `${region} (${r.label}) has Kubernetes, VPCs, NodeBalancers`;
});

await check("linode", "existing v2 clusters", async () => {
  const clusters = await lke.listClusters();
  if (!clusters.length) return { warn: "no LKE cluster yet — run scripts/v2/provision-cluster.ts" };
  return clusters.map((c) => `${c.label} (${c.k8s_version}, ${c.region})`).join(", ");
});

// ── R2 ──────────────────────────────────────────────────────────────────────
await check("r2", "bucket reachable", async () => {
  const ok = await headBucket();
  if (!ok) throw new Error("bucket not reachable with these credentials");
  return `${paasConfig.r2.bucket()} reachable`;
});

await check("r2", "write / read / delete round-trip", async () => {
  const key = "_healthcheck/probe.txt";
  const body = `probe ${new Date().toISOString()}`;
  await putObject(key, body, "text/plain");
  const back = await getObject(key);
  if (back?.toString() !== body) throw new Error("read-back did not match what was written");
  await deleteObject(key);
  if (await getObject(key)) throw new Error("object survived delete");
  return "put, get, delete all verified";
});

await check("r2", "presigned PUT works without credentials", async () => {
  // This is the mechanism that keeps keys out of the build VM: the VM gets a
  // URL, never an access key.
  const key = "_healthcheck/presigned.txt";
  const url = presign("PUT", key, 300);
  const res = await fetch(url, { method: "PUT", body: "signed-upload" });
  if (!res.ok) throw new Error(`presigned PUT -> ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const back = await getObject(key);
  await deleteObject(key);
  if (back?.toString() !== "signed-upload") throw new Error("presigned upload did not land");
  return "anonymous PUT via presigned URL succeeded, then cleaned up";
});

// ── Cloudflare ──────────────────────────────────────────────────────────────
await check("cloudflare", "token valid", async () => {
  const t = await verifyToken();
  return `status=${t.status}`;
});

await check("cloudflare", "zone reachable", async () => {
  const z = await getZone();
  return `${z.name} status=${z.status} plan=${z.plan?.name ?? "?"}`;
});

await check("cloudflare", "TLS covers app hostnames", async () => {
  const packs = await listCertificatePacks();
  const sample = appHostname("healthcheck-probe");
  const covered = certCovers(packs, sample);
  const hosts = packs.flatMap((p) => p.hosts);
  if (!covered) {
    return {
      warn:
        `no certificate covers ${sample}. Current: [${[...new Set(hosts)].join(", ")}]. ` +
        `Wildcards match one label only — Advanced Certificate Manager ($10/mo) is required for a deeper domain.`,
    };
  }
  return `${sample} is covered by [${[...new Set(hosts)].join(", ")}]`;
});

await check("cloudflare", "custom hostnames (customer domains)", async () => {
  try {
    const list = await listCustomHostnames();
    return `${list.length} registered (100 included, then $0.10/mo each)`;
  } catch (e) {
    // Code 1404 means Cloudflare for SaaS has never been activated on this
    // zone. The 100 included hostnames exist on every plan, but the quota has
    // to be allocated once before the API will answer at all. Platform
    // subdomains do NOT need this — only customer BYO domains do — so it
    // blocks nothing until the first customer attaches their own domain.
    if (/\b1404\b|No quota has been allocated/i.test((e as Error).message)) {
      return {
        warn:
          "Cloudflare for SaaS not yet activated on this zone (API code 1404). " +
          "Platform subdomains are unaffected; required before customer BYO domains work. " +
          "Enable under SSL/TLS -> Custom Hostnames in the dashboard.",
      };
    }
    throw e;
  }
});

// ── summary ─────────────────────────────────────────────────────────────────
console.log("─".repeat(96));
const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");
console.log(
  `${results.filter((r) => r.status === "ok").length} ok, ${warned.length} warning(s), ${failed.length} failure(s)\n`,
);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL  ${f.layer}/${f.check}: ${f.detail}`);
  process.exit(1);
}
