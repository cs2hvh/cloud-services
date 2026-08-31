import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "./db.ts";

/**
 * The row interfaces in db.ts against the live schema.
 *
 * WHY THIS EXISTS. `ProjectRow` declared neither `scale_to_zero` nor
 * `idle_seconds` while `idle-sweep.ts` read both. Nothing failed — PostgREST
 * returns the columns regardless, so the reads worked and the compiler simply
 * had nothing to check them against. It surfaced only when the repo was
 * typechecked for the first time, months after the columns were added, on the
 * path that decides whether an app sleeps.
 *
 * The same class produced the `git_sha` drift, and cloud-services-2f proposed
 * this test after their `serialize.ts` and this file disagreed about
 * `scaled_to_zero_at`. Their version reads the schema and asserts the declared
 * columns are real; this adds the nullability half, because a field typed
 * non-nullable against a NULLABLE column is how `null` reaches code that cannot
 * represent it.
 *
 * WHY IT PARSES THE SOURCE RATHER THAN LISTING COLUMNS. A hand-maintained copy
 * of each interface is one more thing that drifts, and it would drift silently
 * in the same direction as the bug. Reading db.ts means the test checks the
 * ACTUAL declaration.
 *
 * WHICH BUYS A NEW FAILURE MODE, so it is guarded: a parser that matches
 * nothing reports every table clean. Today produced seven of those. So the
 * parse asserts it found a plausible number of interfaces and fields before it
 * asserts anything about them, and an unreachable database SKIPS rather than
 * passes — skip means "could not check", pass means "checked and fine", and
 * conflating them is how a suite goes green while asserting nothing.
 */

/** Row interface → the paas table it describes. */
const ROW_TABLES: Record<string, string> = {
  ClusterRow: "clusters",
  BuildVmRow: "build_vms",
  TeamRow: "teams",
  ProjectRow: "projects",
  EnvironmentRow: "environments",
  DeploymentRow: "deployments",
  AliasRow: "aliases",
  EnvVarRow: "env_vars",
};

interface ParsedField {
  name: string;
  /** True when the declared type admits null — `string | null`, `number | null`. */
  nullable: boolean;
  optional: boolean;
}

/**
 * Extract `export interface XRow { ... }` field declarations from db.ts.
 *
 * Deliberately string-based rather than regex-heavy for the field split: today
 * two separate checks passed while examining zero call sites because a regex
 * lost its backslashes to a patching step. A regex is itself a parse that can
 * silently match nothing, so the less of one this depends on, the better.
 */
function parseRowInterfaces(source: string): Map<string, ParsedField[]> {
  const out = new Map<string, ParsedField[]>();

  for (const rowName of Object.keys(ROW_TABLES)) {
    const marker = `export interface ${rowName} {`;
    const start = source.indexOf(marker);
    if (start === -1) continue;

    // Walk braces rather than matching to the first `}`, which a nested object
    // type would truncate.
    let depth = 0;
    let end = -1;
    for (let i = start + marker.length - 1; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) continue;

    const body = source.slice(start + marker.length, end);
    const fields: ParsedField[] = [];

    // Strip block comments so a `//` or `/** */` mentioning a field name does
    // not read as a declaration.
    const cleaned = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    for (const chunk of cleaned.split(/[;\n]/)) {
      const line = chunk.trim();
      if (!line) continue;
      const colon = line.indexOf(":");
      if (colon <= 0) continue;
      const rawName = line.slice(0, colon).trim();
      const type = line.slice(colon + 1).trim();
      if (!/^[a-z_][a-z0-9_]*\??$/i.test(rawName)) continue;
      const optional = rawName.endsWith("?");
      fields.push({
        name: optional ? rawName.slice(0, -1) : rawName,
        nullable: /\bnull\b/.test(type),
        optional,
      });
    }
    if (fields.length) out.set(rowName, fields);
  }
  return out;
}

const SOURCE = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const PARSED = parseRowInterfaces(SOURCE);

async function liveColumns(table: string): Promise<Map<string, boolean> | null> {
  try {
    const rows = await db.rpc<Array<{ column_name: string; is_nullable: string }>>("table_columns", {
      p_schema: "paas",
      p_table: table,
    });
    return new Map(rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
  } catch {
    return null;
  }
}

// ── the parse must be capable of failing ────────────────────────────────────

test("the parser found the interfaces it claims to check", () => {
  // Without this, a parser that matched nothing would report every table clean.
  assert.equal(
    PARSED.size,
    Object.keys(ROW_TABLES).length,
    `parsed ${PARSED.size} of ${Object.keys(ROW_TABLES).length} row interfaces — ` +
      `missing: ${Object.keys(ROW_TABLES).filter((r) => !PARSED.has(r)).join(", ")}`,
  );
});

test("each parsed interface has a plausible number of fields", () => {
  for (const [rowName, fields] of PARSED) {
    assert.ok(fields.length >= 3, `${rowName} parsed only ${fields.length} field(s) — the parser is broken, not the type`);
  }
});

test("the parser reads nullability, not just names", () => {
  // A parser that returned nullable:false for everything would satisfy the
  // column-existence test and silently pass the nullability one.
  const project = PARSED.get("ProjectRow") ?? [];
  const framework = project.find((f) => f.name === "framework");
  const slug = project.find((f) => f.name === "slug");
  assert.ok(framework?.nullable, "framework is declared `string | null` and must parse as nullable");
  assert.ok(slug && !slug.nullable, "slug is declared `string` and must parse as non-nullable");
});

// ── the actual conformance checks ───────────────────────────────────────────

for (const [rowName, table] of Object.entries(ROW_TABLES)) {
  test(`${rowName} declares only columns that exist in paas.${table}`, async (t) => {
    const live = await liveColumns(table);
    if (live === null) return t.skip("database unreachable — conformance NOT verified");
    assert.ok(live.size > 0, `paas.${table} reported zero columns — that is a broken read, not an empty table`);

    const fields = PARSED.get(rowName);
    assert.ok(fields, `${rowName} was not parsed`);

    const unknown = fields!.filter((f) => !live.has(f.name)).map((f) => f.name);
    assert.deepEqual(
      unknown,
      [],
      `${rowName} declares field(s) with no column in paas.${table}: ${unknown.join(", ")}`,
    );
  });

  test(`${rowName} nullability matches paas.${table}`, async (t) => {
    const live = await liveColumns(table);
    if (live === null) return t.skip("database unreachable — nullability NOT verified");

    const fields = PARSED.get(rowName) ?? [];
    const wrong: string[] = [];
    for (const f of fields) {
      const colNullable = live.get(f.name);
      if (colNullable === undefined) continue; // reported by the test above
      // A field typed non-nullable against a NULLABLE column is the dangerous
      // direction: null reaches code that cannot represent it. The reverse is
      // merely pessimistic, so it is reported but distinguished.
      if (colNullable && !f.nullable && !f.optional) {
        wrong.push(`${f.name} (column is NULLABLE, type is not)`);
      }
    }
    assert.deepEqual(wrong, [], `${rowName} nullability drift: ${wrong.join("; ")}`);
  });
}

test("columns added to paas.projects are reflected in ProjectRow", async (t) => {
  // The specific bug, pinned. scale_to_zero and idle_seconds were added by the
  // scale-to-zero migration and ProjectRow was not updated, so idle-sweep.ts
  // read two fields its own type did not declare.
  const live = await liveColumns("projects");
  if (live === null) return t.skip("database unreachable");
  const declared = new Set((PARSED.get("ProjectRow") ?? []).map((f) => f.name));
  for (const col of ["scale_to_zero", "idle_seconds"]) {
    assert.ok(live.has(col), `paas.projects.${col} is missing from the schema`);
    assert.ok(declared.has(col), `ProjectRow does not declare ${col}, which the idle sweep reads`);
  }
});
