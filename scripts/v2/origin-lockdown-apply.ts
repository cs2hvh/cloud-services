/**
 * Attach the Cloudflare-only firewall to the origin NodeBalancer.
 *
 * The origin answers on its public IP, so anyone who learns the address walks
 * past Cloudflare's WAF and rate limiting entirely. Firewall 143239782 exists to
 * close that and has been attached to nothing.
 *
 * WHY THIS IS A SCRIPT AND NOT ONE CURL. The call itself is one line. What makes
 * it safe is the four things around it:
 *
 *  1. Probe every live hostname BEFORE touching anything, so "it was already
 *     broken" and "we broke it" cannot be confused afterwards. Without a
 *     baseline, a hostname that was failing for its own reasons reads as damage.
 *  2. Attach.
 *  3. Probe again.
 *  4. If anything that WAS answering has stopped, DETACH and say so. The window
 *     in which this can hurt is then about a minute rather than however long it
 *     takes someone to notice.
 *
 * Step 4 is the reason this exists. The change is one API call to reverse, and a
 * revert nobody is awake to perform is not a revert.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/origin-lockdown-apply.ts            # report only
 *     scripts/v2/origin-lockdown-apply.ts --apply    # attach, verify, revert on harm
 *     scripts/v2/origin-lockdown-apply.ts --detach   # undo
 */

import { db } from "../../lib/paas/db.ts";

const FIREWALL_ID = 143239782;
const NODEBALANCER_ID = 2437817;

const TOKEN = process.env.LINODE_TOKEN ?? "";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const API = "https://api.linode.com/v4";

interface Device {
  id: number;
  entity?: { id?: number; type?: string; label?: string };
}

async function devices(): Promise<Device[]> {
  const res = await fetch(`${API}/networking/firewalls/${FIREWALL_ID}/devices`, { headers: H });
  if (!res.ok) throw new Error(`listing devices -> ${res.status}`);
  return ((await res.json()) as { data?: Device[] }).data ?? [];
}

/** Every hostname a customer could be using right now. */
async function liveHostnames(): Promise<string[]> {
  const rows = await db.select<{ hostname: string }>(
    "aliases",
    "select=hostname&released_at=is.null&order=hostname",
  );
  return [...new Set(rows.map((r) => r.hostname))];
}

/** null when the request could not be made at all, which is not the same as a status. */
async function probe(hostname: string): Promise<number | null> {
  try {
    const res = await fetch(`https://${hostname}/`, { redirect: "manual" });
    return res.status;
  } catch {
    return null;
  }
}

async function probeAll(hostnames: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const results = await Promise.all(hostnames.map((h) => probe(h)));
  hostnames.forEach((h, i) => out.set(h, results[i]));
  return out;
}

async function detach(): Promise<void> {
  for (const d of await devices()) {
    const res = await fetch(`${API}/networking/firewalls/${FIREWALL_ID}/devices/${d.id}`, {
      method: "DELETE",
      headers: H,
    });
    console.log(`  detached device ${d.id} (${d.entity?.type} ${d.entity?.id}) -> ${res.status}`);
  }
}

async function main(): Promise<number> {
  if (!TOKEN) {
    console.error("LINODE_TOKEN is not set");
    return 2;
  }
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--detach");

  const attached = await devices();
  console.log(`firewall ${FIREWALL_ID}: ${attached.length} device(s) attached`);
  for (const d of attached) console.log(`  ${d.entity?.type} ${d.entity?.id} (${d.entity?.label})`);

  if (undo) {
    await detach();
    console.log("detached — the origin is reachable directly again");
    return 0;
  }

  const hostnames = await liveHostnames();
  console.log(`\nprobing ${hostnames.length} live hostname(s) BEFORE any change`);
  const before = await probeAll(hostnames);
  const wereUp = hostnames.filter((h) => {
    const s = before.get(h);
    return s !== null && s !== undefined && s < 500;
  });
  for (const h of hostnames) console.log(`  ${before.get(h) ?? "no answer"}  ${h}`);
  console.log(`${wereUp.length} of ${hostnames.length} were answering; only those can be broken by this.`);

  if (!apply) {
    console.log("\nreport only. Re-run with --apply to attach.");
    return 0;
  }
  if (attached.length > 0) {
    console.log("\nalready attached — nothing to do");
    return 0;
  }

  console.log(`\nattaching nodebalancer ${NODEBALANCER_ID}`);
  const res = await fetch(`${API}/networking/firewalls/${FIREWALL_ID}/devices`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ id: NODEBALANCER_ID, type: "nodebalancer" }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`attach failed -> ${res.status}: ${body.slice(0, 300)}`);
    return 1;
  }
  console.log(`attached -> ${res.status}`);

  // A firewall change is not instant at the edge, and probing too early reports
  // damage that is really just propagation.
  await new Promise((r) => setTimeout(r, 20_000));

  console.log("\nprobing again");
  const after = await probeAll(wereUp);
  const broken = wereUp.filter((h) => {
    const s = after.get(h);
    return s === null || s === undefined || s >= 500;
  });
  for (const h of wereUp) console.log(`  ${before.get(h)} -> ${after.get(h) ?? "no answer"}  ${h}`);

  if (broken.length) {
    console.error(`\n${broken.length} hostname(s) STOPPED answering. Reverting.`);
    await detach();
    console.error("reverted. The lockdown is not in place; nothing is worse than before.");
    return 1;
  }

  console.log(`\nall ${wereUp.length} still answering. Origin lockdown is in place.`);
  console.log("Undo with: scripts/v2/origin-lockdown-apply.ts --detach");
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`origin-lockdown failed: ${(e as Error).message}`);
    console.error("If the attach succeeded before this threw, detach with --detach.");
    process.exit(2);
  },
);
