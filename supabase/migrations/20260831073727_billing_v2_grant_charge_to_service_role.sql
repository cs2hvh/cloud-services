-- REVOKE ALL ... FROM public removed more than intended.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and
-- service_role inherits it that way rather than through a grant of its own. So
-- revoking PUBLIC — which was correct, to keep anon and authenticated out —
-- also locked out the sweep, which connects as service_role.
--
-- Caught by the first --apply run: all five meters returned
-- "permission denied for function charge_service_hour" and NOTHING was charged.
-- Worth noting that this is the intended failure shape: the sweep reported a
-- PROBLEM and billed nothing, rather than treating an unclassifiable error as
-- a funding problem and marking customers delinquent.
--
-- Granting explicitly to service_role only. anon and authenticated stay
-- revoked: nothing client-side may move money.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831073727). Applied to production 2026-08-31; the file was never
-- written.

grant execute on function billing.charge_service_hour(
  text, uuid, uuid, timestamptz, text, numeric, numeric, numeric
) to service_role;

grant usage on schema billing to service_role;
grant select, insert, update on billing.service_meters  to service_role;
grant select                 on billing.service_pricing to service_role;
grant select, insert         on billing.service_charges to service_role;
