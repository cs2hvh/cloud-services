-- Make platform-app bandwidth OVERAGE billing concurrency- and failure-safe.
--
-- The cron computed "unbilled overage" from metadata.overage_billed_bytes with
-- a non-atomic read-then-write, so:
--   1. two overlapping sync runs could bill the same bytes twice, and
--   2. if the deduct succeeded but the follow-up metadata write failed, the
--      bytes were never recorded as billed and got re-charged next run.
--
-- These RPCs make the billed-bytes counter the source of truth, mutated under a
-- row lock (FOR UPDATE). The caller CLAIMS the bytes atomically *before*
-- charging — so only one runner ever bills a given byte range — and RELEASES
-- the claim if the charge fails, so it's retried (never lost, never doubled).

CREATE OR REPLACE FUNCTION claim_platform_app_bandwidth_overage_bytes(
  p_app_id UUID,
  p_period_start DATE,
  p_target_billed_bytes BIGINT
) RETURNS BIGINT AS $$
DECLARE
  v_old BIGINT;
  v_claimed BIGINT;
BEGIN
  SELECT COALESCE((metadata->>'overage_billed_bytes')::BIGINT, 0)
    INTO v_old
  FROM platform_app_bandwidth_usage_monthly
  WHERE app_id = p_app_id AND period_start = p_period_start
  FOR UPDATE;  -- serializes concurrent claims for this app/period

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_claimed := GREATEST(p_target_billed_bytes - v_old, 0);
  IF v_claimed > 0 THEN
    UPDATE platform_app_bandwidth_usage_monthly
    SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{overage_billed_bytes}',
          to_jsonb(p_target_billed_bytes)
        ),
        updated_at = now()
    WHERE app_id = p_app_id AND period_start = p_period_start;
  END IF;

  RETURN v_claimed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Roll a claim back (decrement billed bytes) when the charge fails, so the
-- bytes are billed on a later run instead of being silently dropped.
CREATE OR REPLACE FUNCTION release_platform_app_bandwidth_overage_bytes(
  p_app_id UUID,
  p_period_start DATE,
  p_bytes BIGINT
) RETURNS VOID AS $$
BEGIN
  UPDATE platform_app_bandwidth_usage_monthly
  SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{overage_billed_bytes}',
        to_jsonb(
          GREATEST(COALESCE((metadata->>'overage_billed_bytes')::BIGINT, 0) - p_bytes, 0)
        )
      ),
      updated_at = now()
  WHERE app_id = p_app_id AND period_start = p_period_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION claim_platform_app_bandwidth_overage_bytes(UUID, DATE, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION release_platform_app_bandwidth_overage_bytes(UUID, DATE, BIGINT) TO service_role;
