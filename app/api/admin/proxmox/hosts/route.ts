import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  pools?: Array<{ ip_range: string; gateway_ip?: string }>;
  templates?: Array<{ name: string; vmid: number; os_type?: string }>;
}

// Check if user is admin
async function requireAdmin(): Promise<{ ok: boolean; email?: string }> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || "";

    if (!email) {
      return { ok: false };
    }

    // Check if user is admin (you can modify this logic based on your user_profiles roles)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("roles")
      .eq("id", userData?.user?.id)
      .single();

    const isAdmin = profile?.roles?.includes("admin");
    if (!isAdmin) {
      return { ok: false };
    }

    return { ok: true, email };
  } catch {
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
    const supabase = await createClient();

    const { data: hosts, error } = await supabase
      .from("proxmox_hosts")
      .select(
        `
        id, name, host_url, allow_insecure_tls, token_id, node, storage, 
        bridge, template_vmid, gateway_ip, dns_primary, dns_secondary, 
        is_active, created_at, updated_at,
        public_ip_pools ( id, ip_range, gateway_ip ),
        proxmox_templates ( id, vmid, name, os_type, is_active )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
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

    const supabase = await createClient();

    // Prepare host payload
    const hostPayload: Record<string, unknown> = {
      id: body.id || undefined,
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

    // Handle IP pools
    if (body.pools && Array.isArray(body.pools)) {
      // Delete existing pools for this host
      await supabase.from("public_ip_pools").delete().eq("host_id", hostId);

      // Insert new pools
      for (const pool of body.pools) {
        if (!pool.ip_range) continue;

        const { error: poolErr } = await supabase
          .from("public_ip_pools")
          .insert({
            host_id: hostId,
            ip_range: pool.ip_range,
            gateway_ip: pool.gateway_ip || null,
            is_active: true,
          });

        if (poolErr) {
          console.error("Pool insert error:", poolErr);
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
