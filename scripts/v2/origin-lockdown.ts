/**
 * Close the origin bypass: only Cloudflare may reach the gateway.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/origin-lockdown.ts [--apply] [--detach]
 *
 * THE HOLE. `curl -k -H "Host: v2-docker.ahurasense.com" https://172.236.185.23/`
 * returns 200, and so does plain HTTP on port 80. Every tenant app is reachable
 * without Cloudflare: no WAF, no DDoS protection, no TLS on the :80 path, and
 * the per-tenant rate limit is defeated because a direct request carries no
 * CF-Connecting-IP and they therefore all share one bucket.
 *
 * WHY NOT FIX IT IN TRAEFIK. The Service is externalTrafficPolicy: Cluster
 * behind a NodeBalancer in TCP mode, so the source is SNAT-ed — Traefik logs
 * node and cluster addresses for EVERY request, Cloudflare-borne or not. An
 * ipAllowList of Cloudflare's ranges would match nothing and refuse everything.
 * The filter has to sit somewhere that still sees the real source, and the
 * NodeBalancer is the first such place.
 *
 * WHY A FIREWALL RATHER THAN PROXY PROTOCOL. Proxy protocol would let Traefik
 * see real client IPs, which is better in the long run — but it changes how
 * every request is parsed, and if the two ends disagree about whether the header
 * is present, ALL ingress breaks at once. A firewall changes nothing about how
 * traffic flows; it only decides what arrives. If the rules are wrong the
 * failure is "nothing gets in", which is loud, immediate, and undone by
 * detaching.
 *
 * SCOPE. Attached ONLY to this cluster's NodeBalancer. The credential in use
 * cannot see anything else — it lists one NodeBalancer and two LKE nodes, all
 * belonging to this cluster — so a mistake here cannot reach another service.
 *
 * RANGES ARE FETCHED, NOT HARDCODED. Cloudflare publishes them and they change.
 * A pinned copy is correct until the day it silently is not, and the symptom
 * would be customers in one region getting refused.
 */

export {}; // makes this a module, so the top-level await below is legal

const TOKEN = process.env.V2_LINODE_TOKEN?.replace(/^"|"$/g, "");
const APPLY = process.argv.includes("--apply");
const DETACH = process.argv.includes("--detach");
const LABEL = "ahura-v2-origin-cloudflare-only";

const EXIT_CANNOT_RUN = 1;
const EXIT_FINDINGS = 10;

const line = () => console.log("─".repeat(96));

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.linode.com/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function cloudflareRanges(): Promise<{ v4: string[]; v6: string[] }> {
  const [v4, v6] = await Promise.all([
    fetch("https://www.cloudflare.com/ips-v4").then((r) => r.text()),
    fetch("https://www.cloudflare.com/ips-v6").then((r) => r.text()),
  ]);
  const parse = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return { v4: parse(v4), v6: parse(v6) };
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("V2_LINODE_TOKEN is not set — did nothing.");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const nbs = (await api("/nodebalancers")) as { data: Array<{ id: number; label: string; ipv4: string }> };
  const gateway = nbs.data.find((n) => n.label.startsWith("lke"));
  if (!gateway) {
    console.error("no LKE NodeBalancer found — did nothing.");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const existing = (await api("/networking/firewalls")) as {
    data: Array<{ id: number; label: string; status: string }>;
  };
  const mine = existing.data.find((f) => f.label === LABEL);

  console.log(`\nOrigin lockdown — NodeBalancer ${gateway.id} (${gateway.label}) at ${gateway.ipv4}`);
  line();

  if (DETACH) {
    if (!mine) {
      console.log("  Nothing to detach: no firewall with this label exists.");
      return;
    }
    console.log(`  ${APPLY ? "deleting" : "would delete"} firewall ${mine.id} — the origin becomes open again.`);
    if (APPLY) await api(`/networking/firewalls/${mine.id}`, { method: "DELETE" });
    return;
  }

  const { v4, v6 } = await cloudflareRanges();
  // A short list is a fetch that half-worked. Cloudflare publishes ~15 v4 and
  // ~7 v6; refusing here is what stops a truncated read becoming a firewall
  // that locks out most of Cloudflare.
  if (v4.length < 10 || v6.length < 4) {
    console.error(`  Cloudflare returned ${v4.length} v4 and ${v6.length} v6 ranges — too few to trust. Did nothing.`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }
  console.log(`  Cloudflare ranges: ${v4.length} v4, ${v6.length} v6`);

  const rules = {
    inbound_policy: "DROP",
    // Outbound stays open. This is about who may REACH the gateway; restricting
    // what it may reach is a different control and breaking it would stop apps
    // calling the internet, which is a legitimate thing every app does.
    outbound_policy: "ACCEPT",
    inbound: [
      {
        label: "cloudflare-https",
        action: "ACCEPT",
        protocol: "TCP",
        ports: "443",
        addresses: { ipv4: v4, ipv6: v6 },
      },
      {
        label: "cloudflare-http",
        action: "ACCEPT",
        protocol: "TCP",
        ports: "80",
        addresses: { ipv4: v4, ipv6: v6 },
      },
    ],
    outbound: [],
  };

  if (mine) {
    console.log(`  updating existing firewall ${mine.id} (${mine.status})`);
    if (APPLY) await api(`/networking/firewalls/${mine.id}/rules`, { method: "PUT", body: JSON.stringify(rules) });
  } else {
    console.log(`  ${APPLY ? "creating" : "would create"} firewall "${LABEL}"`);
    console.log(`    inbound_policy DROP; ACCEPT 443 and 80 from Cloudflare only`);
    console.log(`    to be attached to nodebalancer ${gateway.id} and NOTHING else`);
    if (APPLY) {
      const created = (await api("/networking/firewalls", {
        method: "POST",
        body: JSON.stringify({ label: LABEL, rules }),
      })) as { id: number };

      // ATTACH SEPARATELY, AND VERIFY. Passing `entities` to the create call is
      // silently IGNORED — the firewall comes back enabled, with correct rules,
      // and attached to nothing. It looks exactly like protection and is none.
      //
      // The first run of this script created precisely that and reported
      // "attached to nodebalancer 2437817", because it printed what it had
      // asked for rather than what happened.
      try {
        await api(`/networking/firewalls/${created.id}/devices`, {
          method: "POST",
          body: JSON.stringify({ type: "nodebalancer", id: gateway.id }),
        });
      } catch (e) {
        console.error(`
  ATTACH FAILED: ${(e as Error).message.slice(0, 200)}`);
        console.error(`  The firewall exists and PROTECTS NOTHING. The origin is still open.`);
        console.error(`  This token has no nodebalancer grant — check /profile/grants.`);
        process.exitCode = EXIT_CANNOT_RUN;
        return;
      }

      // Read it back. A create that reports success and an attachment that did
      // not happen are indistinguishable without this.
      const after = (await api(`/networking/firewalls/${created.id}`)) as { entities?: unknown[] };
      if (!after.entities?.length) {
        console.error(`
  ATTACHED TO NOTHING despite no error. The origin is still open.`);
        process.exitCode = EXIT_CANNOT_RUN;
        return;
      }
      console.log(`  verified attached to ${after.entities.length} entity(ies)`);
    }
  }

  console.log();
  line();
  if (!APPLY) {
    console.log("  DRY RUN — nothing changed. Re-run with --apply.");
    console.log("  Undo at any time with --detach --apply.");
    process.exitCode = EXIT_FINDINGS;
    return;
  }
  console.log("  Applied. VERIFY BOTH DIRECTIONS NOW:");
  console.log("    through Cloudflare  https://v2-docker.ahurasense.com/   must still be 200");
  console.log(`    direct to origin    https://${gateway.ipv4}/            must now FAIL`);
  console.log("  If the first breaks, undo immediately: --detach --apply");
}

await main();
