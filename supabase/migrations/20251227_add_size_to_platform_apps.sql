-- Add size column to platform_apps for storing deployment size configuration
-- This is used to remember the selected size for redeployments

ALTER TABLE platform_apps 
ADD COLUMN IF NOT EXISTS size TEXT DEFAULT 'small' CHECK (size IN ('small', 'medium', 'large'));

-- Add comment for documentation
COMMENT ON COLUMN platform_apps.size IS 'Deployment size (small, medium, large) - determines resource allocation';
