-- Widen platform_apps.size CHECK constraint to allow xlarge and xxlarge.
-- Previously only ('small', 'medium', 'large') were accepted; inserting an
-- xlarge/xxlarge app would fail at the DB level even though the API validation
-- and UI already support those tiers.
-- Pricing for xlarge/xxlarge is managed via the admin pricing panel.
ALTER TABLE platform_apps DROP CONSTRAINT IF EXISTS platform_apps_size_check;
ALTER TABLE platform_apps
  ADD CONSTRAINT platform_apps_size_check
  CHECK (size IN ('small', 'medium', 'large', 'xlarge', 'xxlarge'));

COMMENT ON COLUMN platform_apps.size IS 'Deployment size (small|medium|large|xlarge|xxlarge) — determines resource allocation';
