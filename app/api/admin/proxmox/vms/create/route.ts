import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CreateVMRequest {
  hostId: string;
  name: string;
  node: string;
  cpuCores: number;
  memoryMB: number;
  diskGB: number;
  sshPassword: string;
  templateVmid?: number;
  storage?: string;
  bridge?: string;
}

// Check if user is admin
async function requireAdmin(): Promise<{ ok: boolean; email?: string }> {
  try {
    const supabase = await createServerSupabase();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || "";

    if (!email) {
      return { ok: false };
    }

    // Check ADMIN_EMAILS environment variable
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length > 0 && !adminEmails.includes(email.toLowerCase())) {
      console.warn(`User ${email} attempted VM creation but is not admin`);
      return { ok: false };
    }

    return { ok: true, email };
  } catch (error) {
    console.error("Admin check error:", error);
    return { ok: false };
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
    const body = (await req.json().catch(() => ({}))) as CreateVMRequest;

    // Validate required fields
    if (!body.hostId || !body.name || !body.node || !body.sshPassword) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields: hostId, name, node, sshPassword",
        },
        { status: 400 }
      );
    }

    if (!body.cpuCores || body.cpuCores < 1 || body.cpuCores > 32) {
      return NextResponse.json(
        { ok: false, error: "Invalid cpuCores (1-32)" },
        { status: 400 }
      );
    }

    if (!body.memoryMB || body.memoryMB < 512 || body.memoryMB > 262144) {
      return NextResponse.json(
        { ok: false, error: "Invalid memoryMB (512-262144)" },
        { status: 400 }
      );
    }

    if (!body.diskGB || body.diskGB < 10 || body.diskGB > 2000) {
      return NextResponse.json(
        { ok: false, error: "Invalid diskGB (10-2000)" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // Verify host exists and is active
    const { data: host, error: hostErr } = await supabase
      .from("proxmox_hosts")
      .select("id, name, location, node, storage, bridge, gateway_ip, dns_primary, dns_secondary")
      .eq("id", body.hostId)
      .eq("is_active", true)
      .single();

    if (hostErr) {
      return NextResponse.json(
        { ok: false, error: "Host not found or inactive" },
        { status: 404 }
      );
    }

    // Get next available IP from the host's IP pools (if available)
    let assignedIp: string | null = null;
    try {
      const { data: pools } = await supabase
        .from("public_ip_pools")
        .select("id")
        .eq("host_id", body.hostId)
        .limit(1);

      if (pools && pools.length > 0) {
        const poolId = Number((pools[0] as Record<string, unknown>).id);

        // Find an unused IP
        const { data: usedServers } = await supabase
          .from("servers")
          .select("ip")
          .eq("host_id", body.hostId);
        const usedIps = new Set(
          (usedServers || []).map((s: Record<string, unknown>) => String(s.ip))
        );

        const { data: availableIps } = await supabase
          .from("public_ip_pool_ips")
          .select("ip")
          .eq("pool_id", poolId)
          .limit(1);

        if (availableIps && availableIps.length > 0) {
          const candidates = availableIps.filter(
            (r: Record<string, unknown>) => !usedIps.has(String(r.ip))
          );
          if (candidates.length > 0) {
            assignedIp = String(candidates[0].ip);
          }
        }
      }
    } catch (ipError) {
      console.warn("Failed to assign IP from pool:", ipError);
      // Continue without IP assignment
    }

    // Generate VM ID (simple sequential)
    let vmid: number;
    try {
      const { data: existingVms } = await supabase
        .from("servers")
        .select("vmid")
        .order("vmid", { ascending: false })
        .limit(1);

      vmid = (existingVms?.[0]?.vmid as number) || 100;
      vmid += 1;
    } catch {
      vmid = 100; // Default starting VM ID
    }

    // Create server record in database
    const { data: newServer, error: createErr } = await supabase
      .from("servers")
      .insert({
        name: body.name,
        vmid,
        host_id: body.hostId,
        node: body.node,
        ip: assignedIp,
        location: host.location || "Unknown",
        status: "pending",
        os: "Ubuntu 24.04 LTS",
        cpu_cores: body.cpuCores,
        memory_mb: body.memoryMB,
        disk_gb: body.diskGB,
        created_by_email: auth.email,
        details: `Created by admin ${auth.email}`,
      })
      .select()
      .single();

    if (createErr) {
      console.error("Failed to create server record:", createErr);
      return NextResponse.json(
        { ok: false, error: "Failed to create server record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      vmid,
      name: body.name,
      ip: assignedIp,
      location: host.location,
      message: `VM ${body.name} queued for creation`,
      server: newServer,
    });
  } catch (error) {
    console.error("VM creation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
