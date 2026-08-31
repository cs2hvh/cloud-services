/**
 * Does the repo picker's source list actually work, across every provider?
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local scripts/v2/repos-proof.ts
 *
 * `GET /api/v2/repos` needs a signed-in session, so it cannot be curled. This
 * exercises the same adapter the route calls, against the real connections, so
 * a wiring mistake shows up here rather than as an empty picker.
 *
 * WHAT IT IS ACTUALLY CHECKING is the distinction the whole listing exists to
 * preserve: a provider that could not be READ must come back as `null`, never
 * as an empty array. Empty means "you have no repositories there" and invites
 * the user to reconnect an account that is fine; null means "we could not ask"
 * and invites a retry. Collapsing them is the defect this codebase keeps
 * finding, and a listing is the easiest place to reintroduce it.
 *
 * It reads with the service role because it is a script, not a route — the
 * route reads the same rows under RLS. That difference is deliberate and is why
 * this proves the ADAPTER, not the authorization.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 found something.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { listReposForTeam, type ConnectionRow } from "../../lib/paas/providers/adapter.ts";
import { mergeListings } from "../../lib/paas/providers/types.ts";

type Row = ConnectionRow & { deleted_at: string | null };

const line = () => console.log("─".repeat(78));

console.log("\nRepo listing proof");
line();

let rows: Row[];
try {
  rows = await db.select<Row>(
    "installations",
    "select=provider,external_id,account_login,access_token_ct,token_dek_id," +
      "token_expires_at,provider_metadata,deleted_at&deleted_at=is.null",
  );
} catch (e) {
  console.error(`  control plane unreadable — proving nothing: ${(e as Error).message.slice(0, 160)}`);
  process.exit(EXIT_CANNOT_RUN);
}

if (rows.length === 0) {
  // Not a pass. A run with nothing connected exercises none of the code this
  // script exists to check, and reporting it green would make the proof
  // vacuous the moment someone unlinks their account.
  console.error(`  no live connections — this proves nothing, so it is not reported as clean`);
  process.exit(EXIT_CANNOT_RUN);
}

console.log(`  ${rows.length} live connection(s):`);
for (const r of rows) {
  console.log(
    `    ${r.provider.padEnd(10)} ${r.external_id.padEnd(14)} ${r.account_login.padEnd(18)}` +
      ` credential ${r.access_token_ct !== null ? "stored" : "none (minted per request)"}`,
  );
}

const listings = await listReposForTeam(rows as ConnectionRow[]);

console.log();
for (const l of listings) {
  console.log(
    `  ${l.provider.padEnd(10)} ${l.repos === null ? `UNREADABLE — ${l.error}` : `${l.repos.length} repositories`}`,
  );
}

const { repos, failed, complete } = mergeListings(listings);

console.log();
console.log(`  merged: ${repos.length} repositories, ${failed.length} provider(s) unreadable, complete=${complete}`);
for (const r of repos.slice(0, 8)) {
  console.log(`    ${r.provider.padEnd(10)} ${r.fullName.padEnd(42)} default=${r.defaultBranch ?? "(unstated)"}`);
}
if (repos.length > 8) console.log(`    … and ${repos.length - 8} more`);

// The property, asserted rather than eyeballed: no provider may report both a
// failure and a list, and none may report neither.
const contradictions = listings.filter((l) => (l.repos === null) === (l.error === null));
if (contradictions.length) {
  console.error(`\n  ${contradictions.length} listing(s) report a list AND an error, or neither:`);
  for (const c of contradictions) console.error(`    ${c.provider}`);
}

line();
process.exit(contradictions.length || failed.length ? EXIT_FINDINGS : EXIT_CLEAN);
