/**
 * Billing dead-man check.
 *
 * Answers one question: HAS BILLING STOPPED?
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
 * domain with the thing being checked. The paas-v2 lane has the same blind spot
 * from the other side: their sweep-health check runs inside the cluster it
 * observes, and lib/paas/k8s/sweeps.ts says so in its own header — "an observer
 * running inside the thing it observes cannot report on it when that thing
 * breaks".
 *
 * This asks the DATABASE what it has been paid, which is the only fact that
 * actually matters:
 *
 *     select max(period_start) from billing.service_charges
 *
 * If that is stale while meters are open, billing has stopped — whatever any
 * process claims about itself. Run it from somewhere that is not the machine
 * running the sweep: a laptop, a GitHub Action, an uptime service hitting a
 * route that wraps it. Anywhere outside.
 *
 * Exit codes:
 *   0  billing is current, or there is legitimately nothing to bill
 *   1  BILLING HAS STOPPED — charges are stale while meters are open
 *   2  could not check (bad config, unreachable database)
 *
 * Note that 1 and 2 are different on purpose. "I looked and it is broken" and
 * "I could not look" are not the same finding, and collapsing them is how a
 * monitor turns into decoration — the same mistake as reading an empty scan
 * result as a clean one.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * How far behind `max(period_start)` may fall before this is an alarm.
 *
 * The sweep bills the hour that has just COMPLETED, so at any moment the newest
 * charge is legitimately up to ~2 hours old (the just-finished hour, plus the
 * hour in progress). Three gives one hour of slack for a late or retried run
 * without letting a genuine stoppage hide for long. At the six-day outage this
 * would have fired within three hours.
 */
const STALE_AFTER_HOURS = Number(process.env.BILLING_STALE_AFTER_HOURS ?? 3);

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[deadman] CANNOT CHECK: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    return 2;
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { count: openMeters, error: meterErr } = await db
    .schema("billing").from("service_meters")
    .select("id", { count: "exact", head: true })
    .is("ended_at", null)
    .eq("status", "active");

  if (meterErr) {
    console.error(`[deadman] CANNOT CHECK: reading meters failed — ${meterErr.message}`);
    return 2;
  }

  const { data: newest, error: chargeErr } = await db
    .schema("billing").from("service_charges")
    .select("period_start")
    .order("period_start", { ascending: false })
    .limit(1);

  if (chargeErr) {
    console.error(`[deadman] CANNOT CHECK: reading charges failed — ${chargeErr.message}`);
    return 2;
  }

  // No open meters means there is genuinely nothing to bill. That is healthy,
  // and it is a different state from "meters are open and nothing is being
  // charged" — which is the alarm.
  if (!openMeters || openMeters === 0) {
    console.log("[deadman] OK — no open meters, nothing to bill");
    return 0;
  }

  if (!newest || newest.length === 0) {
    console.error(
      `[deadman] BILLING HAS STOPPED — ${openMeters} open meter(s) and NO charges have ever been recorded`
    );
    return 1;
  }

  const latest = new Date(newest[0].period_start as string);
  const hoursBehind = (Date.now() - latest.getTime()) / 3_600_000;

  if (hoursBehind > STALE_AFTER_HOURS) {
    console.error(
      `[deadman] BILLING HAS STOPPED — newest charge is ${hoursBehind.toFixed(1)}h old ` +
      `(${latest.toISOString()}) while ${openMeters} meter(s) are open. ` +
      `Threshold is ${STALE_AFTER_HOURS}h.`
    );
    return 1;
  }

  console.log(
    `[deadman] OK — newest charge ${hoursBehind.toFixed(1)}h old, ${openMeters} open meter(s)`
  );
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
