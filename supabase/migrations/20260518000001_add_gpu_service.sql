-- GPU service: catalog, pricing, inventory snapshots, pods, events, active billing.
-- Phase 1 schema. RunPod is the on-demand/spot backend; reserved/cluster sales go
-- through the existing support.support_tickets system (separate flow).
--
-- All tables have RLS. Pod env-var values are encrypted at the application layer
-- via the existing Encryption util before being written to env_blob.

-- ─── 1. Curated GPU catalog (admin-managed) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gpu_catalog (
    id              TEXT PRIMARY KEY,
    runpod_gpu_id   TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    vendor          TEXT NOT NULL DEFAULT 'nvidia',
    memory_gb       INTEGER NOT NULL CHECK (memory_gb > 0),
    tier            TEXT NOT NULL DEFAULT 'flagship'
                    CHECK (tier IN ('flagship','prosumer','workstation')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 100,
    marketing_blurb TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.gpu_catalog.runpod_gpu_id IS
    'Verbatim gpuTypeId from RunPod (e.g. "NVIDIA H100 80GB HBM3").';

-- ─── 2. Pricing (admin-managed) ─────────────────────────────────────────────
-- resale_hourly = max(observed_runpod_hourly * markup_pct, floor_per_hour_usd)
CREATE TABLE IF NOT EXISTS public.gpu_pricing (
    gpu_catalog_id     TEXT NOT NULL REFERENCES public.gpu_catalog(id) ON DELETE CASCADE,
    cloud_type         TEXT NOT NULL CHECK (cloud_type IN ('SECURE','COMMUNITY')),
    interruptible      BOOLEAN NOT NULL,
    markup_pct         NUMERIC(6,3) NOT NULL DEFAULT 1.250 CHECK (markup_pct >= 1.000),
    floor_per_hour_usd NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (floor_per_hour_usd >= 0),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (gpu_catalog_id, cloud_type, interruptible)
);

-- ─── 3. Inventory snapshots (written by the sync worker) ────────────────────
CREATE TABLE IF NOT EXISTS public.gpu_inventory_snapshots (
    id                BIGSERIAL PRIMARY KEY,
    gpu_catalog_id    TEXT NOT NULL REFERENCES public.gpu_catalog(id) ON DELETE CASCADE,
    cloud_type        TEXT NOT NULL CHECK (cloud_type IN ('SECURE','COMMUNITY')),
    data_center_id    TEXT,
    stock_status      TEXT NOT NULL CHECK (stock_status IN ('high','medium','low','none')),
    available_counts  INTEGER[] NOT NULL DEFAULT '{}',
    on_demand_per_hr  NUMERIC(10,4),
    spot_per_hr       NUMERIC(10,4),
    observed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gpu_inv_lookup
    ON public.gpu_inventory_snapshots (gpu_catalog_id, cloud_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpu_inv_recent
    ON public.gpu_inventory_snapshots (observed_at DESC);

-- Latest snapshot per (gpu, cloud, datacenter) for cheap reads.
CREATE OR REPLACE VIEW public.gpu_inventory_latest AS
SELECT DISTINCT ON (gpu_catalog_id, cloud_type, COALESCE(data_center_id, ''))
       gpu_catalog_id,
       cloud_type,
       data_center_id,
       stock_status,
       available_counts,
       on_demand_per_hr,
       spot_per_hr,
       observed_at
FROM public.gpu_inventory_snapshots
ORDER BY gpu_catalog_id, cloud_type, COALESCE(data_center_id, ''), observed_at DESC;

-- ─── 4. Pod records (user-facing) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gpu_pods (
    id                  BIGSERIAL PRIMARY KEY,
    owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_email         TEXT,
    runpod_pod_id       TEXT UNIQUE,
    name                TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    gpu_catalog_id      TEXT NOT NULL REFERENCES public.gpu_catalog(id),
    gpu_count           INTEGER NOT NULL CHECK (gpu_count BETWEEN 1 AND 8),
    cloud_type          TEXT NOT NULL CHECK (cloud_type IN ('SECURE','COMMUNITY')),
    interruptible       BOOLEAN NOT NULL,
    data_center_id      TEXT,
    image_name          TEXT NOT NULL,
    template_id         TEXT,
    container_disk_gb   INTEGER NOT NULL CHECK (container_disk_gb >= 10),
    volume_gb           INTEGER NOT NULL DEFAULT 0 CHECK (volume_gb >= 0),
    network_volume_id   TEXT,
    ports               TEXT[] NOT NULL DEFAULT '{22/tcp}',
    env_keys            TEXT[] NOT NULL DEFAULT '{}',
    env_blob            TEXT,
    ssh_command         TEXT,
    public_ip           INET,
    port_mappings       JSONB,
    status              TEXT NOT NULL DEFAULT 'provisioning'
                        CHECK (status IN (
                            'provisioning','running','stopped','restarting',
                            'terminated','failed','interrupted'
                        )),
    details             JSONB,
    hourly_cost_usd     NUMERIC(10,4) NOT NULL CHECK (hourly_cost_usd >= 0),
    runpod_cost_per_hr  NUMERIC(10,4),
    billing_start       TIMESTAMPTZ,
    billing_end         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gpu_pods_owner   ON public.gpu_pods (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_gpu_pods_runpod  ON public.gpu_pods (runpod_pod_id)
    WHERE runpod_pod_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gpu_pods_active  ON public.gpu_pods (status)
    WHERE status IN ('provisioning','running','restarting');

COMMENT ON COLUMN public.gpu_pods.env_blob IS
    'Encrypted JSON of user-supplied environment variable values.';
COMMENT ON COLUMN public.gpu_pods.hourly_cost_usd IS
    'Resale price frozen at create time. Cron bills against this rate regardless of upstream price drift.';

-- ─── 5. Pod event log (audit + realtime UI driver) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.gpu_pod_events (
    id          BIGSERIAL PRIMARY KEY,
    pod_id      BIGINT NOT NULL REFERENCES public.gpu_pods(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    message     TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gpu_pod_events_pod
    ON public.gpu_pod_events (pod_id, created_at DESC);

-- ─── 6. Active billing meter (matches billing.active_kubernetes etc.) ───────
CREATE TABLE IF NOT EXISTS billing.active_gpu_pods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service_id      BIGINT NOT NULL,
    hourly_rate     NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','grace','terminated')),
    last_billed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(service_id)
);
CREATE INDEX IF NOT EXISTS idx_active_gpu_pods_user_id   ON billing.active_gpu_pods (user_id);
CREATE INDEX IF NOT EXISTS idx_active_gpu_pods_service   ON billing.active_gpu_pods (service_id);
CREATE INDEX IF NOT EXISTS idx_active_gpu_pods_status    ON billing.active_gpu_pods (status, last_billed_at);

COMMENT ON COLUMN billing.active_gpu_pods.service_id IS 'References public.gpu_pods.id.';

-- ─── 7. Updated-at triggers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gpu_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gpu_catalog_updated_at ON public.gpu_catalog;
CREATE TRIGGER trg_gpu_catalog_updated_at BEFORE UPDATE ON public.gpu_catalog
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

DROP TRIGGER IF EXISTS trg_gpu_pricing_updated_at ON public.gpu_pricing;
CREATE TRIGGER trg_gpu_pricing_updated_at BEFORE UPDATE ON public.gpu_pricing
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

DROP TRIGGER IF EXISTS trg_gpu_pods_updated_at ON public.gpu_pods;
CREATE TRIGGER trg_gpu_pods_updated_at BEFORE UPDATE ON public.gpu_pods
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

DROP TRIGGER IF EXISTS trg_active_gpu_pods_updated_at ON billing.active_gpu_pods;
CREATE TRIGGER trg_active_gpu_pods_updated_at BEFORE UPDATE ON billing.active_gpu_pods
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- ─── 8. Enable RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.gpu_catalog              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_pricing              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_inventory_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_pods                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_pod_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.active_gpu_pods         ENABLE ROW LEVEL SECURITY;

-- ─── 9. Grants ──────────────────────────────────────────────────────────────
GRANT SELECT ON public.gpu_catalog             TO authenticated, anon;
GRANT SELECT ON public.gpu_pricing             TO authenticated;
GRANT SELECT ON public.gpu_inventory_snapshots TO authenticated, anon;
GRANT SELECT ON public.gpu_inventory_latest    TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gpu_pods       TO authenticated;
GRANT SELECT ON public.gpu_pod_events                          TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.gpu_pods_id_seq         TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.gpu_pod_events_id_seq   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.gpu_inventory_snapshots_id_seq TO authenticated;
GRANT ALL    ON public.gpu_catalog             TO service_role;
GRANT ALL    ON public.gpu_pricing             TO service_role;
GRANT ALL    ON public.gpu_inventory_snapshots TO service_role;
GRANT ALL    ON public.gpu_pods                TO service_role;
GRANT ALL    ON public.gpu_pod_events          TO service_role;
GRANT SELECT ON billing.active_gpu_pods        TO authenticated;
GRANT ALL    ON billing.active_gpu_pods        TO service_role;

-- ─── 10. Policies ───────────────────────────────────────────────────────────
-- Catalog: marketing-readable; admin write.
DO $$ BEGIN
    CREATE POLICY "Anyone can view active gpu catalog" ON public.gpu_catalog
        FOR SELECT USING (is_active = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage gpu catalog" ON public.gpu_catalog
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pricing: authenticated readable (needed to quote); admin write.
DO $$ BEGIN
    CREATE POLICY "Authenticated can view gpu pricing" ON public.gpu_pricing
        FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins manage gpu pricing" ON public.gpu_pricing
        FOR ALL USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inventory snapshots: world-readable (marketing); service-role write only.
DO $$ BEGIN
    CREATE POLICY "Anyone can view gpu inventory snapshots" ON public.gpu_inventory_snapshots
        FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Service role manages gpu inventory" ON public.gpu_inventory_snapshots
        FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pods: owner read/write, admin read.
DO $$ BEGIN
    CREATE POLICY "Users view their own gpu pods" ON public.gpu_pods
        FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users create their own gpu pods" ON public.gpu_pods
        FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users update their own gpu pods" ON public.gpu_pods
        FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users delete their own gpu pods" ON public.gpu_pods
        FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins view all gpu pods" ON public.gpu_pods
        FOR SELECT USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pod events: owner-via-pod read; service-role and admins write.
DO $$ BEGIN
    CREATE POLICY "Users view their own gpu pod events" ON public.gpu_pod_events
        FOR SELECT USING (EXISTS (
            SELECT 1 FROM public.gpu_pods
            WHERE gpu_pods.id = gpu_pod_events.pod_id
              AND auth.uid() = gpu_pods.owner_id
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Active billing meter: owner read only; service-role for cron writes.
DO $$ BEGIN
    CREATE POLICY "Users can view own active gpu pods" ON billing.active_gpu_pods
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Service role manages active gpu pods" ON billing.active_gpu_pods
        FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 11. Seed catalog with v1 GPU lineup ────────────────────────────────────
INSERT INTO public.gpu_catalog (id, runpod_gpu_id, display_name, memory_gb, tier, sort_order, marketing_blurb)
VALUES
    ('h100-sxm-80',  'NVIDIA H100 80GB HBM3', 'H100 SXM (80 GB)',  80,  'flagship', 10, 'Highest-bandwidth H100 SXM for large-model training.'),
    ('h100-pcie-80', 'NVIDIA H100 PCIe',      'H100 PCIe (80 GB)', 80,  'flagship', 20, 'PCIe H100 for flexible deployments.'),
    ('h100-nvl-94',  'NVIDIA H100 NVL',       'H100 NVL (94 GB)',  94,  'flagship', 30, 'H100 NVL with extra memory for larger context inference.'),
    ('h200-141',     'NVIDIA H200',           'H200 SXM (141 GB)', 141, 'flagship', 40, 'H200 with 141 GB HBM3e for very large model inference.'),
    ('b200-180',     'NVIDIA B200',           'B200 (180 GB)',     180, 'flagship', 50, 'Blackwell B200 for frontier training and inference.')
ON CONFLICT (id) DO NOTHING;

-- Default pricing rows (25 % markup, no floor) for every (cloud, interruptible) combination.
INSERT INTO public.gpu_pricing (gpu_catalog_id, cloud_type, interruptible, markup_pct)
SELECT c.id, ct.cloud_type, ct.interruptible, 1.250
FROM public.gpu_catalog c
CROSS JOIN (VALUES
    ('SECURE'::TEXT,    FALSE),
    ('SECURE'::TEXT,    TRUE),
    ('COMMUNITY'::TEXT, FALSE),
    ('COMMUNITY'::TEXT, TRUE)
) AS ct(cloud_type, interruptible)
ON CONFLICT (gpu_catalog_id, cloud_type, interruptible) DO NOTHING;
