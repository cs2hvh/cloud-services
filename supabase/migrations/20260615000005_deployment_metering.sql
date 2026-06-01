-- Deployment metering clock.
--
-- BYO model deployments run on RunPod Serverless and bill us per worker-second
-- of uptime (always-on min_workers AND execution). The deployment-meter cron
-- samples each endpoint's live worker count and charges the interval since the
-- last sample. `last_metered_at` is that per-deployment clock; the meter only
-- ever bills (now - last_metered_at), so a missed tick never double-charges and
-- the very first tick just seeds the clock (charges nothing).

ALTER TABLE inference.deployments
  ADD COLUMN IF NOT EXISTS last_metered_at TIMESTAMPTZ;

COMMENT ON COLUMN inference.deployments.last_metered_at IS
  'Last time the deployment-meter cron sampled + billed this endpoint. NULL until the first sample. The meter charges (now - last_metered_at) x workers x rate.';
