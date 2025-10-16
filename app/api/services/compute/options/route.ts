import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Location {
  id: string;
  name: string;
  node: string;
}

interface OSTemplate {
  id: number;
  name: string;
  hostId: string;
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
    const supabase = await createClient();

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

    const osTemplates = (templates || []).map((t) => ({
      id: t.vmid,
      name: t.name,
      hostId: t.host_id,
    })) as OSTemplate[];

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
