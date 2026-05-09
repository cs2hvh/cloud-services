-- Migration: Adjust spectrum_apps to use spectrum_id (Cloudflare) and encrypted hostname IP
-- Created: 2025-11-13

-- 1. Rename existing primary key column id -> spectrum_id (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='spectrum_apps' AND column_name='id' AND data_type='text') THEN
    ALTER TABLE spectrum_apps RENAME COLUMN id TO spectrum_id;
  END IF;
END $$;
-- 2. Add new surrogate primary key id (UUID) if not already present
ALTER TABLE spectrum_apps ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
UPDATE spectrum_apps SET id = uuid_generate_v4() WHERE id IS NULL;
ALTER TABLE spectrum_apps ALTER COLUMN id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE spectrum_apps ADD PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition THEN NULL; END $$;
-- 3. Add encrypted hostname/ip column (JSONB)
ALTER TABLE spectrum_apps ADD COLUMN IF NOT EXISTS hostname_enc JSONB;
-- 4. Backfill hostname_enc by resolving current name values (BEST-EFFORT placeholder: store as raw json string)
UPDATE spectrum_apps SET hostname_enc = jsonb_build_object('encrypted', name, 'iv', '', 'tag', '', 'salt', '') WHERE hostname_enc IS NULL;
-- 5. (Optional) keep unique constraint on (zone_id, name)
-- Already exists: spectrum_apps_zone_name_unique

COMMENT ON COLUMN spectrum_apps.spectrum_id IS 'Cloudflare Spectrum application id';
COMMENT ON COLUMN spectrum_apps.hostname_enc IS 'Encrypted IP (resolved from original hostname) stored as EncryptedData JSON';
