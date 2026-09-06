/**
 * The reserved hostname set lives in two places on purpose: lib/paas/hostnames.ts
 * for the deploy path, and paas.reserved_labels in the database, where a trigger
 * refuses a direct PostgREST write the application never sees (the hole proven
 * live on 2026-09-06: any member could insert fallback.ahurasense.com).
 *
 * Two copies drift. This test is what keeps them one set: it reads the seed out
 * of the migration that created the table and compares it, as a set, with the
 * TypeScript source. The same for the platform zones against the custom-domain
 * reserved suffixes. If a label is added to either side alone, this fails.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESERVED_LABELS } from "@/lib/paas/hostnames";
import { RESERVED_SUFFIXES } from "@/app/api/v2/_lib/domains";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260906065300_paas_alias_writes_go_through_rpcs.sql",
);

function seededValues(sql: string, table: string): string[] {
  const start = sql.indexOf(`insert into ${table}`);
  if (start < 0) throw new Error(`no insert into ${table} in the migration`);
  const end = sql.indexOf("on conflict", start);
  const block = sql.slice(start, end);
  return [...block.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
}

describe("paas.reserved_labels mirrors RESERVED_LABELS", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("the seed is not empty and the source set is not empty", () => {
    // An empty side would make the comparison below vacuous in one direction.
    expect(RESERVED_LABELS.size).toBeGreaterThan(50);
    expect(seededValues(sql, "paas.reserved_labels").length).toBeGreaterThan(50);
  });

  it("the SQL seed and the TypeScript set are the same set", () => {
    const seeded = new Set(seededValues(sql, "paas.reserved_labels"));
    const source = new Set(RESERVED_LABELS);
    const onlyInSql = [...seeded].filter((l) => !source.has(l));
    const onlyInTs = [...source].filter((l) => !seeded.has(l));
    expect({ onlyInSql, onlyInTs }).toEqual({ onlyInSql: [], onlyInTs: [] });
  });

  it("the platform zones match the custom-domain reserved suffixes", () => {
    expect(new Set(seededValues(sql, "paas.platform_zones"))).toEqual(new Set(RESERVED_SUFFIXES));
  });

  it("the migration closes the table to client writes", () => {
    expect(sql).toMatch(/revoke insert, update, delete on paas\.aliases from authenticated/);
    expect(sql).toMatch(/drop policy if exists aliases_write on paas\.aliases/);
    expect(sql).toMatch(/create trigger aliases_reserved_guard/);
  });
});
