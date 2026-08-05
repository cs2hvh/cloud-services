-- Close direct client access to the resold compute catalog.
--
-- The catalog tables were granted SELECT to anon/authenticated. The anon key
-- ships in the browser bundle, so anyone could query PostgREST directly and
-- read:
--   * linode_types.label   — upstream product names ("Linode 90GB"), which the
--                            API layer rewrites for customers; reading the
--                            table bypasses that rewrite entirely
--   * linode_types.hourly_usd — our COST price. Against the resale price a
--                            customer is quoted, that discloses our margin.
--   * linode_images.id     — "linode/ubuntu24.04"
--   * linode_regions.capabilities — contains "Linodes"
--
-- Nothing legitimate needs those grants: every server-side reader
-- (options, v1 compute routes, create/resize/rebuild flows, catalog sync)
-- goes through a service-role client, which bypasses RLS. Verified by
-- inspection — no client component queries linode_* directly.
--
-- Revoke the grants AND drop the permissive read policies so both layers
-- agree. With no policy left, a future re-GRANT fails closed rather than
-- silently re-opening the table.

-- ─── 1. Revoke direct read access ───────────────────────────────────────────
REVOKE SELECT ON public.linode_regions             FROM anon, authenticated;
REVOKE SELECT ON public.linode_types               FROM anon, authenticated;
REVOKE SELECT ON public.linode_images              FROM anon, authenticated;
REVOKE SELECT ON public.linode_region_availability FROM anon, authenticated;
REVOKE SELECT ON public.linode_pricing             FROM anon, authenticated;

-- ─── 2. Drop the now-contradictory read policies ────────────────────────────
DROP POLICY IF EXISTS "Anyone can view active linode regions"        ON public.linode_regions;
DROP POLICY IF EXISTS "Anyone can view active linode types"          ON public.linode_types;
DROP POLICY IF EXISTS "Authenticated can view active linode images"  ON public.linode_images;
DROP POLICY IF EXISTS "Authenticated can view linode availability"   ON public.linode_region_availability;
DROP POLICY IF EXISTS "Authenticated can view linode pricing"        ON public.linode_pricing;

-- Admin management policies and the service_role grants are deliberately left
-- untouched: admin routes and the sync job use service-role clients.

COMMENT ON TABLE public.linode_types IS
    'Synced upstream plan catalog. Service-role only — hourly_usd is our COST '
    'price and label carries upstream product naming. Customers must reach '
    'this through the API, which applies markup and renames.';
