/**
 * Watch real request traffic per hostname and say whether warmth is buying
 * anything.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/traffic-watch.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/traffic-watch.ts --samples 12 --interval 30
 *
 * OBSERVATION ONLY. It never sleeps, wakes, scales or routes anything —
 * `scripts/v2/idle-sweep.ts` owns those decisions and this owns none of them.
 * The two read the same counters for opposite purposes: the sweep decides
 * whether an app may sleep, this decides whether the money an awake app costs
 * is buying anything.
 *
 * WHY THIS EXISTS: the plan's cost model is a ~5x gap resting on the warm
 * fraction, and it names the way that breaks — a free uptime pinger, thirty
 * seconds of setup, and the fraction goes to 1.0. Warm-time pricing is listed
 * as an open BUSINESS decision. This is the measurement that decision needs,
 * and it cannot come from CPU: a pinged app is warm, running, and almost
 * perfectly idle.
 *
 * A short run measures a short window. The shape of a day is what matters and
 * this cannot see one; treat a ten-minute run as proof the measurement works,
 * not as the number.
 */

import { paasConfig } from "../../lib/paas/config.ts";
import { listDnsRecords } from "../../lib/paas/edge/cloudflare.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { parseRouterCounts, requestsForHostname } from "../../lib/paas/idle.ts";
import { isPlatformRecord } from "../../lib/paas/telemetry/dns-drift.ts";
import {
  KEEP_ALIVE_REGULARITY,
  QUIET_REQUESTS_PER_HOUR,
  classifyTraffic,
  warmthJustified,
  type TrafficReading,
} from "../../lib/paas/telemetry/traffic.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const PAAS_NAMESPACE = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";
const JSON_OUT = process.argv.includes("--json");

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const SAMPLES = Math.min(arg("samples", 6), 500);
const INTERVAL_S = Math.min(arg("interval", 20), 600);

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable");
  process.exit(1);
}

/**
 * Router counters from the gateway.
 *
 * Returns null on any failure, never an empty map — the same refusal the idle
 * sweep makes, for the same reason. An empty map reads as "every hostname has
 * zero requests", which is the single most dangerous wrong answer this data
 * can give: it makes a whole fleet look unused.
 */
async function counts(): Promise<Map<string, number> | null> {
  try {
    const pods = await k.listPods(PAAS_NAMESPACE);
    const pod = pods.find((p) => p.metadata.name.startsWith("traefik-"));
    if (!pod) return null;
    const body = await k.raw<string>({
      method: "GET",
      path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${pod.metadata.name}:8080/proxy/metrics`,
      raw: true,
    });
    return parseRouterCounts(String(body));
  } catch {
    return null;
  }
}

// Hostnames the platform actually serves — records under the apex pointing at
// OUR gateway.
//
// Reuses dns-drift's isPlatformRecord rather than filtering on the apex alone.
// The zone carries 30 production records, twelve of them A records under this
// apex that resolve somewhere else entirely; including them fills the report
// with hostnames Traefik has no router for and buries the six that matter.
// Reporting "undetermined" for someone else's website is technically true and
// completely useless.
const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
  `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
  true,
);
const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip;
if (!gatewayIp) {
  console.error("gateway has no LoadBalancer address — cannot tell which hostnames are ours");
  process.exit(1);
}

const apex = paasConfig.appDomain();
const hostnames = (await listDnsRecords())
  .filter((r) => isPlatformRecord(r, gatewayIp, apex))
  .map((r) => r.name.toLowerCase().replace(/\.$/, ""))
  .filter((h, i, a) => a.indexOf(h) === i);

const readings = new Map<string, TrafficReading[]>();
for (const h of hostnames) readings.set(h, []);

for (let i = 0; i < SAMPLES; i += 1) {
  const c = await counts();
  const at = Date.now();

  if (c === null) {
    if (!JSON_OUT) process.stdout.write(`  sample ${i + 1}/${SAMPLES}  gateway unreadable — recording nothing\n`);
  } else {
    for (const h of hostnames) {
      const n = requestsForHostname(c, h);
      // A hostname with no router is not a hostname with no requests. Skip it
      // rather than recording a zero that would read as measured quiet.
      if (n === null) continue;
      readings.get(h)?.push({ at, cumulative: n });
    }
    if (!JSON_OUT) {
      const seen = hostnames.filter((h) => (readings.get(h)?.length ?? 0) === i + 1).length;
      process.stdout.write(`  sample ${i + 1}/${SAMPLES}  ${seen}/${hostnames.length} hostname(s) reporting\n`);
    }
  }

  if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}

const verdicts = hostnames
  .map((h) => ({ hostname: h, v: classifyTraffic(readings.get(h) ?? []) }))
  .sort((a, b) => b.v.requestsPerHour - a.v.requestsPerHour);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        window: { samples: SAMPLES, intervalSeconds: INTERVAL_S },
        policy: { quietRequestsPerHour: QUIET_REQUESTS_PER_HOUR, keepAliveRegularity: KEEP_ALIVE_REGULARITY },
        hostnames: verdicts.map((x) => ({ ...x, justified: warmthJustified(x.v.shape) })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const line = "─".repeat(100);
console.log(`\nTraffic shape over ${((SAMPLES - 1) * INTERVAL_S / 60).toFixed(1)} minutes`);
console.log(line);

for (const { hostname, v } of verdicts) {
  console.log(
    `  ${hostname.padEnd(44)} ${v.requestsPerHour.toFixed(1).padStart(8)} req/hr  ` +
      `spread ${(v.regularity === null ? "—" : v.regularity.toFixed(2)).padStart(5)}  ` +
      `${v.shape.toUpperCase()}` +
      (v.resets ? `  (${v.resets} reset)` : ""),
  );
  console.log(`      ${v.reason}`);
  const w = warmthJustified(v.shape);
  if (w.justified === false) console.log(`      → ${w.note}`);
}

console.log(line);
const keepAlive = verdicts.filter((x) => x.v.shape === "keep-alive-shaped").length;
const idle = verdicts.filter((x) => x.v.shape === "no-traffic").length;
const undetermined = verdicts.filter((x) => x.v.shape === "undetermined").length;

console.log(
  `  ${verdicts.length} hostname(s): ${idle} with no traffic, ${keepAlive} keep-alive-shaped, ` +
    `${verdicts.length - idle - keepAlive - undetermined} organic, ${undetermined} undetermined`,
);
console.log(
  `\n  policy: quiet at or below ${QUIET_REQUESTS_PER_HOUR} req/hr, even below ${KEEP_ALIVE_REGULARITY} spread.\n` +
    `  A short run cannot see the shape of a day — treat this as proof the measurement\n` +
    `  works, not as the number the pricing decision needs.\n`,
);
