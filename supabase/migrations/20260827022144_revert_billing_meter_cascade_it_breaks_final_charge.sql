-- Reverting 20260826185045. The FK added there with ON DELETE CASCADE would
-- have caused v1 to LOSE MONEY on every app deletion.
--
-- PlatformAppService.deleteApp runs in this order:
--
--   2. DeploymentService.delete  -> deletes the public.platform_apps row
--   3. Billing.close_active_service -> prorated FINAL CHARGE
--
-- With CASCADE, step 2 removes the billing meter, so step 3 has nothing left to
-- charge. Worse, step 3 is wrapped in a try/catch that downgrades failure to a
-- `billingWarning` string, so the lost charge would not even surface as an
-- error — the deletion would report success.
--
-- The FK was added to stop a meter outliving its app. It does, and it also
-- destroys the meter one step before the code that bills it. A constraint that
-- fixes a leak by creating a refund is not an improvement.
--
-- The five orphaned meters are already terminated, so the live leak is closed.
-- The correct durable fix is to close billing BEFORE deleting the app row,
-- which is a change to v1's ordering and belongs to whoever owns v1 — not
-- something to impose from underneath with a constraint.

alter table billing.active_platform_apps
  drop constraint if exists active_platform_apps_service_id_fkey;

comment on table billing.active_platform_apps is
  'Usage meters for platform apps. NOTE: service_id has NO foreign key to public.platform_apps, deliberately — an ON DELETE CASCADE here destroys the meter before deleteApp step 3 can raise its prorated final charge. A meter can therefore outlive its app; that is guarded by process, not by the schema. See docs/v2/evidence/billing-leak-2026-08-26.md.';
