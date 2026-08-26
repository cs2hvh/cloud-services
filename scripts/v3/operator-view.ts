/**
 * Render the operator view from the command line.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/operator-view.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/operator-view.ts --json
 *
 * This is the same function the dashboard page and the three admin API routes
 * call. It exists so that logic can be exercised for real, because nothing
 * under app/ can be typechecked or executed in this repo — no node_modules —
 * and a route nobody can run is a route nobody has verified.
 *
 * So: the page and the routes are reviewed by inspection. What they CALL is
 * proven here, against live infrastructure.
 *
 * READ-ONLY.
 */

import { operatorView } from "../../lib/paas/telemetry/operator.ts";

const JSON_OUT = process.argv.includes("--json");
const view = await operatorView();

if (JSON_OUT) {
  console.log(JSON.stringify(view, null, 2));
  process.exit(0);
}

const line = "─".repeat(88);
const money = (n: number, p = 2) => `$${n.toFixed(p)}`;
const failed = (s: object): s is { error: string } => "error" in s;

console.log(`\nPlatform operations — ${view.generatedAt}`);
console.log(line);

// ── fleet ───────────────────────────────────────────────────────────────────
console.log(`FLEET`);
if (failed(view.fleet)) {
  console.log(`  unavailable: ${view.fleet.error}`);
} else {
  const f = view.fleet;
  console.log(
    `  standing ${money(f.monthly.standing)}/mo   ` +
      `unaccounted ${money(f.drift.unaccountedHourly, 4)}/hr   ` +
      `${f.observed.lkeClusters} cluster(s), ${f.observed.instances} instance(s)`,
  );
  for (const x of f.drift.findings) {
    console.log(
      `  ${x.status.toUpperCase().padEnd(11)} ${x.label.padEnd(26)} ` +
        `${x.hourly === null ? "unknown/hr" : `${money(x.hourly, 4)}/hr`}  ${x.detail}`,
    );
  }
  if (f.drift.unpriced.length) console.log(`  UNPRICED: ${f.drift.unpriced.join("; ")}`);
}

// ── hostnames ───────────────────────────────────────────────────────────────
console.log(`\n${line}\nHOSTNAMES`);
if (failed(view.hostnames)) {
  console.log(`  unavailable: ${view.hostnames.error}`);
} else {
  const h = view.hostnames;
  console.log(`  gateway ${h.gatewayIp}   apex ${h.appDomain}   claimable ${h.drift.claimable}`);
  for (const x of h.drift.findings.filter((y) => y.status !== "foreign")) {
    console.log(`  ${x.status.toUpperCase().padEnd(11)} ${x.hostname.padEnd(44)} ${x.detail}`);
  }
  console.log(
    `  ${h.drift.findings.filter((y) => y.status === "foreign").length} foreign record(s), untouched`,
  );
}

// ── usage ───────────────────────────────────────────────────────────────────
console.log(`\n${line}\nRUNNING NOW`);
if (failed(view.usage)) {
  console.log(`  unavailable: ${view.usage.error}`);
} else {
  const u = view.usage;
  console.log(
    `  ${u.apps.length} app(s), ${u.apps.reduce((n, a) => n + a.pods, 0)} pod(s)   ` +
      `${u.builds.builds} build(s)/24h, ${(u.builds.buildSeconds / 60).toFixed(1)} build-minutes`,
  );
  for (const a of u.apps) {
    console.log(
      `  ${a.appKey.padEnd(20)} ${a.projectRef.slice(0, 32).padEnd(32)} ` +
        `pods=${a.pods} restarts=${a.restarts}`,
    );
  }
  for (const s of u.signals) {
    console.log(`  [${s.severity.toUpperCase()}] ${s.kind} · ${s.subject} — ${s.detail}`);
  }
  console.log(`  warm fraction: not available from a point-in-time read (needs the sampler)`);
}

console.log("");
