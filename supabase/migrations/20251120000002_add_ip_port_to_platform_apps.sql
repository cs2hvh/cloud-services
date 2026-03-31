-- Add ip and port fields for Kubernetes NodePort deployment
ALTER TABLE platform_apps
ADD COLUMN IF NOT EXISTS ip TEXT,
ADD COLUMN IF NOT EXISTS port INTEGER;
-- Add index for port lookups (to find used ports)
CREATE INDEX IF NOT EXISTS idx_platform_apps_port ON platform_apps(port) WHERE port IS NOT NULL;
-- Add comment
COMMENT ON COLUMN platform_apps.ip IS 'Kubernetes cluster IP address';
COMMENT ON COLUMN platform_apps.port IS 'Assigned NodePort (31000-32000 range)';
