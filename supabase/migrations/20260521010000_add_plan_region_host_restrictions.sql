-- Per-plan region + host availability filters.
--
-- NULL / empty array = no restriction (plan available everywhere).
-- Non-empty array = whitelist (plan only available in those regions
-- or on those specific hosts).
--
-- Use cases:
--   - allowed_regions:  premium / region-specific plans (e.g. NVMe
--     plans only in Frankfurt, GDPR-restricted plans only in EU)
--   - allowed_host_ids: pin a plan to a specific host (GPU plans
--     only on the H100 box, dev plans only on the staging host)
--
-- Status: NOT YET APPLIED. Run with:
--   `supabase db push`   (or apply via SQL editor)

ALTER TABLE instance_plans
    ADD COLUMN IF NOT EXISTS allowed_regions  text[] DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS allowed_host_ids text[] DEFAULT NULL;

-- Indexes for the filter queries (GIN supports array containment ops)
CREATE INDEX IF NOT EXISTS idx_instance_plans_allowed_regions
    ON instance_plans USING GIN (allowed_regions);
CREATE INDEX IF NOT EXISTS idx_instance_plans_allowed_host_ids
    ON instance_plans USING GIN (allowed_host_ids);

COMMENT ON COLUMN instance_plans.allowed_regions IS
    'Region slug whitelist. NULL or empty = available in every region.';
COMMENT ON COLUMN instance_plans.allowed_host_ids IS
    'Host id whitelist. NULL or empty = available on every host that has capacity.';
