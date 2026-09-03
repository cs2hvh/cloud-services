/**
 * Migration drift check: does supabase/migrations/ match what the database has
 * actually applied?
 *
 * On 2026-09-01 the database held 20 applied migrations and the repo held 9
 * files. Eleven existed only in production — including the phantom-ledger fix,
 * set_price, and the grant that makes the sweep work at all. A rebuild from
 * the repo would have produced a billing system subtly different from the
 * live one. The cause was ordinary: apply_migration writes to the database and
 * to supabase_migrations.schema_migrations, not to the folder, and each
 * individual skip looked harmless.
 *
 * This compares BY NAME (the part after the version prefix), because the
 * earliest v2 files carry invented version numbers that do not match their
 * applied versions. It gates only the billing v2 era (versions >= 20260830);
 * older history is reported, not failed.
 *
 * Needs SUPABASE_DB_URL (a direct Postgres connection string — the
 * supabase_migrations schema is not exposed through PostgREST).
 *
 * Exit codes: 0 in sync, 1 drift, 2 could not check.
 */

import { readdirSync } from "node:fs";
// pg ships no type declarations and this script only ever runs under
// --experimental-strip-types in CI, so a typed import is not worth a devDependency.
// @ts-expect-error no declaration file for 'pg'
import pg from "pg";

const ERA = "20260830";

async function main(): Promise<number> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("[migration-drift] CANNOT CHECK: SUPABASE_DB_URL is not set");
    return 2;
  }

  const files = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const m = /^(\d+)_(.+)\.sql$/.exec(f);
      return m ? { version: m[1], name: m[2], file: f } : null;
    })
    .filter((f): f is { version: string; name: string; file: string } => f !== null);

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  let rows: Array<{ version: string; name: string }>;
  try {
    await client.connect();
    const res = await client.query(
      "select version, name from supabase_migrations.schema_migrations order by version"
    );
    rows = res.rows as Array<{ version: string; name: string }>;
  } catch (e) {
    console.error("[migration-drift] CANNOT CHECK:", e instanceof Error ? e.message : e);
    return 2;
  } finally {
    await client.end().catch(() => {});
  }

  const dbNames = new Set(rows.map((r) => r.name));
  const fileNames = new Set(files.map((f) => f.name));

  const appliedNotInRepo = rows.filter((r) => !fileNames.has(r.name));
  const inRepoNotApplied = files.filter((f) => !dbNames.has(f.name));

  const gatedA = appliedNotInRepo.filter((r) => r.version >= ERA);
  const gatedB = inRepoNotApplied.filter((f) => f.version >= ERA);

  console.log(`[migration-drift] database: ${rows.length} applied · repo: ${files.length} files · era gate: >= ${ERA}`);

  if (appliedNotInRepo.length > 0) {
    console.log(`\n[migration-drift] applied in the database with NO file in the repo (${appliedNotInRepo.length}):`);
    for (const r of appliedNotInRepo) console.log(`  ${r.version >= ERA ? "GATED" : "old  "}  ${r.version}  ${r.name}`);
  }
  if (inRepoNotApplied.length > 0) {
    console.log(`\n[migration-drift] files in the repo NOT applied to the database (${inRepoNotApplied.length}):`);
    for (const f of inRepoNotApplied) console.log(`  ${f.version >= ERA ? "GATED" : "old  "}  ${f.file}`);
  }

  if (gatedA.length > 0 || gatedB.length > 0) {
    console.error(
      `\n[migration-drift] DRIFT — ${gatedA.length} applied-but-unfiled, ${gatedB.length} filed-but-unapplied ` +
      `(era >= ${ERA}). Recover the missing files from supabase_migrations.schema_migrations.statements, ` +
      `or apply the unapplied ones, and commit in the same pass.`
    );
    return 1;
  }

  console.log("\n[migration-drift] OK — every v2-era migration exists on both sides");
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    console.error("[migration-drift] CANNOT CHECK:", e instanceof Error ? e.message : e);
    process.exitCode = 2;
  });
