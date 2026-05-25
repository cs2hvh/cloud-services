-- Add healthcheck_path to platform_apps
-- Stored for display and post-deploy soft HTTP verification only.
-- K8s probes always use tcpSocket — a wrong path never crashes the deployment.
ALTER TABLE platform_apps
  ADD COLUMN IF NOT EXISTS healthcheck_path TEXT DEFAULT NULL;
