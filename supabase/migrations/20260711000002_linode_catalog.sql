-- Linode catalog: regions, types (plans), images, per-region availability, and
-- admin-managed resale pricing. Synced from the Linode API v4 by
-- lib/services/linode/catalog-sync.ts (service role); customers read via the
-- deploy options endpoint. Mirrors the gpu_catalog/gpu_pricing resell pattern:
--   resale_hourly = max(linode_hourly * markup_pct, floor_per_hour_usd)
-- frozen onto servers.hourly_cost at create time.

-- ─── 1. Regions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linode_regions (
    id           TEXT PRIMARY KEY,          -- e.g. 'us-ord'
    label        TEXT NOT NULL,             -- e.g. 'Chicago, IL'
    country      TEXT NOT NULL,             -- ISO code from API, e.g. 'us'
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    status       TEXT NOT NULL DEFAULT 'ok',
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,   -- admin switch
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Types (plans) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linode_types (
    id                  TEXT PRIMARY KEY,   -- e.g. 'g6-standard-2'
    label               TEXT NOT NULL,      -- e.g. 'Linode 4GB'
    class               TEXT NOT NULL,      -- nanode|standard|dedicated|highmem|gpu|premium|accelerated
    vcpus               INTEGER NOT NULL,
    memory_mb           INTEGER NOT NULL,
    disk_mb             INTEGER NOT NULL,
    transfer_gb         INTEGER NOT NULL DEFAULT 0,
    network_out_mbps    INTEGER NOT NULL DEFAULT 0,
    hourly_usd          NUMERIC(10,5) NOT NULL DEFAULT 0,
    monthly_usd         NUMERIC(10,2) NOT NULL DEFAULT 0,
    region_prices       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- verbatim API region_prices
    backups_hourly_usd  NUMERIC(10,5),
    backups_monthly_usd NUMERIC(10,2),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,       -- admin switch
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_linode_types_class ON public.linode_types (class, is_active);

COMMENT ON COLUMN public.linode_types.region_prices IS
    'Verbatim Linode region_prices array: [{id, hourly, monthly}] — overrides base price per region.';

-- ─── 3. Images ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linode_images (
    id          TEXT PRIMARY KEY,           -- e.g. 'linode/ubuntu24.04'
    label       TEXT NOT NULL,
    vendor      TEXT,                       -- e.g. 'Ubuntu'
    size_mb     INTEGER NOT NULL DEFAULT 0,
    is_public   BOOLEAN NOT NULL DEFAULT TRUE,
    deprecated  BOOLEAN NOT NULL DEFAULT FALSE,
    eol         TIMESTAMPTZ,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,   -- admin switch
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_linode_images_vendor ON public.linode_images (vendor, is_active);

-- ─── 4. Per-region plan availability ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linode_region_availability (
    region_id   TEXT NOT NULL REFERENCES public.linode_regions(id) ON DELETE CASCADE,
    type_id     TEXT NOT NULL REFERENCES public.linode_types(id) ON DELETE CASCADE,
    available   BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (region_id, type_id)
);
CREATE INDEX IF NOT EXISTS idx_linode_avail_type ON public.linode_region_availability (type_id, available);

-- ─── 5. Resale pricing (admin-managed; gpu_pricing shape) ───────────────────
CREATE TABLE IF NOT EXISTS public.linode_pricing (
    type_id            TEXT PRIMARY KEY REFERENCES public.linode_types(id) ON DELETE CASCADE,
    markup_pct         NUMERIC(6,3) NOT NULL DEFAULT 1.000 CHECK (markup_pct >= 1.000),
    floor_per_hour_usd NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (floor_per_hour_usd >= 0),
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by         UUID
);

COMMENT ON TABLE public.linode_pricing IS
    'resale_hourly = max(linode_hourly * markup_pct, floor_per_hour_usd); frozen at create.';

-- ─── 6. Updated-at triggers (reuse gpu_set_updated_at) ──────────────────────
DROP TRIGGER IF EXISTS trg_linode_regions_updated_at ON public.linode_regions;
CREATE TRIGGER trg_linode_regions_updated_at BEFORE UPDATE ON public.linode_regions
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

DROP TRIGGER IF EXISTS trg_linode_types_updated_at ON public.linode_types;
CREATE TRIGGER trg_linode_types_updated_at BEFORE UPDATE ON public.linode_types
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

DROP TRIGGER IF EXISTS trg_linode_images_updated_at ON public.linode_images;
CREATE TRIGGER trg_linode_images_updated_at BEFORE UPDATE ON public.linode_images
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

DROP TRIGGER IF EXISTS trg_linode_pricing_updated_at ON public.linode_pricing;
CREATE TRIGGER trg_linode_pricing_updated_at BEFORE UPDATE ON public.linode_pricing
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- ─── 7. RLS + grants ─────────────────────────────────────────────────────────
ALTER TABLE public.linode_regions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linode_types               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linode_images              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linode_region_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linode_pricing             ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.linode_regions             TO authenticated, anon;
GRANT SELECT ON public.linode_types               TO authenticated, anon;
GRANT SELECT ON public.linode_images              TO authenticated;
GRANT SELECT ON public.linode_region_availability TO authenticated;
GRANT SELECT ON public.linode_pricing             TO authenticated;
GRANT ALL ON public.linode_regions             TO service_role;
GRANT ALL ON public.linode_types               TO service_role;
GRANT ALL ON public.linode_images              TO service_role;
GRANT ALL ON public.linode_region_availability TO service_role;
GRANT ALL ON public.linode_pricing             TO service_role;

-- Catalog rows: active entries are readable (marketing/deploy quoting); admin manages.
DO $$ BEGIN
    CREATE POLICY "Anyone can view active linode regions" ON public.linode_regions
        FOR SELECT USING (is_active = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage linode regions" ON public.linode_regions
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Anyone can view active linode types" ON public.linode_types
        FOR SELECT USING (is_active = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage linode types" ON public.linode_types
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Authenticated can view active linode images" ON public.linode_images
        FOR SELECT USING (is_active = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage linode images" ON public.linode_images
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Authenticated can view linode availability" ON public.linode_region_availability
        FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage linode availability" ON public.linode_region_availability
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Authenticated can view linode pricing" ON public.linode_pricing
        FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage linode pricing" ON public.linode_pricing
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
