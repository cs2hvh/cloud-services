-- Prices change only on hour boundaries.
--
-- FOUND BY TEST. A price inserted with effective_from = now() did not cover
-- the hour it was created in, because billing.current_price() requires
-- effective_from <= period_start and period_start is the top of the hour. The
-- service returned 'no-price' for that hour and would have gone silently
-- unbilled — the exact failure class this rebuild exists to remove, reproduced
-- inside the rebuild itself.
--
-- Billing is charged in whole hours, so a price that changes mid-hour is not
-- representable anyway: the 10:00-11:00 hour would have two prices and no rule
-- to choose between them. Pinning both ends of the window to an hour boundary
-- gives "which price applies to this hour?" exactly one answer, and makes a
-- price set at 10:30 apply to the 10:00 hour rather than falling into a gap.
--
-- CONTRACT FOR THE ADMIN PANEL (apps/admin owns the write surface):
--   * insert with effective_from = date_trunc('hour', now())
--   * close a price with effective_to = date_trunc('hour', now())
-- The default below does this for inserts that omit the column.

alter table billing.service_pricing
  add constraint service_pricing_from_on_hour
  check (effective_from = date_trunc('hour', effective_from));

alter table billing.service_pricing
  add constraint service_pricing_to_on_hour
  check (effective_to is null or effective_to = date_trunc('hour', effective_to));

alter table billing.service_pricing
  alter column effective_from set default date_trunc('hour', now());
