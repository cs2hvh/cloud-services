-- SUPERSEDED by 20260827022144_revert_billing_meter_cascade_it_breaks_final_charge.
-- Kept because the reasoning on both sides is the useful part, and because a
-- history that silently omits a reverted change cannot be reproduced.
--
-- A billing meter could outlive the app it bills for.
--
-- billing.active_platform_apps.service_id referenced public.platform_apps(id)
-- by convention only: no foreign key, no cascade. Deleting an app destroyed the
-- app row and left the meter running forever. It happened five times and
-- charged $543.17 across three users for apps that no longer existed.
--
-- The delete path made it worse rather than causing it:
--   .delete().eq("service_id", X).eq("user_id", Y)
-- where Y is the CALLER's id. An admin deleting someone else's app matches zero
-- rows, and PostgREST reports success for a delete that removed nothing.
--
-- NOT VALID: the five orphaned rows are already terminated and kept as evidence
-- for the refund conversation. Validating would require deleting them first,
-- which would destroy the record of which meters leaked.

alter table billing.active_platform_apps
  add constraint active_platform_apps_service_id_fkey
  foreign key (service_id) references public.platform_apps(id) on delete cascade
  not valid;
