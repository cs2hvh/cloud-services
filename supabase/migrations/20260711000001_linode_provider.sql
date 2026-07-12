-- Linode reselling: provider seam on servers + per-user SSH keys.
--
-- The compute service migrates from self-managed Proxmox hosts to reselling
-- Linode instances. Proxmox rows/code stay dormant; `provider` discriminates.
-- Linode rows store the Linode region id (e.g. 'us-ord') in `location`, so the
-- hard FK to proxmox_hosts must go (kept as a soft reference for old rows).

-- ─── 1. servers: provider discriminator + Linode identity ───────────────────
ALTER TABLE public.servers
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'proxmox'
        CHECK (provider IN ('proxmox', 'linode'));

ALTER TABLE public.servers
    ADD COLUMN IF NOT EXISTS linode_id BIGINT;

-- Partial unique index (not a UNIQUE constraint) so NULLs on proxmox rows are free.
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_linode_id
    ON public.servers (linode_id)
    WHERE linode_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servers_provider ON public.servers (provider);

-- location: 'us-ord' etc. for Linode rows — proxmox_hosts FK no longer holds.
ALTER TABLE public.servers DROP CONSTRAINT IF EXISTS servers_location_fkey;

COMMENT ON COLUMN public.servers.provider IS
    'Compute backend for this row: proxmox (legacy, dormant) or linode (resold).';
COMMENT ON COLUMN public.servers.linode_id IS
    'Linode instance id when provider = linode.';
COMMENT ON COLUMN public.servers.location IS
    'proxmox_hosts.id for proxmox rows; Linode region id (e.g. us-ord) for linode rows.';

-- ─── 2. Per-user SSH public keys (greenfield) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_ssh_keys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label               TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
    public_key          TEXT NOT NULL,
    key_type            TEXT NOT NULL,
    fingerprint_sha256  TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at        TIMESTAMPTZ,
    UNIQUE (user_id, fingerprint_sha256)
);

CREATE INDEX IF NOT EXISTS idx_user_ssh_keys_user ON public.user_ssh_keys (user_id);

COMMENT ON TABLE public.user_ssh_keys IS
    'User-managed OpenSSH public keys, injected as authorized_keys at instance create/rebuild.';
COMMENT ON COLUMN public.user_ssh_keys.fingerprint_sha256 IS
    'SHA256:<base64> fingerprint of the decoded key blob; dedupe + display.';

ALTER TABLE public.user_ssh_keys ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ssh_keys TO authenticated;
GRANT ALL ON public.user_ssh_keys TO service_role;

DO $$ BEGIN
    CREATE POLICY "Users view their own ssh keys" ON public.user_ssh_keys
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users create their own ssh keys" ON public.user_ssh_keys
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users update their own ssh keys" ON public.user_ssh_keys
        FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users delete their own ssh keys" ON public.user_ssh_keys
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
