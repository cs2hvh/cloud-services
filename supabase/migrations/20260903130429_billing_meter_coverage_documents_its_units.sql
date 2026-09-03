-- meter_coverage now states its units.
--
-- RECOVERED FROM supabase_migrations.schema_migrations ON 2026-09-03.
--
-- This was applied to production as version 20260903130429 and never committed:
-- the change went in through apply_migration and the accompanying commit
-- (c5cf2bf1) touched only the migration file of a DIFFERENT migration. Schema
-- ahead of repo, silently — the same drift that forced eleven migrations to be
-- reconstructed in late August, reintroduced by me on the day I documented it
-- as a hazard.
--
-- WHY THE COMMENT WAS WORTH A MIGRATION OF ITS OWN
--
-- billing.meter_coverage returns a PER-METER hour count and said nothing about
-- how to aggregate it. The first consumer summed the column and rendered
-- "4h stall" for what was a two-hour outage across two meters. An operator
-- reading that goes looking for a four-hour window in the logs, fails to find
-- one, and stops trusting the board — which is expensive for a surface whose
-- only value is being believed.
--
-- That ambiguity belonged to the function, not the caller. A number that needs
-- a unit and does not carry one is the same defect class as a count whose
-- denominator is missing: not wrong, merely unreadable, and it will be read
-- anyway.

comment on function billing.meter_coverage(interval) is
$c$Hours elapsed vs hours actually billed, per OPEN meter.

VERDICTS
  ok           nothing missing
  arrears      PROVEN short — billing.transactions holds a failed usage row for
               one of the missing hours. The only verdict that may be rendered
               as "the customer owes money".
  stall        nothing at all was billed in those hours; the biller was down
  unexplained  the biller ran, this meter did not bill, and no arrears row says
               the customer was short. A human decides.

UNITS — read this before aggregating.

`missing` is a count of hours FOR ONE METER. Summing it across rows gives
METER-HOURS, not wall-clock hours. Two meters each missing the same two hours
sum to 4, but the outage lasted 2 hours. A board that renders that total as
"4h stall" sends an operator hunting for a four-hour window that never existed,
and the first thing they lose is trust in the board.

Label the sum "meter-hours". For the window an operator should actually go and
read logs for, use the wall-clock span across the rows sharing a verdict:

  select min(first_missing), max(last_missing), count(*) as meters
    from billing.meter_coverage() where verdict = 'stall';

CAVEAT on that span: min..max merges DISJOINT outages into one overstated
window. Two separate one-hour stalls a day apart read as a 25-hour stall. The
per-meter rows keep it checkable, and if distinct windows are ever needed they
belong in this function rather than in a caller's arithmetic.

WHY THIS EXISTS AT ALL. "When did the sweep last run" reads green while a hole
sits behind it — on 2026-09-02 it was minutes-fresh while eleven hours of a
running VM had never been billed. Recency cannot see backwards; coverage can.
This function's first live run surfaced a platform-wide two-hour billing outage
from 2026-08-31 that nobody had noticed.$c$;
