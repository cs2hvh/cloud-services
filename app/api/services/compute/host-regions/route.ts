import { createClient, createWorkerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/compute/host-regions
 *
 * Returns the id → { name, region, display_region } map for every Proxmox
 * host so the VPS list can render a country flag + datacenter label per
 * server. The underlying proxmox_hosts table is admin-only (RLS), so we
 * resolve it server-side with the service client and expose ONLY the four
 * non-sensitive columns — never tokens, passwords, gateways, or URLs.
 *
 * This replaces a client-side read of the public proxmox_host_regions view,
 * which depends on the view migration being applied + PostgREST seeing it.
 * Resolving here mirrors how the VPS detail route already returns region.
 */
export async function GET() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = await createWorkerClient();
  const { data, error } = await supabase
    .from("proxmox_hosts")
    .select("id, name, region, display_region");

  if (error) {
    console.error("[host-regions] query failed:", error.message);
    return Response.json({ ok: false, error: "Unable to load regions" }, { status: 500 });
  }

  return Response.json({ ok: true, regions: data ?? [] });
}
