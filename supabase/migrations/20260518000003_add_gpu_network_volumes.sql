-- Network volumes — persistent block storage that survives pod destruction.
-- Backed by RunPod's POST /v1/networkvolumes. A pod with networkVolumeId
-- automatically pins to the volume's datacenter.

CREATE TABLE IF NOT EXISTS public.gpu_network_volumes (
    id                BIGSERIAL PRIMARY KEY,
    owner_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_email       TEXT,
    runpod_volume_id  TEXT UNIQUE,
    name              TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    size_gb           INTEGER NOT NULL CHECK (size_gb >= 1 AND size_gb <= 4000),
    data_center_id    TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'creating'
                      CHECK (status IN ('creating','available','attached','error','deleted')),
    monthly_cost_usd  NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (monthly_cost_usd >= 0),
    runpod_cost_per_month_usd NUMERIC(10,4) CHECK (runpod_cost_per_month_usd IS NULL OR runpod_cost_per_month_usd >= 0),
    details           JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gpu_vol_owner  ON public.gpu_network_volumes (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_gpu_vol_runpod ON public.gpu_network_volumes (runpod_volume_id)
    WHERE runpod_volume_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_gpu_network_volumes_updated_at ON public.gpu_network_volumes;
CREATE TRIGGER trg_gpu_network_volumes_updated_at BEFORE UPDATE
    ON public.gpu_network_volumes
    FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE public.gpu_network_volumes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gpu_network_volumes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.gpu_network_volumes_id_seq TO authenticated;
GRANT ALL ON public.gpu_network_volumes TO service_role;

DO $$ BEGIN
    CREATE POLICY "Users view own gpu network volumes" ON public.gpu_network_volumes
        FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users create own gpu network volumes" ON public.gpu_network_volumes
        FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users update own gpu network volumes" ON public.gpu_network_volumes
        FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users delete own gpu network volumes" ON public.gpu_network_volumes
        FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins view all gpu network volumes" ON public.gpu_network_volumes
        FOR SELECT USING (EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND 'admin' = ANY(roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime so the storage page picks up create/delete instantly.
ALTER TABLE public.gpu_network_volumes REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'gpu_network_volumes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.gpu_network_volumes;
    END IF;
END $$;

-- A pod referencing a network volume is meaningful for billing / lifecycle.
COMMENT ON COLUMN public.gpu_pods.network_volume_id IS
    'RunPod network volume id (free-text). If set, the pod pins to that volume''s datacenter.';
