/**
 * The column lists this lane selects, checked against the live schema.
 *
 * DEPLOYMENT_COLUMNS and PROJECT_COLUMNS are strings handed to PostgREST. A
 * name that is not a real column fails at request time, not at compile time,
 * so nothing this repo can run would have caught it. The row interfaces beside
 * them are a second hand-maintained statement about the same tables, and the
 * null git_sha crash came from exactly that pair disagreeing with reality: the
 * type said `string` over a column that had become nullable.
 *
 * cloud-app-v2-d8 built the equivalent over lib/paas/db.ts and exposed
 * paas.table_columns() to make it possible from a client. This is the same
 * check over this lane's own lists.
 *
 * TWO RULES TAKEN FROM THEIR VERSION AND FROM TODAY:
 *
 * 1. PARSE, DO NOT COPY. The column names are extracted from the constants
 *    themselves. A hand-maintained list here would drift silently in the same
 *    direction as the bug it is meant to catch.
 *
 * 2. SKIP, DO NOT PASS, when the database is unreachable. A schema check that
 *    quietly succeeds without reaching a schema is the seventh or eighth
 *    variation of the failure this project spent a day finding. `node --test`
 *    reports a skip visibly; a pass would be a lie.
 *
 * Run with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY present. Read-only: it
 * calls one SECURITY DEFINER function that returns column metadata.
 *
 * VERIFIED AGAINST THE LIVE DATABASE on 2026-08-26, both directions:
 *
 *   - unmodified: 5/5 pass, 0 skipped, so the live half really executed
 *   - `git_shaa` appended to DEPLOYMENT_COLUMNS: fails naming `git_shaa`,
 *     then a byte-identical restore goes green again
 *
 * That second run is the point. Three tests passing proves the check works or
 * proves nothing, and only a watched failure separates those. The first live
 * attempt returned 404 for every table — the RPC lives in `paas`, which is
 * exposed but is not the default schema, so without the profile headers below
 * PostgREST resolved it in `public` and found nothing. A version of this file
 * that treated an unreachable RPC as "no drift found" would have reported
 * green while never once reading a schema.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

import { DEPLOYMENT_COLUMNS } from "./deployments.ts";
import { PROJECT_COLUMNS } from "./serialize.ts";

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REACHABLE = Boolean(URL_ && KEY);

interface Column {
  column_name: string;
  is_nullable: string;
  data_type: string;
}

async function tableColumns(table: string): Promise<Column[]> {
  const res = await fetch(`${URL_}/rest/v1/rpc/table_columns`, {
    method: "POST",
    headers: {
      apikey: KEY as string,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      // paas is an exposed schema but not the default one; without this the
      // RPC resolves in public and returns 404. Only a real call shows that.
      "Content-Profile": "paas",
      "Accept-Profile": "paas",
    },
    body: JSON.stringify({ p_schema: "paas", p_table: table }),
  });
  if (!res.ok) throw new Error(`table_columns(${table}) -> ${res.status}`);
  return (await res.json()) as Column[];
}

/**
 * Column names out of a PostgREST select string.
 *
 * The strings mix plain columns with embedded resources —
 * `teams:team_id (ref, slug, name)` — and only the top-level names are columns
 * of this table. Everything inside parentheses is a joined table's columns and
 * must not be checked against this one.
 */
export function parseColumns(select: string): string[] {
  const withoutEmbeds = select.replace(/\([^)]*\)/g, "");
  return withoutEmbeds
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(":") ? "" : part))
    .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
}

/**
 * Every `.from("table").select("...")` pair written INLINE across the lane.
 *
 * WHY THIS EXISTS, and it is a correction to the two checks below rather than
 * an addition. Those cover DEPLOYMENT_COLUMNS and PROJECT_COLUMNS — the two
 * shared constants. Most reads in this codebase do not use them: pages and
 * routes write their select inline, and those were never checked.
 *
 * Within an hour of writing this file I shipped the exact bug it was meant to
 * prevent, in an inline select it did not cover:
 *
 *   .from("domains").select("ref,hostname,status,...")
 *
 * paas.domains has `domain` and `state`. There is no `hostname` and no
 * `status`. It typechecked, it passed lint, `next build` compiled it, and it
 * would have failed on the first real request — because a PostgREST column
 * name is a STRING, and no compiler in this stack looks inside it.
 *
 * The lesson is the one this project keeps relearning one layer out: a guard
 * covers what it enumerates. Two constants were enumerated; every other read
 * was not, and the gap was invisible because the guard was green.
 *
 * PAIRS ARE EXTRACTED, NOT LISTED. Scanning for the `.from(...).select(...)`
 * shape means a query written tomorrow is covered the day it is written.
 */
export function extractSelects(
  src: string
): Array<{ table: string; select: string }> {
  const out: Array<{ table: string; select: string }> = [];
  // .from("x") ... .select("y") — tolerant of whitespace, comments and chained
  // calls between the two, which is how these are actually written.
  const re = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)([\s\S]{0,600}?)\.select\(\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ table: m[1], select: m[3] });
  }
  return out;
}

test("the select strings parse to plausible column names", () => {
  // Runs without a database. If this ever yields nothing, every check below
  // would pass while examining an empty list — the input-side counter.
  const d = parseColumns(DEPLOYMENT_COLUMNS);
  const p = parseColumns(PROJECT_COLUMNS);
  assert.ok(d.length >= 10, `parsed only ${d.length} deployment columns`);
  assert.ok(p.length >= 10, `parsed only ${p.length} project columns`);
  assert.ok(d.includes("git_sha"), "git_sha must parse out");
  assert.ok(!d.includes("value_ct"), "ciphertext must never be selected");
  // Embedded resources must be excluded, not silently treated as columns.
  assert.ok(!p.includes("teams"), "an embed is not a column of this table");
  assert.ok(!p.includes("ref, slug, name"), "embed contents must be stripped");
});

test(
  "every selected column exists on the live table",
  { skip: REACHABLE ? false : "SUPABASE_URL / SERVICE_ROLE_KEY not set" },
  async () => {
    for (const [table, select] of [
      ["deployments", DEPLOYMENT_COLUMNS],
      ["projects", PROJECT_COLUMNS],
    ] as const) {
      const live = await tableColumns(table);
      assert.ok(live.length > 0, `table_columns returned nothing for ${table}`);
      const known = new Set(live.map((c) => c.column_name));

      const missing = parseColumns(select).filter((c) => !known.has(c));
      assert.deepEqual(
        missing,
        [],
        `${table}: selected columns that do not exist — these fail at request time, not compile time`
      );
    }
  }
);

test(
  "no column this lane selects is one it must never read",
  { skip: REACHABLE ? false : "SUPABASE_URL / SERVICE_ROLE_KEY not set" },
  async () => {
    // The env route's defence is structural: no read path can produce
    // ciphertext to decrypt. That holds only while value_ct stays out of every
    // select string, and it is a column on a table this lane does read.
    const live = await tableColumns("env_vars");
    assert.ok(
      live.some((c) => c.column_name === "value_ct"),
      "value_ct should exist — if it has been renamed this check is now vacuous"
    );
    for (const select of [DEPLOYMENT_COLUMNS, PROJECT_COLUMNS]) {
      assert.ok(!select.includes("value_ct"));
    }
  }
);

// ── every inline select, against the live schema ─────────────────────

function laneSources(): Array<{ path: string; text: string }> {
  const roots = [
    join(HERE, "..", "..", "..", "api", "v2"),
    join(HERE, "..", "..", "..", "dashboard", "v2"),
  ];
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !entry.includes(".test.")
      ) {
        out.push({ path: full, text: readFileSync(full, "utf8") });
      }
    }
  };
  roots.forEach(walk);
  return out;
}

test("the inline-select scan finds the lane's queries", () => {
  // The input-side counter. A regex that stops matching would otherwise make
  // the live check below pass while examining nothing.
  const pairs = laneSources().flatMap((f) => extractSelects(f.text));
  assert.ok(
    pairs.length >= 10,
    `found only ${pairs.length} .from().select() pairs — the extractor has stopped working`
  );
});

test(
  "every inline select names real columns",
  { skip: REACHABLE ? false : "SUPABASE_URL / SERVICE_ROLE_KEY not set" },
  async () => {
    const files = laneSources();
    const bad: string[] = [];
    const cache = new Map<string, Set<string>>();

    for (const file of files) {
      for (const { table, select } of extractSelects(file.text)) {
        if (!cache.has(table)) {
          try {
            const live = await tableColumns(table);
            cache.set(table, new Set(live.map((c) => c.column_name)));
          } catch {
            // A table this lane reads that paas does not expose is its own
            // problem, reported rather than silently skipped.
            cache.set(table, new Set());
          }
        }
        const known = cache.get(table)!;
        if (known.size === 0) {
          bad.push(`${file.path}: table "${table}" returned no columns`);
          continue;
        }
        for (const col of parseColumns(select)) {
          if (!known.has(col)) {
            bad.push(`${file.path}: ${table}.${col} does not exist`);
          }
        }
      }
    }

    assert.deepEqual(
      bad,
      [],
      `inline selects naming columns that do not exist — these fail at request time, not compile time:\n${bad.join("\n")}`
    );
  }
);

test("the extractor finds a from/select pair and the columns in it", () => {
  const found = extractSelects(
    `const x = await db.from("domains").select("ref,domain,state");`
  );
  assert.deepEqual(found, [{ table: "domains", select: "ref,domain,state" }]);
  assert.deepEqual(parseColumns(found[0].select), ["ref", "domain", "state"]);
});

test("the extractor survives a chained builder with a comment between", () => {
  // How these are actually written — .from() and .select() are rarely adjacent.
  const found = extractSelects(
    `db\n  .from("projects")\n  // a comment\n  .select("ref,name")\n  .eq("x", 1)`
  );
  assert.deepEqual(found, [{ table: "projects", select: "ref,name" }]);
});

test("the extractor would have caught the domains bug", () => {
  // The literal line that shipped. This is the failure input actually
  // arriving, rather than a fixture that resembles it.
  const found = extractSelects(
    `.from("domains").select("ref,hostname,status,verified_at,cf_hostname_id,created_at")`
  );
  const cols = parseColumns(found[0].select);
  assert.ok(cols.includes("hostname"), "the bad column must survive parsing");
  assert.ok(cols.includes("status"), "so the live check can reject it");
});

// ── the checks must be watchable failing ─────────────────────────────
// Their eighth instance: watching a check fail is only evidence if the
// failing input actually arrived. A no-op injection is a green run watched
// twice.

test("the parser rejects an invented column", () => {
  const parsed = parseColumns("ref, name, not_a_real_column");
  assert.ok(
    parsed.includes("not_a_real_column"),
    "the parser must surface an invented name, or the live check can never see one"
  );
});

test("the parser does not mistake an embed for a column", () => {
  const parsed = parseColumns("ref, name, teams:team_id (ref, slug, name)");
  assert.deepEqual(parsed, ["ref", "name"], "embeds and their contents are not columns here");
});
