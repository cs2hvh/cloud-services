-- Add capacity tracking and region support to proxmox_hosts for multi-host smart provisioning

-- Add region column (e.g., "france", "india", "us-east") for grouping hosts by geography
ALTER TABLE proxmox_hosts ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'default';

-- Add display_region for UI-friendly region name (e.g., "France", "India", "US East")
ALTER TABLE proxmox_hosts ADD COLUMN IF NOT EXISTS display_region TEXT NOT NULL DEFAULT 'Default';

-- Add capacity columns so we know each host's limits
ALTER TABLE proxmox_hosts ADD COLUMN IF NOT EXISTS total_cpu_cores INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proxmox_hosts ADD COLUMN IF NOT EXISTS total_memory_mb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proxmox_hosts ADD COLUMN IF NOT EXISTS total_disk_gb INTEGER NOT NULL DEFAULT 0;

-- Add os_type to proxmox_templates if not present (for deduplication across hosts)
-- The column already partially exists from COMMENT syntax in original migration but let's be safe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'proxmox_templates' AND column_name = 'os_type'
    ) THEN
        ALTER TABLE proxmox_templates ADD COLUMN os_type TEXT;
    END IF;
END $$;

-- Add os_display_name to proxmox_templates for canonical display name used in deduplication
ALTER TABLE proxmox_templates ADD COLUMN IF NOT EXISTS os_display_name TEXT;

-- Update existing templates: set os_display_name = name if null
UPDATE proxmox_templates SET os_display_name = name WHERE os_display_name IS NULL;
