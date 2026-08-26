/**
 * GitHub App installations: what GitHub knows, against what we recorded.
 *
 * WHY THIS EXISTS. The App was installed successfully — installation 156779383,
 * one repository, correct permissions — and `paas.installations` stayed at zero.
 * Nothing was broken in the install; the row simply never got written, because
 * every path that would have written it runs in a Next.js app that is not
 * deployed. GitHub POSTed the `installation` event to a 404 and redirected the
 * browser to a 404, and the only visible symptom was a wrong-turn page.
 *
 * That is the failure this file exists for, and it is not a one-off:
 *
 *   - Webhooks are LOSSY. A missed delivery, a deploy window, a wrong URL, a
 *     5xx — GitHub retries a few times and then stops. There is no reconciler
 *     in a webhook.
 *   - The browser callback is worse: it fires once, and a user who closes the
 *     tab has installed the App with nothing recorded anywhere.
 *
 * So the API is treated as the source of truth and the database as a cache that
 * can be behind — the same shape as every other drift check on this platform.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: invent a team binding. `team_id` and
 * `installed_by` are NOT NULL, and GitHub cannot tell us which AhuraCloud user
 * owns an installation — that fact only exists at callback time, when a
 * logged-in user is present. Guessing it would attach a stranger's repositories
 * to whichever team happened to be first in the table. Unclaimed installations
 * are therefore REPORTED, not written, and `--claim` binds one explicitly.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/installations-sync.ts
 *   ... --claim <installation_id> --team <slug> --user <uuid>
 *
 * Exit codes follow the observability lane's contract:
 *   0  recorded and GitHub agree
 *   1  could not reach GitHub or the database — nothing compared
 *  10  they disagree; something is unrecorded or stale
 */

import { listInstallations, mintInstallationToken, type Installation } from "../../lib/paas/github/app.ts";
import { db } from "../../lib/paas/db.ts";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

interface InstallationRow {
  installation_id: number;
  team_id: string;
  account_login: string;
  account_type: string | null;
  deleted_at: string | null;
}

// ── read both sides ─────────────────────────────────────────────────────────

let live: Installation[];
try {
  live = await listInstallations();
} catch (err) {
  console.error(`[installations] GitHub unreachable — nothing compared: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

let recorded: InstallationRow[];
try {
  recorded = await db.select<InstallationRow>("installations", "select=*");
} catch (err) {
  console.error(`[installations] database unreachable — nothing compared: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const byId = new Map(recorded.filter((r) => !r.deleted_at).map((r) => [Number(r.installation_id), r]));

console.log(`GitHub reports ${live.length} installation(s); ${byId.size} recorded and live in paas.installations\n`);

// ── claim mode ──────────────────────────────────────────────────────────────

const claimId = arg("claim");
if (claimId) {
  const teamSlug = arg("team");
  const userId = arg("user");
  if (!teamSlug || !userId) {
    console.error("--claim requires --team <slug> and --user <uuid>. Neither is guessable:");
    console.error("  team_id decides whose apps these repositories can back;");
    console.error("  installed_by is the audit record of who authorised it.");
    process.exit(1);
  }
  const inst = live.find((i) => String(i.id) === claimId);
  if (!inst) {
    console.error(`GitHub does not report installation ${claimId}. Refusing to record an installation that does not exist.`);
    process.exit(1);
  }
  const [team] = await db.select<{ id: string; slug: string }>("teams", `select=id,slug&slug=eq.${teamSlug}`);
  if (!team) {
    console.error(`no team with slug ${JSON.stringify(teamSlug)}`);
    process.exit(1);
  }
  await db.insert("installations", {
    installation_id: inst.id,
    team_id: team.id,
    account_login: inst.account?.login ?? "unknown",
    account_type: inst.account?.type ?? null,
    installed_by: userId,
  });
  console.log(`claimed installation ${inst.id} (${inst.account?.login}) for team ${team.slug}`);
  process.exit(0);
}

// ── compare ─────────────────────────────────────────────────────────────────

let drift = 0;

for (const inst of live) {
  const row = byId.get(inst.id);
  const label = `${String(inst.id).padEnd(12)} ${(inst.account?.login ?? "?").padEnd(20)}`;

  // What can this installation actually reach? A row that exists proves nothing
  // about whether the credential still works — tokens are minted per use, and a
  // revoked installation still has a row.
  let reach = "";
  try {
    const tok = await mintInstallationToken(inst.id);
    const res = await fetch("https://api.github.com/installation/repositories", {
      headers: { Authorization: `Bearer ${tok.token}`, Accept: "application/vnd.github+json", "User-Agent": "ahura-v2" },
    });
    const body = (await res.json()) as { total_count?: number };
    reach = res.ok ? `${body.total_count ?? 0} repo(s)` : `UNREACHABLE (${res.status})`;
  } catch {
    reach = "TOKEN FAILED";
  }

  if (!row) {
    drift++;
    console.log(`UNRECORDED  ${label} ${reach}`);
    console.log(`            GitHub has it, we do not. Claim it with:`);
    console.log(`              --claim ${inst.id} --team <slug> --user <uuid>`);
  } else {
    console.log(`OK          ${label} ${reach}  team=${row.team_id.slice(0, 8)}…`);
  }
}

// The other direction: a row for an installation GitHub no longer reports means
// the App was uninstalled and we kept billing-relevant state pointing at repos
// we can no longer read.
const liveIds = new Set(live.map((i) => i.id));
for (const row of byId.values()) {
  if (!liveIds.has(Number(row.installation_id))) {
    drift++;
    console.log(`STALE       ${String(row.installation_id).padEnd(12)} ${row.account_login.padEnd(20)} recorded, but GitHub does not report it — uninstalled?`);
  }
}

if (drift === 0) {
  console.log("\nCLEAN — every installation GitHub reports is recorded, and every record is real.");
  process.exit(0);
}

console.log(`\n${drift} installation(s) disagree between GitHub and paas.installations.`);
process.exit(10);
