/**
 * Verifies migration 20260806000002 — that a customer cannot read the `inference`
 * schema directly, and so cannot see which upstream we proxy to or what it costs
 * us.
 *
 * Run BEFORE and AFTER applying the migration:
 *   TEST_EMAIL=… TEST_PASSWORD=… npx tsx scripts/verify-upstream-column-grants.ts
 *
 * Before, it should report the leak. After, everything should be blocked.
 *
 * It authenticates as a real user with the PUBLIC anon key — the same key that
 * ships in the browser bundle — because that is the access level the leak had.
 * A service-role client would prove nothing: it bypasses every grant involved.
 *
 * WHY IT PROBES PARTITIONS TOO: `usage`, `trace_spans` and `audit_log` are
 * partitioned, and a customer can query `inference.usage_y2026m08` directly. An
 * earlier design granted columns on the parent only and would have left every
 * partition open — this is the check that caught it.
 *
 *   TEST_EMAIL / TEST_PASSWORD  a real account, for the authenticated probe.
 *                               Omitted, the anonymous probes still run.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" }); // fallback, same order as the other scripts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** The specific disclosures, so a failure names what leaked rather than a table. */
const FORBIDDEN: Array<[string, string, string]> = [
  ["models", "upstream_provider", "names the upstream we proxy to"],
  ["models", "upstream_model_id", "names the upstream model"],
  ["models", "upstream_pricing", "our cost basis — discloses margin"],
  ["models", "runpod_endpoint_id", "names our GPU substrate"],
  ["models", "serving_url", "internal serving endpoint"],
  ["media_jobs", "output_url", "raw upstream asset URL"],
  ["media_jobs", "upstream_job_id", "upstream job handle"],
  ["media_jobs", "input_r2_key", "our bucket path"],
  ["media_jobs", "output_r2_key", "our bucket path"],
  ["usage", "upstream_cost_cents", "our cost per request — margin per call"],
  ["finetunes", "runpod_job_id", "names our GPU substrate"],
  ["deployments", "runpod_endpoint_id", "names our GPU substrate"],
  // RLS scopes this to the caller's own org, so it is their own keys' hashes
  // rather than anyone else's — low severity, but secret material has no business
  // being reachable from a browser at all.
  ["api_keys", "key_hash", "hashed API key — secret material"],
];

/**
 * The same class outside the `inference` schema (migration 20260806000003).
 * Lower severity — RLS scopes these to the caller's own rows — but a hashed
 * credential still has no business being reachable from a browser.
 */
const FORBIDDEN_OTHER: Array<[string | null, string, string, string]> = [
  [null, "api_keys", "key_hash", "public.api_keys — hashed platform API key"],
  ["agents", "agent_api_keys", "key_hash", "agents.agent_api_keys — hashed agent key"],
];

/** These must KEEP working — the dashboard lists keys by prefix. */
const REQUIRED_OTHER: Array<[string | null, string, string]> = [
  [null, "api_keys", "id, name, key_prefix, last_used_at, created_at"],
  ["agents", "agent_api_keys", "id, name, key_prefix, agent_id, is_active"],
];

/**
 * Whole tables that must be unreachable — the parents AND their partitions.
 *
 * The partitions are the point: a fix applied only to `usage` leaves
 * `usage_y2026m08` readable, and a customer querying the partition directly gets
 * everything the parent was supposed to hide.
 */
const FORBIDDEN_TABLES = [
  "models",
  "media_jobs",
  "usage",
  "usage_y2026m08",
  "trace_spans",
  "audit_log",
  "audit_log_y2026m08",
  "finetunes",
  "deployments",
  "vector_collections",
  "api_keys",
];

/**
 * What must KEEP working. The customer-facing catalog is served by the API from
 * a service-role client, so nothing here should depend on direct table access —
 * but the RPCs behind RLS and the public status page must stay callable, and a
 * fix that breaks them is as wrong as one that leaks.
 */
const REQUIRED_RPCS = ["status_usage_24h", "status_finetunes_7d", "status_deployments_7d"];

let failures = 0;
const say = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

// Typed loosely on purpose: this probes a schema the generated types do not
// describe, and the point is what the DATABASE allows, not what TS believes.
async function probe(label: string, client: SupabaseClient, checkRpcs: boolean) {
  console.log(`\n── as ${label} ──`);

  // 1. The named disclosures. Reported column by column so a failure says WHAT
  //    leaked, not just which table.
  for (const [table, column, why] of FORBIDDEN) {
    const { error } = await client.schema("inference").from(table).select(column).limit(1);
    // A permission error is the PASS here: the column is unreachable.
    say(!!error, `${table}.${column} blocked — ${why}${error ? "" : "   ← STILL READABLE"}`);
  }

  // 2. Whole tables, parents and partitions. A fix that covers `usage` but not
  //    `usage_y2026m08` closes nothing.
  let openTables = 0;
  for (const table of FORBIDDEN_TABLES) {
    const { error } = await client.schema("inference").from(table).select("*").limit(1);
    if (!error) {
      openTables++;
      console.log(`FAIL  inference.${table} is readable   ← direct table access`);
    }
  }
  failures += openTables;
  if (openTables === 0) {
    console.log(`PASS  all ${FORBIDDEN_TABLES.length} tables (incl. partitions) unreachable`);
  }

  // 3. What must survive. Removing the leak must not break the RPCs that RLS
  //    policies depend on. Only checked for a signed-in caller: `anon` has no
  //    schema USAGE and is not meant to call them, so asserting there would fail
  //    forever and teach whoever runs this to ignore the output.
  if (!checkRpcs) {
    console.log("      (rpc check skipped — anon has no USAGE on this schema, by design)");
    return;
  }
  for (const fn of REQUIRED_RPCS) {
    const { error } = await client.schema("inference").rpc(fn);
    // A permission error is a FAIL; a runtime error from the function body is
    // not this script's business.
    const denied = !!error && /permission denied|does not exist/i.test(error.message);
    say(!denied, `rpc ${fn} still callable${denied ? ` — BROKEN: ${error!.message}` : ""}`);
  }

  // 4. The same class outside `inference` (migration 20260806000003).
  const at = (schema: string | null, table: string) =>
    schema ? client.schema(schema).from(table) : client.from(table);
  for (const [schema, table, column, why] of FORBIDDEN_OTHER) {
    const { error } = await at(schema, table).select(column).limit(1);
    say(!!error, `${why} blocked${error ? "" : "   ← STILL READABLE"}`);
  }
  for (const [schema, table, columns] of REQUIRED_OTHER) {
    const { error } = await at(schema, table).select(columns).limit(1);
    say(!error, `${schema ?? "public"}.${table} still listable${error ? ` — BROKEN: ${error.message}` : ""}`);
  }
}

async function main() {
  // A FRESH client for the anonymous probe, never used to sign in. Reusing one
  // that has called signInWithPassword silently attaches the session and turns
  // an "anonymous" probe into an authenticated one — that mistake is what
  // produced a false "world-readable" finding in the first draft of this work.
  const anon: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
  await probe("anonymous (no login — the browser-bundle key)", anon, false);

  if (process.env.TEST_EMAIL && process.env.TEST_PASSWORD) {
    const signInClient: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await signInClient.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    });
    if (error) console.log(`\n(could not sign in for the authenticated probe: ${error.message})`);
    else {
      const asUser: SupabaseClient = createClient(URL, ANON, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
      });
      await probe("a logged-in customer — the access level the leak had", asUser, true);
    }
  } else {
    console.log("\n(set TEST_EMAIL / TEST_PASSWORD to also probe as a logged-in customer)");
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exitCode = failures === 0 ? 0 : 1;

}

void main();
