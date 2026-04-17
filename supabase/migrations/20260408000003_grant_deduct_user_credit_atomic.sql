-- Grant EXECUTE on billing.deduct_user_credit_atomic to service_role.
-- Split from 20260408000002 because the Supabase CLI cannot parse a CREATE FUNCTION
-- dollar-quote body and a subsequent GRANT in the same migration file.
GRANT EXECUTE ON FUNCTION billing.deduct_user_credit_atomic(uuid, numeric) TO service_role;
