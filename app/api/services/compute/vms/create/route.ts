import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateHourlyCost, type ServerSpecs } from "@/lib/pricing";
import {
  proxmoxAuth,
  getDispatcher,
  getNextVMID,
  cloneTemplate,
  configureVM,
  startVM,
  waitTask,
  serializeError,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";

interface VMCreateRequest {
  location: string;
  os: string;
  hostname: string;
  cpuCores: number;
  memoryMB: number;
  diskGB: number;
  sshPassword: string;
  ownerId?: string;
  ownerEmail?: string;
  ipPrimary?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<VMCreateRequest>;

    // Input validation
    const { location, os, hostname, cpuCores, memoryMB, diskGB, sshPassword, ownerId, ownerEmail, ipPrimary } = body;

    const errors: string[] = [];
    if (!hostname || typeof hostname !== 'string' || !hostname.trim()) errors.push("hostname required");
    if (!location) errors.push("location (host ID) required");
    if (!os || typeof os !== 'string' || !os.trim()) errors.push("os required");
    if (!cpuCores || cpuCores < 1) errors.push("cpuCores must be >= 1");
    if (!memoryMB || memoryMB < 512) errors.push("memoryMB must be >= 512");
    if (!diskGB || diskGB < 10) errors.push("diskGB must be >= 10");
    if (!sshPassword || typeof sshPassword !== 'string' || !sshPassword.trim()) errors.push("sshPassword required");

    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, error: errors.join("; ") },
        { status: 400 }
      );
    }

    // Ensure hostname is string for use below
    const hostnameSafe = hostname as string;

    const supabase = await createClient();

    // 1. Get Proxmox host configuration
    const { data: hostData, error: hostErr } = await supabase
      .from("proxmox_hosts")
      .select("*")
      .eq("id", location)
      .eq("is_active", true)
      .maybeSingle();

    if (hostErr || !hostData) {
      return NextResponse.json(
        { ok: false, error: "Proxmox host not found or inactive" },
        { status: 404 }
      );
    }

    const host = hostData as unknown as ProxmoxHost;

    // 2. Resolve IP address (auto-assign if not provided)
    let assignedIP = ipPrimary;

    if (!assignedIP) {
      const { data: availableIP } = await supabase
        .from("public_ips")
        .select("ip")
        .eq("host_id", location)
        .eq("is_used", false)
        .limit(1)
        .maybeSingle();

      if (!availableIP?.ip) {
        return NextResponse.json(
          { ok: false, error: "No available IP addresses" },
          { status: 409 }
        );
      }
      assignedIP = availableIP.ip;
    }

    // Check if IP already in use
    const { data: ipCheck } = await supabase
      .from("public_ips")
      .select("id")
      .eq("ip", assignedIP)
      .eq("is_used", true)
      .maybeSingle();

    if (ipCheck) {
      return NextResponse.json(
        { ok: false, error: "IP already in use" },
        { status: 409 }
      );
    }

    // 3. Calculate costs (for display, not enforcement)
    const serverSpecs: ServerSpecs = {
      cpuCores: Number(cpuCores),
      memoryGB: Number(memoryMB) / 1024,
      diskGB: Number(diskGB),
      location: host.name,
    };
    const hourlyCost = calculateHourlyCost(serverSpecs);

    // 4. Create database reservation
    const billingStart = new Date();
    const { data: inserted, error: insertErr } = await supabase
      .from("servers")
      .insert({
        vmid: 0,
        node: host.node,
        name: hostnameSafe,
        ip: assignedIP,
        os: os,
        location: location,
        cpu_cores: cpuCores,
        memory_mb: memoryMB,
        disk_gb: diskGB,
        status: "provisioning",
        owner_id: ownerId || null,
        owner_email: ownerEmail || null,
        hourly_cost: hourlyCost,
        billing_start: billingStart.toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return NextResponse.json(
        { ok: false, error: "Failed to create server record", details: insertErr.message },
        { status: 500 }
      );
    }

    const serverId = (inserted as Record<string, unknown>)?.id as number | undefined;
    if (!serverId) {
      return NextResponse.json(
        { ok: false, error: "Failed to get server ID" },
        { status: 500 }
      );
    }

    try {
      // 5. Authenticate with Proxmox
      const dispatcher = getDispatcher(host.allow_insecure_tls);
      const auth = await proxmoxAuth(host, dispatcher);

      // 6. Resolve template VMID
      let templateVmid: number | undefined;

      // Try from database first
      if (host.template_vmid) {
        templateVmid = host.template_vmid;
      }

      // Try to find matching template by OS name
      if (!templateVmid) {
        const { data: templates } = await supabase
          .from("proxmox_templates")
          .select("vmid")
          .eq("host_id", location)
          .ilike("name", `%${os}%`)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (templates?.vmid) {
          templateVmid = templates.vmid;
        }
      }

      if (!templateVmid) {
        throw new Error(
          `No template found for OS "${os}". Configure template_vmid for host.`
        );
      }

      // 7. Get next VMID
      const newVmid = await getNextVMID(host, auth, dispatcher);

      // 8. Clone template
      const cloneTaskId = await cloneTemplate(
        host,
        templateVmid,
        newVmid,
        hostnameSafe,
        auth,
        dispatcher
      );

      await waitTask(host, cloneTaskId, auth, dispatcher, 120000);

      // 9. Configure VM
      await configureVM(
        host,
        newVmid,
        {
          cores: cpuCores,
          sockets: 1,
          memory: memoryMB,
          net0: `virtio,bridge=${host.bridge}`,
          ipconfig0: host.gateway_ip
            ? `ip=${assignedIP}/24,gw=${host.gateway_ip}`
            : undefined,
          nameserver: host.dns_primary || undefined,
          searchdomain: host.dns_secondary || undefined,
        },
        auth,
        dispatcher
      );

      // 10. Start VM
      const startTaskId = await startVM(host, newVmid, auth, dispatcher);
      await waitTask(host, startTaskId, auth, dispatcher, 60000);

      // 11. Update database with actual VMID
      const { error: updateErr } = await supabase
        .from("servers")
        .update({
          vmid: newVmid,
          status: "running",
        })
        .eq("id", serverId);

      if (updateErr) {
        console.error("Failed to update VMID:", updateErr);
      }

      // 12. Mark IP as used
      await supabase
        .from("public_ips")
        .update({ is_used: true, server_id: serverId })
        .eq("ip", assignedIP);

      return NextResponse.json({
        ok: true,
        serverId,
        vmid: newVmid,
        name: hostnameSafe,
        ip: assignedIP,
        node: host.node,
        status: "running",
        hourly_cost: hourlyCost,
      });

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Proxmox creation failed:", err);

      // Mark as failed in database
      await supabase
        .from("servers")
        .update({
          status: "failed",
          details: { error: err.message, timestamp: new Date().toISOString() },
        })
        .eq("id", serverId);

      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          serverId,
          details: process.env.NODE_ENV === 'development' ? serializeError(err) : undefined,
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("VM creation request error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Internal server error",
        details: process.env.NODE_ENV === 'development' ? serializeError(err) : undefined,
      },
      { status: 500 }
    );
  }
}
