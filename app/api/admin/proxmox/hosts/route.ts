import { NextRequest, NextResponse } from "next/server";
import { createClient, createServerSupabase } from "@/lib/supabase/server";
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
  template_vmid?: number;
  is_active?: boolean;
  pools?: Array<{ mac: string; ips: string[] }>;
  templates?: Array<{ name: string; vmid: number; os_type?: string }>;
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

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
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
        is_active, created_at, updated_at,
        public_ip_pools ( id, mac, public_ip_pool_ips ( id, ip ) ),
        proxmox_templates ( id, vmid, name, os_type, is_active )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      hosts: hosts || [],
    });
  } catch (error) {
    console.error("GET /api/admin/proxmox/hosts error:", error);
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      { ok: false, error: err.message },
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
      id: body.id || uuidv4(), // Generate UUID if creating new host
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
      template_vmid: body.template_vmid || null,
      is_active: body.is_active ?? true,
    };

    // Upsert host
    const { data: upserted, error: upsertErr } = await supabase
      .from("proxmox_hosts")
      .upsert(hostPayload, { onConflict: "id" })
      .select("id")
      .single();

    if (upsertErr) {
      return NextResponse.json(
        { ok: false, error: upsertErr.message },
        { status: 500 }
      );
    }

    const hostId = (upserted as Record<string, unknown>)?.id as string;

    // Handle IP pools - sync by MAC (each pool has multiple IPs)
    if (body.pools && Array.isArray(body.pools)) {
      const pools = body.pools
        .filter((p) => p?.mac && Array.isArray(p?.ips) && p.ips.length > 0)
        .map((p) => ({
          mac: String(p.mac),
          ips: (p.ips || []).filter(Boolean).map((ip) => String(ip)),
        }));

      // Get existing pools for this host
      const { data: existingPools } = await supabase
        .from("public_ip_pools")
        .select("id, mac")
        .eq("host_id", hostId);

      const existingMap = new Map<string, string>();
      for (const p of existingPools || []) {
        const pool = p as unknown as { mac: string; id: string };
        existingMap.set(String(pool.mac), String(pool.id));
      }

      const incomingMacs = new Set(pools.map((p) => p.mac));

      // Delete pools that are no longer present
      for (const [mac, id] of existingMap.entries()) {
        if (!incomingMacs.has(mac)) {
          await supabase.from("public_ip_pools").delete().eq("id", id);
        }
      }

      // Upsert each pool and its IPs
      for (const pool of pools) {
        let poolId = existingMap.get(pool.mac);
        
        if (!poolId) {
          // Insert new pool
          const { data: inserted, error: poolErr } = await supabase
            .from("public_ip_pools")
            .insert({
              host_id: hostId,
              mac: pool.mac,
            })
            .select("id")
            .single();

          if (poolErr) {
            console.error("Pool insert error:", poolErr);
            continue;
          }
          poolId = String((inserted as Record<string, unknown>)?.id);
        }

        // Sync IPs for this pool
        const { data: existingIps } = await supabase
          .from("public_ip_pool_ips")
          .select("id, ip")
          .eq("pool_id", poolId);

        const existingIpSet = new Set(
          (existingIps || []).map((r: unknown) => {
            const row = r as { ip: string };
            return String(row.ip);
          })
        );
        const incomingIpSet = new Set(pool.ips.map((s) => String(s)));

        // Insert missing IPs
        const toInsert = pool.ips
          .filter((ip) => !existingIpSet.has(String(ip)))
          .map((ip) => ({ pool_id: poolId!, ip: String(ip) }));
        if (toInsert.length > 0) {
          await supabase.from("public_ip_pool_ips").insert(toInsert);
        }

        // Delete removed IPs
        const toDelete = [...existingIpSet].filter((ip) => !incomingIpSet.has(String(ip)));
        if (toDelete.length > 0) {
          await supabase
            .from("public_ip_pool_ips")
            .delete()
            .eq("pool_id", poolId)
            .in("ip", toDelete as string[]);
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
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      { ok: false, error: err.message },
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

    // Use server Supabase client
    const supabase = createServerSupabase();

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
        return NextResponse.json(
          { ok: false, error: `Failed to delete servers: ${serversDeleteErr.message}` },
          { status: 500 }
        );
      }
    }

    // Delete host (cascade will delete IP pools, templates, etc.)
    const { error: deleteErr } = await supabase
      .from("proxmox_hosts")
      .delete()
      .eq("id", hostId);

    if (deleteErr) {
      return NextResponse.json(
        { ok: false, error: deleteErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Host "${host.name}" deleted successfully`,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
