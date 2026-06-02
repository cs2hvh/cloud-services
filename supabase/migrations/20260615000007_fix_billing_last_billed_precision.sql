-- ════════════════════════════════════════════════════════════════════════════
-- Fix: microsecond last_billed_at froze the newly-enabled billing tables
-- ════════════════════════════════════════════════════════════════════════════
-- 20260615000006 reset last_billed_at with SQL now() (MICROSECOND precision,
-- e.g. 2026-06-02T06:15:34.244147). The hourly billing cron's compare-and-swap
-- reads last_billed_at, round-trips it through a JS Date (MILLISECOND precision,
-- → .244), and the atomic RPC compares with IS DISTINCT FROM (exact). So .244
-- never matched .244147 → every one of those rows returned 'stale_last_billed_at'
-- and was silently skipped, forever — they never billed and never advanced.
--
-- The cron-managed tables don't hit this because their last_billed_at is always
-- last written by the cron itself (already millisecond). Only the rows reset by
-- the previous migration are stuck. Truncate them to millisecond so the cron's
-- expected timestamp matches and they resume billing on the next cycle. (After
-- the first successful bill the RPC rewrites last_billed_at at ms precision, so
-- it stays consistent.)
UPDATE billing.active_compute
  SET last_billed_at = date_trunc('milliseconds', last_billed_at)
  WHERE last_billed_at <> date_trunc('milliseconds', last_billed_at);

UPDATE billing.active_inference_vector
  SET last_billed_at = date_trunc('milliseconds', last_billed_at)
  WHERE last_billed_at <> date_trunc('milliseconds', last_billed_at);

UPDATE billing.active_custom_image
  SET last_billed_at = date_trunc('milliseconds', last_billed_at)
  WHERE last_billed_at <> date_trunc('milliseconds', last_billed_at);

UPDATE billing.active_gpu_pods
  SET last_billed_at = date_trunc('milliseconds', last_billed_at)
  WHERE last_billed_at <> date_trunc('milliseconds', last_billed_at);
