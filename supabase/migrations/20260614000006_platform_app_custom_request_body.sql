-- Add optional per-app custom request body limit.
-- NULL means "use plan default". Value is in megabytes.
-- Validated on write: must be <= plan's max_request_body_mb.
ALTER TABLE platform_apps
  ADD COLUMN IF NOT EXISTS custom_request_body_mb integer;

DO $$
BEGIN
  ALTER TABLE platform_apps
    ADD CONSTRAINT platform_apps_custom_request_body_mb_positive
    CHECK (custom_request_body_mb IS NULL OR custom_request_body_mb >= 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN platform_apps.custom_request_body_mb IS
  'User-configured NGINX proxy-body-size in MB. NULL = use plan default. Must be <= plan max.';
