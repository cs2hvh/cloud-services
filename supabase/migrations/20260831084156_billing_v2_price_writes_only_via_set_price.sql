-- Make billing.set_price the ONLY way a price can be written.
--
-- The admin-panel lane confirmed it writes exclusively through set_price and
-- invited this. Until now the rule was enforced by their discipline; now it is
-- enforced by the grant table.
--
-- set_price is SECURITY DEFINER, so it keeps working — it runs as its owner,
-- not as the caller. What stops working is a client bypassing it and INSERTing
-- straight into service_pricing, which would skip the plan-exists check and the
-- atomic close-then-insert, and could leave two live prices for one plan.
--
-- SELECT stays: reading the price book is not a privileged act, and the panel's
-- /pricing page needs it.
--
-- RECOVERED 2026-09-01 from supabase_migrations.schema_migrations (version
-- 20260831084156). Applied to production 2026-08-31; the file was never
-- written. See docs/architecture/03-pricing-and-billing.md.

revoke insert, update, delete on billing.service_pricing from service_role;
grant  select                  on billing.service_pricing to   service_role;
