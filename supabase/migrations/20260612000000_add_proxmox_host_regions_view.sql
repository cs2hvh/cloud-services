-- Public-readable view exposing non-sensitive Proxmox host info so the
-- dashboard can show a country flag + datacenter label next to each server.
--
-- The underlying proxmox_hosts table stays admin-only (it carries API
-- tokens, passwords, gateway IPs, etc.) — this view only surfaces the
-- columns that are safe for any authenticated user to see.

-- `security_invoker = false` makes the view run with the rights of its
-- owner (the migration-running superuser) instead of the calling user.
-- That way the proxmox_hosts RLS (admin-only) doesn't block authenticated
-- end-users from reading the four safe columns we expose here.
CREATE OR REPLACE VIEW public.proxmox_host_regions
WITH (security_invoker = false) AS
SELECT
    id,
    name,
    region,
    display_region
FROM public.proxmox_hosts;

GRANT SELECT ON public.proxmox_host_regions TO authenticated, anon;
