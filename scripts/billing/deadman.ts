/**
 * Billing dead-man check.
 *
 * Answers one question: IS EVERYTHING THAT SHOULD BE BILLED BEING BILLED?
 *
 * WHY THIS IS A SEPARATE FILE FROM THE SWEEP
 *
 * The billing cron died on 2026-08-24 10:50 UTC and was found on 2026-08-30.
 * It did not die quietly by accident — systemd restarted it every ten seconds
 * for six days and reported its state as "activating" the entire time. The
 * failure was perfectly visible to anything that looked. Nothing looked.
 *
 * So this check deliberately does NOT ask the sweep whether it is healthy, does
 * not read a log, and does not inspect a process. Those all share a failure
 * domain with the thing being checked. It asks the DATABASE, from outside the
 * host: a GitHub Action, a laptop, anywhere that is not the machine running
 * the sweep.
 *
 * WHY IT ASKS FOUR QUESTIONS, NOT ONE
 *
 * The first version asked only "how old is max(period_start)?". On
 * 2026-09-02/03 a compute meter went unbilled for eleven hours while five other
 * meters kept that timestamp fresh, and this check stayed green the whole
 * time. Recency cannot see a hole behind it. So:
 *
 *   1. Did the sweep RUN?        billing.sweep_runs, newest --apply run
 *   2. Did it bill EVERY meter?  sweep_runs.problems, and billing.meter_coverage()
 *   3. Is anything running that has NO meter?   billing.unbilled_resources()
 *   4. Backstop: is max(period_start) fresh at all?
 *
 * Exit codes:
 *   0  everything that should be billed is being billed
 *   1  SOMETHING IS NOT BEING BILLED — the output says exactly what
 *   2  could not check (bad config, unreachable database)
 *
 * 1 and 2 are different on purpose. "I looked and it is broken" and "I could
 * not look" are not the same finding, and collapsing them is how a monitor
 * turns into decoration — the same mistake as reading an empty query result as
 * a clean one.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * How far behind the newest --apply run may be before this is an alarm.
 *
 * The sweep runs at :10 and bills the hour that has just COMPLETED, so a run is
 * legitimately up to ~70 minutes old at any moment. Three hours gives room for
 * a late or retried run without letting a genuine stoppage hide for long.
 */
const STALE_AFTER_HOURS = Number(process.env.BILLING_STALE_AFTER_HOURS ?? 3);

/** Window handed to meter_coverage(). Recent holes are what this check is for. */
const COVERAGE_WINDOW = process.env.BILLING_COVERAGE_WINDOW ?? "6 hours";

type SweepRun = {
  period_start: string;
  started_at: string;
  mode: string;
  meters: number;
  charged: number;
  problems: number;
  problem_lines: Array<{ service_type: string; service_id: string; outcome: string; detail: string | null }>;
};

type CoverageRow = {
  service_type: string;
  service_id: string;
  user_id: string;
  expected: number;
  billed: number;
  missing: number;
  first_missing: string | null;
  last_missing: string | null;
  verdict: string;
};

type UnbilledRow = {
  service_type: string;
  service_id: string | null;
  owner_id: string | null;
  status: string;
  since: string;
  plan_key: string | null;
  reason: string;
};

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[deadman] CANNOT CHECK: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    return 2;
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const failures: string[] = [];
  const notes: string[] = [];

  // ── open meters ─────────────────────────────────────────────────────────
  const { count: openMeters, error: meterErr } = await db
    .schema("billing").from("service_meters")
    .select("id", { count: "exact", head: true })
    .is("ended_at", null)
    .eq("status", "active");
  if (meterErr) {
    console.error(`[deadman] CANNOT CHECK: reading meters failed — ${meterErr.message}`);
    return 2;
  }
  const open = openMeters ?? 0;

  // ── 1. did the sweep run? ────────────────────────────────────────────────
  const { data: runs, error: runErr } = await db
    .schema("billing").from("sweep_runs")
    .select("period_start, started_at, mode, meters, charged, problems, problem_lines")
    .eq("mode", "apply")
    .order("started_at", { ascending: false })
    .limit(1);
  if (runErr) {
    console.error(`[deadman] CANNOT CHECK: reading billing.sweep_runs failed — ${runErr.message}`);
    return 2;
  }
  const lastRun = (runs?.[0] ?? null) as SweepRun | null;

  if (open > 0) {
    if (!lastRun) {
      failures.push(`${open} open meter(s) and NO --apply sweep run has ever been recorded in billing.sweep_runs`);
    } else {
      const ageH = (Date.now() - new Date(lastRun.started_at).getTime()) / 3_600_000;
      if (ageH > STALE_AFTER_HOURS) {
        failures.push(
          `SWEEP HAS NOT RUN — newest --apply run is ${ageH.toFixed(1)}h old (${lastRun.started_at}) ` +
          `while ${open} meter(s) are open. Threshold is ${STALE_AFTER_HOURS}h.`
        );
      } else {
        notes.push(`sweep ran ${ageH.toFixed(1)}h ago for period ${lastRun.period_start}: ` +
          `${lastRun.charged} of ${lastRun.meters} meters billed`);
      }
    }
  } else {
    notes.push("no open meters — nothing to bill on the hourly spine");
  }

  // ── 2a. did the last run bill every meter? ──────────────────────────────
  if (lastRun && lastRun.problems > 0) {
    const lines = (lastRun.problem_lines ?? [])
      .map((p) => `    ${p.service_type}/${p.service_id}  ${p.outcome}  ${p.detail ?? ""}`)
      .join("\n");
    failures.push(
      `METERS WENT UNBILLED — the last sweep (period ${lastRun.period_start}) reported ` +
      `${lastRun.problems} problem(s):\n${lines}`
    );
  }

  // ── 2b. coverage: any hole in the recent window? ────────────────────────
  const { data: coverage, error: covErr } = await db
    .schema("billing").rpc("meter_coverage", { p_window: COVERAGE_WINDOW });
  if (covErr) {
    console.error(`[deadman] CANNOT CHECK: meter_coverage() failed — ${covErr.message}`);
    return 2;
  }
  const justCompletedHour = new Date();
  justCompletedHour.setUTCMinutes(0, 0, 0);
  justCompletedHour.setUTCHours(justCompletedHour.getUTCHours() - 1);
  const minuteOfHour = new Date().getUTCMinutes();

  for (const row of (coverage ?? []) as CoverageRow[]) {
    if (row.missing === 0) continue;
    // The sweep bills the just-completed hour at :10. Before ~:15 that hour is
    // legitimately still missing; do not page on it alone.
    const onlyTheCurrentHole =
      row.first_missing !== null &&
      row.first_missing === row.last_missing &&
      new Date(row.first_missing).getTime() === justCompletedHour.getTime();
    if (onlyTheCurrentHole && minuteOfHour < 15) continue;

    const where = `${row.service_type}/${row.service_id}: ${row.missing} of ${row.expected} hour(s) missing ` +
      `(${row.first_missing} → ${row.last_missing})`;
    if (row.verdict === "arrears") {
      // Proven short: the customer owes, the biller worked. Not a failure here.
      notes.push(`arrears — ${where}`);
    } else {
      failures.push(`COVERAGE HOLE (${row.verdict}) — ${where}`);
    }
  }

  // ── 3. resources with no meter at all ───────────────────────────────────
  const { data: unbilled, error: unbErr } = await db.schema("billing").rpc("unbilled_resources");
  if (unbErr) {
    console.error(`[deadman] CANNOT CHECK: unbilled_resources() failed — ${unbErr.message}`);
    return 2;
  }
  const unb = (unbilled ?? []) as UnbilledRow[];
  if (unb.length > 0) {
    const byType = new Map<string, UnbilledRow[]>();
    for (const r of unb) {
      if (!byType.has(r.service_type)) byType.set(r.service_type, []);
      byType.get(r.service_type)!.push(r);
    }
    const lines = [...byType]
      .map(([t, rows]) =>
        `    ${t}: ${rows.length}\n` +
        rows.slice(0, 10).map((r) => `      ${r.service_id ?? "(no id)"}  ${r.status}  since ${r.since}  ${r.reason}`).join("\n") +
        (rows.length > 10 ? `\n      … and ${rows.length - 10} more` : ""))
      .join("\n");
    failures.push(
      `RESOURCES RUNNING WITH NO METER — ${unb.length} resource(s) exist and are not being billed:\n${lines}`
    );
  }

  // ── 4. backstop: recency of the newest charge ───────────────────────────
  if (open > 0) {
    const { data: newest, error: chargeErr } = await db
      .schema("billing").from("service_charges")
      .select("period_start")
      .order("period_start", { ascending: false })
      .limit(1);
    if (chargeErr) {
      console.error(`[deadman] CANNOT CHECK: reading charges failed — ${chargeErr.message}`);
      return 2;
    }
    if (!newest || newest.length === 0) {
      failures.push(`${open} open meter(s) and NO charges have ever been recorded`);
    } else {
      const hoursBehind = (Date.now() - new Date(newest[0].period_start as string).getTime()) / 3_600_000;
      if (hoursBehind > STALE_AFTER_HOURS) {
        failures.push(`newest charge is ${hoursBehind.toFixed(1)}h old while ${open} meter(s) are open`);
      }
    }
  }

  // ── verdict ─────────────────────────────────────────────────────────────
  for (const n of notes) console.log(`[deadman] ${n}`);
  if (failures.length > 0) {
    console.error(`[deadman] SOMETHING IS NOT BEING BILLED — ${failures.length} finding(s):`);
    for (const f of failures) console.error(`[deadman] ${f}`);
    return 1;
  }
  console.log(`[deadman] OK — ${open} open meter(s), every recent hour billed, no unmetered resources`);
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    // An unexpected throw is "could not check", not "billing is fine". Exiting
    // 0 here would make the monitor lie in exactly the way it exists to prevent.
    console.error("[deadman] CANNOT CHECK:", e instanceof Error ? e.message : e);
    process.exitCode = 2;
  });
