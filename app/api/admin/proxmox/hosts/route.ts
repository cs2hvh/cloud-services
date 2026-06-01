import { NextRequest, NextResponse } from "next/server";
import { createClient, createServerSupabase, createWorkerClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface HostInput {
  id?: string;
  name: string;
  host_url: string;
  allow_insecure_tls?: boolean;
  token_id?: string;
  token_secret?: string;
  username?: string;
  password?: string;
  node: string;
  storage?: string;
  bridge?: string;
  gateway_ip?: string;
  dns_primary?: string;
  dns_secondary?: string;
  provider?: string;
  server_series?: string;
  network_mode?: string;
  vm_private_cidr?: string;
  vm_private_gateway?: string;
  vm_private_ip_start?: number;
  public_prefix_length?: number;
  snippet_storage?: string;
  template_vmid?: number;
  region?: string;
  display_region?: string;
  total_cpu_cores?: number;
  total_memory_mb?: number;
  total_disk_gb?: number;
  is_active?: boolean;
  pools?: Array<{ mac: string; ips: string[]; label?: string }>;
  templates?: Array<{ name: string; vmid: number; os_type?: string; os_display_name?: string }>;
}

// Check if user is admin
async function requireAdmin(): Promise<{ ok: boolean; email?: string; userId?: string }> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || "";
    const userId = userData?.user?.id || "";

    if (!email || !userId) {
      return { ok: false };
    }

    // Check ADMIN_EMAILS environment variable first (simple and reliable)
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length > 0 && !adminEmails.includes(email.toLowerCase())) {
      console.warn(`User ${email} attempted admin access but is not in ADMIN_EMAILS`);
      return { ok: false };
    }

    // If ADMIN_EMAILS is not set, fall back to user_profiles check
    if (adminEmails.length === 0) {
      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("roles")
          .eq("id", userId)
          .single();

        const isAdmin = profile?.roles?.includes("admin");
        if (!isAdmin) {
         // console.warn(`User ${email} attempted admin access but is not an admin`);
          return { ok: false };
        }
      } catch (profileError) {
        console.error(`Failed to check admin status for ${email}:`, profileError);
        return { ok: false };
      }
    }

    return { ok: true, email, userId };
  } catch (error) {
    console.error("Admin check error:", error);
    return { ok: false };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // Return used IPs (IPs currently assigned to servers)
  if (action === 'used-ips') {
    try {
      const supabase = createServerSupabase();
      const { data: servers } = await supabase
        .from('servers')
        .select('ip')
        .not('ip', 'is', null);
      const usedIps = (servers || []).map(s => s.ip).filter(Boolean);
      return NextResponse.json({ ok: true, usedIps });
    } catch (error) {
      console.error('Failed to fetch used IPs:', error);
      return NextResponse.json({ ok: true, usedIps: [] });
    }
  }

  try {
    // Use server Supabase client (anon key with disabled cookies)
    const supabase = createServerSupabase();

    const { data: hosts, error } = await supabase
      .from("proxmox_hosts")
      .select(
        `
        id, name, host_url, allow_insecure_tls, token_id, node, storage, 
        bridge, template_vmid, gateway_ip, dns_primary, dns_secondary,
        provider, server_series, network_mode, vm_private_cidr, vm_private_gateway,
        vm_private_ip_start, public_prefix_length, snippet_storage,
        region, display_region, total_cpu_cores, total_memory_mb, total_disk_gb,
        is_active, created_at, updated_at,
        public_ip_pools ( id, mac, public_ip_pool_ips ( id, ip ) ),
        proxmox_templates ( id, vmid, name, os_type, os_display_name, is_active )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin Hosts] Query error:", error.message, error.code);
      return NextResponse.json(
        { ok: false, error: "Unable to load hosts. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      hosts: hosts || [],
    });
  } catch (error) {
    console.error("[Admin Hosts] GET error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as HostInput;

    // Validation
    if (!body.name || !body.host_url || !body.node) {
      return NextResponse.json(
        {
          ok: false,
          error: "name, host_url, and node are required",
        },
        { status: 400 }
      );
    }

    // Use server Supabase client (anon key with disabled cookies)
    const supabase = createServerSupabase();

    // Prepare host payload
    const hostPayload: Record<string, unknown> = {
      id: body.id || uuidv4(),
      name: body.name,
      host_url: body.host_url,
      allow_insecure_tls: body.allow_insecure_tls ?? false,
      token_id: body.token_id || null,
      token_secret: body.token_secret || null,
      username: body.username || null,
      password: body.password || null,
      node: body.node,
      storage: body.storage || "local",
      bridge: body.bridge || "vmbr0",
      gateway_ip: body.gateway_ip || null,
      dns_primary: body.dns_primary || null,
      dns_secondary: body.dns_secondary || null,
      provider: body.provider || "ovh",
      server_series: body.server_series || "generic",
      network_mode: body.network_mode || "legacy_public_gateway",
      vm_private_cidr: body.vm_private_cidr || null,
      vm_private_gateway: body.vm_private_gateway || null,
      vm_private_ip_start: body.vm_private_ip_start || 10,
      public_prefix_length: body.public_prefix_length || 32,
      snippet_storage: body.snippet_storage || "local",
      template_vmid: body.template_vmid || null,
      region: body.region || "default",
      display_region: body.display_region || "Default",
      total_cpu_cores: body.total_cpu_cores || 0,
      total_memory_mb: body.total_memory_mb || 0,
      total_disk_gb: body.total_disk_gb || 0,
      is_active: body.is_active ?? true,
    };

    // Upsert host
    const { data: upserted, error: upsertErr } = await supabase
      .from("proxmox_hosts")
      .upsert(hostPayload, { onConflict: "id" })
      .select("id")
      .single();

    if (upsertErr) {
      console.error("[Admin Hosts] Upsert error:", upsertErr.message);
      return NextResponse.json(
        { ok: false, error: "Failed to save host. Please try again." },
        { status: 500 }
      );
    }

    const hostId = (upserted as Record<string, unknown>)?.id as string;

    // Handle IP addresses - each IP gets its own pool (1 MAC = 1 IP)
    if (body.pools && Array.isArray(body.pools)) {
      const ipEntries = body.pools
        .filter((p) => p?.mac && Array.isArray(p?.ips) && p.ips.length > 0)
        .map((p) => ({
          mac: String(p.mac),
          ip: String(p.ips[0]),
          label: p.label ? String(p.label) : null,
        }));

      // Get existing pools and their IPs for this host
      const { data: existingPools } = await supabase
        .from("public_ip_pools")
        .select("id, mac, label, public_ip_pool_ips ( id, ip )")
        .eq("host_id", hostId);

      // Build a map of existing entries: ip -> { poolId, mac }
      const existingByIp = new Map<string, { poolId: string; mac: string; label: string | null }>();
      for (const p of (existingPools || []) as Array<{ id: string; mac: string; label?: string | null; public_ip_pool_ips: Array<{ id: string; ip: string }> }>) {
        for (const ipRow of (p.public_ip_pool_ips || [])) {
          existingByIp.set(String(ipRow.ip), { poolId: String(p.id), mac: String(p.mac), label: p.label || null });
        }
      }

      const incomingIps = new Set(ipEntries.map((e) => e.ip));

      // Delete pools for IPs that are no longer present
      for (const [ip, { poolId }] of existingByIp.entries()) {
        if (!incomingIps.has(ip)) {
          await supabase.from("public_ip_pools").delete().eq("id", poolId);
        }
      }

      // Upsert each IP entry
      for (const entry of ipEntries) {
        const existing = existingByIp.get(entry.ip);

        if (existing) {
          // Update MAC if changed
          if (existing.mac !== entry.mac || existing.label !== entry.label) {
            await supabase
              .from("public_ip_pools")
              .update({ mac: entry.mac, label: entry.label })
              .eq("id", existing.poolId);
          }
        } else {
          // Create new pool + IP
          const { data: inserted, error: poolErr } = await supabase
            .from("public_ip_pools")
            .insert({ host_id: hostId, mac: entry.mac, label: entry.label })
            .select("id")
            .single();

          if (poolErr) {
            console.error("Pool insert error:", poolErr);
            continue;
          }
          const poolId = String((inserted as Record<string, unknown>)?.id);
          await supabase
            .from("public_ip_pool_ips")
            .insert({ pool_id: poolId, ip: entry.ip });
        }
      }
    }

    // Handle templates
    if (body.templates && Array.isArray(body.templates)) {
      // Delete existing templates for this host
      await supabase.from("proxmox_templates").delete().eq("host_id", hostId);

      // Insert new templates
      for (const template of body.templates) {
        if (!template.name || !template.vmid) continue;

        const { error: tplErr } = await supabase
          .from("proxmox_templates")
          .insert({
            host_id: hostId,
            vmid: template.vmid,
            name: template.name,
            os_type: template.os_type || null,
            os_display_name: template.os_display_name || template.name,
            is_active: true,
          });

        if (tplErr) {
          console.error("Template insert error:", tplErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Host saved successfully",
      hostId,
    });
  } catch (error) {
    console.error("[Admin Hosts] POST error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const hostId = searchParams.get('id');
    const force = searchParams.get('force') === 'true';

    if (!hostId) {
      return NextResponse.json(
        { ok: false, error: "Host ID required" },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS for cascade deletes
    const supabase = await createWorkerClient();

    // Check if host exists
    const { data: host } = await supabase
      .from("proxmox_hosts")
      .select("id, name")
      .eq("id", hostId)
      .maybeSingle();

    if (!host) {
      return NextResponse.json(
        { ok: false, error: "Host not found" },
        { status: 404 }
      );
    }

    // Check for existing servers
    const {  count } = await supabase
      .from("servers")
      .select("id, name", { count: 'exact' })
      .eq("location", hostId);

    if (count && count > 0 && !force) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot delete host. ${count} server(s) still reference this host.`,
          serverCount: count,
          requiresForce: true
        },
        { status: 409 }
      );
    }

    // If force=true, delete servers first
    if (force && count && count > 0) {
      const { error: serversDeleteErr } = await supabase
        .from("servers")
        .delete()
        .eq("location", hostId);

      if (serversDeleteErr) {
        console.error("[Admin Hosts] Server cleanup error:", serversDeleteErr.message);
        return NextResponse.json(
          { ok: false, error: "Failed to clean up associated servers. Please try again." },
          { status: 500 }
        );
      }
    }

    // Manually delete child records to avoid FK constraint issues with RLS
    // 1. Delete IPs from pools belonging to this host
    const { data: pools } = await supabase
      .from("public_ip_pools")
      .select("id")
      .eq("host_id", hostId);

    if (pools && pools.length > 0) {
      const poolIds = pools.map((p) => Number(p.id));
      await supabase
        .from("public_ip_pool_ips")
        .delete()
        .in("pool_id", poolIds);
    }

    // 2. Delete IP pools
    await supabase
      .from("public_ip_pools")
      .delete()
      .eq("host_id", hostId);

    // 3. Delete templates
    await supabase
      .from("proxmox_templates")
      .delete()
      .eq("host_id", hostId);

    // 4. Delete host
    const { error: deleteErr } = await supabase
      .from("proxmox_hosts")
      .delete()
      .eq("id", hostId);

    if (deleteErr) {
      console.error("[Admin Hosts] Delete error:", deleteErr.message);
      return NextResponse.json(
        { ok: false, error: "Failed to delete host. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Host "${host.name}" deleted successfully`,
    });
  } catch (error) {
    console.error("[Admin Hosts] DELETE error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
