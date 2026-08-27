/**
 * Test-only: a re-link that carries no credential must not erase the stored
 * one.
 *
 * WHY THIS EXISTS EVEN THOUGH IT CANNOT HAPPEN TODAY.
 *
 * The deploy lane checked their GitHub callback and it is structurally safe:
 * `app/api/v2/github/callback/route.ts` early-returns when the row already
 * belongs to the caller's team, and its only write is an INSERT — there is no
 * UPDATE path a credential-less reconfigure could reach.
 *
 * So the concern does not bite now. It starts biting the moment that INSERT
 * becomes an upsert through `paas.link_installation` — which is exactly the
 * "simplification" someone reaches for when a second and third provider already
 * go through one RPC. At that point a GitHub reconfigure, which sends no token,
 * would overwrite a working GitLab connection's credential with NULL and turn
 * a live connection into one that 401s on next use.
 *
 * The rule lives in the migration as `coalesce(excluded.x, installations.x)`.
 * This asserts the migration still SAYS so, by reading it — the only check
 * available without applying the schema, and enough to make deleting the
 * coalesce a test failure rather than a silent behaviour change.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

function multiProviderMigration(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.includes("installations_multi_provider"));
  assert.equal(files.length, 1, `expected exactly one multi-provider migration, found ${files.length}`);
  return readFileSync(join(MIGRATIONS, files[0]), "utf8");
}

/** Strip comments, so a docblock explaining the rule cannot satisfy the check. */
function stripSql(src: string): string {
  return src.replace(/^\s*--.*$/gm, "");
}

test("the migration exists and is readable", () => {
  // Every assertion below is a search over its text. A missing file would make
  // them all pass by finding nothing to contradict them.
  const sql = multiProviderMigration();
  assert.ok(sql.length > 1000, "migration is suspiciously short");
  assert.match(sql, /link_installation/);
});

test("a re-link with no token KEEPS the stored credential", () => {
  // The load-bearing line. Without coalesce, `excluded.access_token_ct` is NULL
  // on a credential-less re-link and the UPDATE wipes a working connection.
  const sql = stripSql(multiProviderMigration());
  for (const col of ["access_token_ct", "refresh_token_ct", "token_dek_id", "token_expires_at"]) {
    assert.match(
      sql,
      new RegExp(`${col}\\s*=\\s*coalesce\\(\\s*excluded\\.${col}\\s*,\\s*paas\\.installations\\.${col}\\s*\\)`),
      `${col} must be coalesced on conflict, or a re-link carrying no token erases it`,
    );
  }
});

test("the credential columns are all four covered, with none forgotten", () => {
  // A partially-coalesced set is worse than none: the row would keep a
  // ciphertext whose dek_id had been nulled, which is unreadable AND looks
  // credentialed. The pair constraint would reject it, so the symptom is a
  // failed re-link rather than a wrong one — but only if all four are here.
  const sql = stripSql(multiProviderMigration());
  const coalesced = [...sql.matchAll(/(\w+)\s*=\s*coalesce\(\s*excluded\.\1/g)].map((m) => m[1]);
  for (const col of ["access_token_ct", "refresh_token_ct", "token_dek_id", "token_expires_at"]) {
    assert.ok(coalesced.includes(col), `${col} is not coalesced`);
  }
});

test("ciphertext and dek_id are constrained as a pair", () => {
  // A dek_id without a ciphertext is a row that looks credentialed and 401s on
  // first use; a ciphertext without its dek_id is unreadable.
  const sql = stripSql(multiProviderMigration());
  assert.match(sql, /installations_token_pair/);
  assert.match(sql, /access_token_ct is null and token_dek_id is null/);
});

test("the per-provider grammar check fails CLOSED on an unknown provider", () => {
  // A CASE with no ELSE returns NULL for an unmatched provider, and a CHECK
  // constraint PASSES on NULL — so a fourth git_provider value would silently
  // switch the constraint off for it. `else false` is what stops that.
  const sql = stripSql(multiProviderMigration());
  const check = /installations_account_shape[\s\S]*?else\s+false[\s\S]*?end/i;
  assert.match(sql, check, "the account-shape CASE must end in `else false`");
});

test("every provider in the enum has a grammar branch", () => {
  // A provider present in paas.git_provider but absent from the CASE hits
  // `else false` and can never store a row — which fails closed, correctly, but
  // as an unexplained write error rather than a missing feature.
  const sql = stripSql(multiProviderMigration());
  for (const p of ["github", "gitlab", "bitbucket"]) {
    assert.match(sql, new RegExp(`when\\s+'${p}'\\s+then`), `${p} has no grammar branch`);
  }
});

test("the RPC takes ciphertext, never a plaintext token", () => {
  // Encrypting in SQL would put the master key in the database, which is the
  // one place it must not be. bytea parameters mean no plaintext credential
  // reaches a bind parameter, a query log, or pg_stat_statements.
  const sql = stripSql(multiProviderMigration());
  assert.match(sql, /p_access_token_ct\s+bytea/);
  assert.match(sql, /p_refresh_token_ct\s+bytea/);
  assert.ok(!/p_access_token\s+text/.test(sql), "no plaintext token parameter");
});

test("the old bigint overload is DROPPED, not left callable", () => {
  // `create or replace` cannot change a parameter type, so without an explicit
  // drop the old signature stays callable and silently accepts only GitHub.
  const sql = stripSql(multiProviderMigration());
  assert.match(sql, /drop function if exists paas\.link_installation\(bigint/);
  assert.match(sql, /drop function if exists paas\.unlink_installation\(bigint\)/);
});

test("both new functions are granted EXECUTE explicitly", () => {
  // A new function has no grant at all. GRANT and RLS are independent gates
  // that fail with near-identical errors, and a full debugging round was
  // already lost to that pair on this table.
  const sql = stripSql(multiProviderMigration());
  assert.match(sql, /grant execute on function paas\.link_installation/);
  assert.match(sql, /grant execute on function paas\.unlink_installation/);
  assert.match(sql, /revoke all on function paas\.link_installation/);
});

test("the checker can fail — a coalesce removed is detected", () => {
  // Proves the matcher works rather than trusting that a clean run means clean.
  const mangled = stripSql(multiProviderMigration()).replace(
    /access_token_ct\s*=\s*coalesce\([^)]*\)/,
    "access_token_ct = excluded.access_token_ct",
  );
  assert.doesNotMatch(
    mangled,
    /access_token_ct\s*=\s*coalesce\(\s*excluded\.access_token_ct/,
    "removing the coalesce must be visible to this check",
  );
});
