-- Instance plan catalog + tier tracking + admin-controlled plan management.
--
-- Replaces the hardcoded plan catalog in lib/pricing/instance-plans.ts
-- with a DB-backed table so admins can adjust vCPU/RAM/disk/price/name
-- of every plan — and add or remove plans — without a code change.
--
-- The code constants in lib/pricing/instance-plans.ts now act as a
-- one-time seed loaded by this migration; the runtime path queries
-- the `instance_plans` table directly.
--
-- Status: NOT YET APPLIED. Review and run when ready:
--   `supabase db push`   (or run via SQL editor)

-- ─── servers: tier + plan slug ──────────────────────────────────
ALTER TABLE servers
    ADD COLUMN IF NOT EXISTS tier text DEFAULT 'shared'
        CHECK (tier IN ('shared', 'dedicated')),
    ADD COLUMN IF NOT EXISTS plan_slug text;

CREATE INDEX IF NOT EXISTS idx_servers_tier ON servers(tier);
CREATE INDEX IF NOT EXISTS idx_servers_plan_slug ON servers(plan_slug);

-- ─── proxmox_hosts: shared-vCPU oversubscription ratio ──────────
ALTER TABLE proxmox_hosts
    ADD COLUMN IF NOT EXISTS shared_oversubscription_ratio integer DEFAULT 4
        CHECK (shared_oversubscription_ratio BETWEEN 1 AND 16);

-- ─── instance_plans: the catalog itself ─────────────────────────
-- One row per purchasable plan. Admin-editable end-to-end.
CREATE TABLE IF NOT EXISTS instance_plans (
    slug         text PRIMARY KEY,
    name         text NOT NULL,
    tier         text NOT NULL CHECK (tier IN ('shared', 'dedicated')),
    vcpu         integer NOT NULL CHECK (vcpu >= 1 AND vcpu <= 256),
    memory_mb    integer NOT NULL CHECK (memory_mb >= 256 AND memory_mb <= 2097152),
    disk_gb      integer NOT NULL CHECK (disk_gb >= 10 AND disk_gb <= 100000),
    hourly_usd   numeric(10, 5) NOT NULL CHECK (hourly_usd >= 0),
    monthly_usd  numeric(10, 2) NOT NULL CHECK (monthly_usd >= 0),
    tagline      text,
    is_active    boolean NOT NULL DEFAULT true,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_instance_plans_tier_active
    ON instance_plans(tier, is_active, sort_order);

ALTER TABLE instance_plans ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can SELECT (so the customer dashboard can
-- list plans). Only admins can mutate.
DO $$ BEGIN
    CREATE POLICY "Authenticated users can view instance plans" ON instance_plans
        FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins can insert instance plans" ON instance_plans
        FOR INSERT WITH CHECK (EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
              AND 'admin' = ANY(user_profiles.roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins can update instance plans" ON instance_plans
        FOR UPDATE USING (EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
              AND 'admin' = ANY(user_profiles.roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Admins can delete instance plans" ON instance_plans
        FOR DELETE USING (EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
              AND 'admin' = ANY(user_profiles.roles)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Seed: code defaults from lib/pricing/instance-plans.ts ─────
-- ON CONFLICT DO NOTHING so re-running the migration on an existing
-- DB doesn't clobber admin edits.
INSERT INTO instance_plans
    (slug, name, tier, vcpu, memory_mb, disk_gb, hourly_usd, monthly_usd, tagline, sort_order)
VALUES
    ('s-1', 'Shared 1×1',  'shared',    1,   1024,   15, 0.007,   5.00, 'Hobby site / dev box',        11),
    ('s-2', 'Shared 1×2',  'shared',    1,   2048,   30, 0.014,  10.00, 'Small API / staging',         12),
    ('s-3', 'Shared 2×4',  'shared',    2,   4096,   60, 0.027,  20.00, 'Production web app',          13),
    ('s-4', 'Shared 2×8',  'shared',    2,   8192,  120, 0.054,  40.00, 'Mid-tier API',                14),
    ('s-5', 'Shared 4×16', 'shared',    4,  16384,  200, 0.107,  80.00, 'Light dedicated workload',    15),
    ('s-6', 'Shared 6×24', 'shared',    6,  24576,  320, 0.160, 120.00, 'Larger shared workload',      16),
    ('s-7', 'Shared 8×32', 'shared',    8,  32768,  480, 0.214, 160.00, 'Top of shared range',         17),
    ('d-2',  'Dedicated 2×8',    'dedicated',  2,   8192,  200, 0.054,  40.00, 'Entry dedicated, DB primary',     21),
    ('d-4',  'Dedicated 4×16',   'dedicated',  4,  16384,  400, 0.107,  80.00, 'Production DB / game server',     22),
    ('d-8',  'Dedicated 8×32',   'dedicated',  8,  32768,  800, 0.214, 160.00, 'High-traffic production',         23),
    ('d-16', 'Dedicated 16×64',  'dedicated', 16,  65536, 1600, 0.428, 320.00, 'Enterprise tier',                 24),
    ('d-32', 'Dedicated 32×128', 'dedicated', 32, 131072, 3200, 0.857, 640.00, 'Heavy workload',                  25)
ON CONFLICT (slug) DO NOTHING;

-- Drop the no-longer-needed price-only table (created in an earlier
-- iteration of this migration that never made it to prod).
DROP TABLE IF EXISTS instance_plan_prices;

-- ─── Comments ───────────────────────────────────────────────────
COMMENT ON COLUMN servers.tier IS
    'Instance tier: shared (burstable, oversubscribed) or dedicated (1:1 pinned cores)';
COMMENT ON COLUMN servers.plan_slug IS
    'Catalog plan that was selected at create time. References instance_plans.slug, but kept as plain text (denormalized cpu/ram/disk on the server row are authoritative even if the plan is later edited).';
COMMENT ON COLUMN proxmox_hosts.shared_oversubscription_ratio IS
    'How many shared vCPUs may be sold per physical core on this host. Default 4.';
COMMENT ON TABLE  instance_plans IS
    'Customer-facing instance catalog. Admin-editable end-to-end: vCPU, RAM, disk, price, name, tagline. Code seed lives in lib/pricing/instance-plans.ts (used only on first migration).';
COMMENT ON COLUMN instance_plans.sort_order IS
    'Display order in the customer plan picker (ascending). Convention: 10-19 for shared, 20-29 for dedicated.';
