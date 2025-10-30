import { NextResponse } from "next/server";
import { createWorkerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Location {
  id: string;
  name: string;
  node: string;
}

interface OSTemplate {
  id: string;
  name: string;
  hostId: string;
  vmid?: number;  // Include VMID for direct cloning
}

interface ComputeOptions {
  locations: Location[];
  osTemplates: OSTemplate[];
  specs: {
    minCpuCores: number;
    maxCpuCores: number;
    minMemoryMB: number;
    maxMemoryMB: number;
    minDiskGB: number;
    maxDiskGB: number;
  };
}

export async function GET() {
  try {
    // Use worker client to bypass RLS for admin tables
    const supabase = await createWorkerClient();

    // Get active Proxmox hosts (locations)
    const { data: hosts, error: hostsErr } = await supabase
      .from("proxmox_hosts")
      .select("id, name, node")
      .eq("is_active", true);

    if (hostsErr) {
      return NextResponse.json(
        { ok: false, error: hostsErr.message },
        { status: 500 }
      );
    }

    const locations = (hosts || []).map((h) => ({
      id: h.id,
      name: h.name,
      node: h.node,
    })) as Location[];

    // Get available OS templates
    const { data: templates, error: templatesErr } = await supabase
      .from("proxmox_templates")
      .select("vmid, name, host_id")
      .eq("is_active", true)
      .order("name");

    if (templatesErr) {
      return NextResponse.json(
        { ok: false, error: templatesErr.message },
        { status: 500 }
      );
    }

    let osTemplates = (templates || []).map((t) => ({
      id: t.name,
      name: t.name,
      hostId: t.host_id,
      vmid: t.vmid,  // Include VMID
    })) as OSTemplate[];

    // Fallback to default OS if no templates found
    if (osTemplates.length === 0) {
      osTemplates = [
        { id: "Ubuntu 24.04 LTS", name: "Ubuntu 24.04 LTS", hostId: "", vmid: undefined },
        { id: "Debian 12", name: "Debian 12", hostId: "", vmid: undefined },
      ];
    }

    const options: ComputeOptions = {
      locations,
      osTemplates,
      specs: {
        minCpuCores: 1,
        maxCpuCores: 64,
        minMemoryMB: 512,
        maxMemoryMB: 262144, // 256 GB
        minDiskGB: 10,
        maxDiskGB: 10000,
      },
    };

    return NextResponse.json({
      ok: true,
      data: options,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Compute options error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
