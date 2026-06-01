-- Custom OS images for Compute / Virtual Servers.
--
-- Customers can bring their own OS image (URL import of a cloud qcow2/raw, or a
-- snapshot of an existing server). An image becomes a per-host Proxmox template
-- so the EXISTING clone + host-selection + cloud-init networking flow works
-- unchanged — a custom image is just another proxmox_templates row, owner-scoped.
--
-- Replication is LAZY: the template is built on a host the first time the owner
-- deploys to that host's region (no eager fan-out). Stored images are billed
-- per GB-month via billing.active_custom_image (UUID-keyed, like active_compute).

-- ── Catalog ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_images (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  -- how the image was ingested
  source_type         TEXT NOT NULL DEFAULT 'url'
                      CHECK (source_type IN ('url', 'snapshot', 'upload')),
  -- https URL (url import) OR object-storage key (snapshot/upload staging)
  source_ref          TEXT,
  -- for icon + sensible cloud-init defaults ('ubuntu','debian','almalinux',…,'custom')
  os_family           TEXT NOT NULL DEFAULT 'custom',
  -- default cloud-init login user baked into the image
  default_user        TEXT NOT NULL DEFAULT 'root',
  -- measured image size (GB) — drives storage billing; refined after first import
  size_gb             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (size_gb >= 0),
  -- whether the image is cloud-init enabled (required for auto networking on our
  -- static/routed modes). Customer-declared; networking won't auto-apply if false.
  cloud_init          BOOLEAN NOT NULL DEFAULT TRUE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'importing', 'available', 'failed', 'deleting')),
  error               TEXT,
  -- stable UUID billing key (the metered cron is UUID-keyed) for the storage meter
  billing_service_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (billing_service_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_images_owner  ON public.custom_images (owner_id);
CREATE INDEX IF NOT EXISTS idx_custom_images_status ON public.custom_images (status);

COMMENT ON COLUMN public.custom_images.source_ref IS
  'https URL for url imports; object-storage key for snapshot/upload staging (cross-region lazy pull).';
COMMENT ON COLUMN public.custom_images.billing_service_id IS
  'Stable UUID billing key for billing.active_custom_image.service_id (storage $/GB-month).';

DROP TRIGGER IF EXISTS trg_custom_images_updated_at ON public.custom_images;
CREATE TRIGGER trg_custom_images_updated_at BEFORE UPDATE ON public.custom_images
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE public.custom_images ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_images TO authenticated;
GRANT ALL ON public.custom_images TO service_role;

DO $$ BEGIN
  CREATE POLICY "Users manage own custom images" ON public.custom_images
    FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages custom images" ON public.custom_images
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Link templates to images + owner-scope them ──────────────────────────────
-- A custom image materializes as proxmox_templates rows (one per host it has
-- been built on). owner_id NULL = public/built-in OS; non-null = private image.
ALTER TABLE public.proxmox_templates
  ADD COLUMN IF NOT EXISTS owner_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS custom_image_id UUID REFERENCES public.custom_images(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_proxmox_templates_owner        ON public.proxmox_templates (owner_id);
CREATE INDEX IF NOT EXISTS idx_proxmox_templates_custom_image ON public.proxmox_templates (custom_image_id, host_id);

COMMENT ON COLUMN public.proxmox_templates.owner_id IS
  'NULL = public/built-in OS template (visible to everyone). Non-null = private custom image, visible only to its owner.';

-- ── Storage billing meter ($/GB-month, hourly metered like the rest) ─────────
CREATE TABLE IF NOT EXISTS billing.active_custom_image (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL,            -- = public.custom_images.billing_service_id
  hourly_rate     NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id)
);

CREATE INDEX IF NOT EXISTS idx_active_custom_image_user    ON billing.active_custom_image (user_id);
CREATE INDEX IF NOT EXISTS idx_active_custom_image_service ON billing.active_custom_image (service_id);
CREATE INDEX IF NOT EXISTS idx_active_custom_image_status  ON billing.active_custom_image (status, last_billed_at);

COMMENT ON COLUMN billing.active_custom_image.service_id IS 'References public.custom_images.billing_service_id.';

DROP TRIGGER IF EXISTS trg_active_custom_image_updated_at ON billing.active_custom_image;
CREATE TRIGGER trg_active_custom_image_updated_at BEFORE UPDATE ON billing.active_custom_image
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE billing.active_custom_image ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON billing.active_custom_image TO authenticated;
GRANT ALL    ON billing.active_custom_image TO service_role;

DO $$ BEGIN
  CREATE POLICY "Users can view own active custom image" ON billing.active_custom_image
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages active custom image" ON billing.active_custom_image
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
