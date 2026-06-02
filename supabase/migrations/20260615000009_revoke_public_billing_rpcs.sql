-- C1 (CRITICAL) — Lock down the two oldest SECURITY DEFINER billing RPCs.
--
-- public.billing_topup / public.billing_deduct were created in
-- 20260314_atomic_billing_functions.sql with only `GRANT EXECUTE ... TO service_role`.
-- But the project baseline runs
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO anon;       -- 20251115073901_remote_schema.sql:855
--     GRANT ALL ON FUNCTIONS TO authenticated; -- 20251115073901_remote_schema.sql:856
-- so EXECUTE was silently granted to every customer JWT. Because these functions
-- are SECURITY DEFINER and take an arbitrary p_user_id (not pinned to auth.uid()),
-- any authenticated — or anonymous — caller could:
--   POST /rest/v1/rpc/billing_topup  {p_user_id:<self>, p_amount:1000000}  -> mint unlimited credit
--   POST /rest/v1/rpc/billing_deduct {p_user_id:<victim>, p_amount:...}     -> drain another user
--
-- The functions are ONLY ever invoked server-side through the service_role client
-- (lib/supabase/queries/billing.ts -> Billing.topup / Billing.deduct, both
-- createServiceClient()), so revoking customer access is behavior-safe. This mirrors
-- the explicit REVOKE pattern the newer billing functions already use
-- (deduct_user_credit_atomic, bill_service_cycle_atomic, resolve_grace_for_user, ...).
--
-- Also pins search_path (defense-in-depth for SECURITY DEFINER; the bodies already
-- fully-qualify billing.user_credits).

DO $$
BEGIN
  IF to_regprocedure('public.billing_topup(uuid, numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.billing_topup(uuid, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.billing_topup(uuid, numeric) TO service_role;
    ALTER FUNCTION public.billing_topup(uuid, numeric) SET search_path = pg_catalog, billing;
  END IF;

  IF to_regprocedure('public.billing_deduct(uuid, numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.billing_deduct(uuid, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.billing_deduct(uuid, numeric) TO service_role;
    ALTER FUNCTION public.billing_deduct(uuid, numeric) SET search_path = pg_catalog, billing;
  END IF;
END $$;
