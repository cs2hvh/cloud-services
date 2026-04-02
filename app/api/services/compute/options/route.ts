import { NextResponse } from "next/server";
import { createWorkerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Compute options API — returns deduplicated OS list + regions (not raw hosts).
 * 
 * The UI shows regions (e.g. "France", "India") and a single entry per OS,
 * even if multiple hosts in the same region have the same OS template.
 * 
 * The backend auto-selects the best host at VM creation time based on
 * capacity and IP availability — customers never see host IDs.
 */

interface Region {
  id: string;           // slug: "france", "india", "us-east"
  name: string;         // display: "France", "India", "US East"
  available: boolean;   // has at least one host with capacity + IPs
}

interface OSOption {
  id: string;           // canonical key for dedup (os_display_name or name)
  name: string;         // display name shown in UI
  regions: string[];    // which region slugs have this OS
}

interface ComputeOptions {
  regions: Region[];
  osOptions: OSOption[];
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
    const supabase = await createWorkerClient();

    // 1. Get active hosts with capacity info
    const { data: hosts, error: hostsErr } = await supabase
      .from("proxmox_hosts")
      .select("id, name, node, region, display_region, total_cpu_cores, total_memory_mb, total_disk_gb")
      .eq("is_active", true);

    if (hostsErr) {
      console.error("[Compute Options] Hosts query failed:", hostsErr.message);
      return NextResponse.json({ ok: false, error: "Unable to load server options. Please try again later." }, { status: 500 });
    }

    if (!hosts || hosts.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { regions: [], osOptions: [], specs: getSpecRanges() },
      });
    }

    // 2. Get all active templates across all hosts
    const { data: templates, error: templatesErr } = await supabase
      .from("proxmox_templates")
      .select("vmid, name, host_id, os_type, os_display_name")
      .eq("is_active", true)
      .order("name");

    if (templatesErr) {
      console.error("[Compute Options] Templates query failed:", templatesErr.message);
      return NextResponse.json({ ok: false, error: "Unable to load server options. Please try again later." }, { status: 500 });
    }

    // 3. Get used resources per host (sum of active servers)
    const { data: serverUsage } = await supabase
      .from("servers")
      .select("location, cpu_cores, memory_mb, disk_gb")
      .in("status", ["provisioning", "running", "stopped", "suspended"]);

    const usedByHost = new Map<string, { cpu: number; mem: number; disk: number }>();
    for (const s of serverUsage || []) {
      const loc = String(s.location);
      const prev = usedByHost.get(loc) || { cpu: 0, mem: 0, disk: 0 };
      prev.cpu += Number(s.cpu_cores || 0);
      prev.mem += Number(s.memory_mb || 0);
      prev.disk += Number(s.disk_gb || 0);
      usedByHost.set(loc, prev);
    }

    // 4. Count available IPs per host
    const hostIds = hosts.map(h => h.id);
    const { data: pools } = await supabase
      .from("public_ip_pools")
      .select("id, host_id")
      .in("host_id", hostIds)
      .or("label.is.null,label.not.ilike.*IPXO*");

    const poolIds = (pools || []).map(p => Number(p.id));
    const availableIpsByHost = new Map<string, number>();

    if (poolIds.length > 0) {
      const { data: allIps } = await supabase
        .from("public_ip_pool_ips")
        .select("pool_id, ip")
        .in("pool_id", poolIds);

      const { data: usedIps } = await supabase
        .from("servers")
        .select("ip")
        .in("status", ["provisioning", "running", "stopped", "suspended"]);

      const usedIpSet = new Set((usedIps || []).map(r => String(r.ip)));
      const poolHostMap = new Map<number, string>();
      for (const p of pools || []) {
        poolHostMap.set(Number(p.id), String(p.host_id));
      }

      for (const ip of allIps || []) {
        if (!usedIpSet.has(String(ip.ip))) {
          const hostId = poolHostMap.get(Number(ip.pool_id));
          if (hostId) {
            availableIpsByHost.set(hostId, (availableIpsByHost.get(hostId) || 0) + 1);
          }
        }
      }
    }

    // 5. Build regions — deduplicate by region slug
    const regionMap = new Map<string, Region>();
    for (const h of hosts) {
      const regionSlug = h.region || "default";
      const displayName = h.display_region || h.name;
      const used = usedByHost.get(h.id) || { cpu: 0, mem: 0, disk: 0 };
      const freeCpu = (h.total_cpu_cores || 0) - used.cpu;
      const freeMem = (h.total_memory_mb || 0) - used.mem;
      const freeDisk = (h.total_disk_gb || 0) - used.disk;
      const freeIps = availableIpsByHost.get(h.id) || 0;
      // A host contributes availability if it has resources + IPs
      const hostAvailable = freeCpu > 0 && freeMem >= 512 && freeDisk >= 10 && freeIps > 0;

      const existing = regionMap.get(regionSlug);
      if (existing) {
        // Region is available if ANY host in it is available
        if (hostAvailable) existing.available = true;
      } else {
        regionMap.set(regionSlug, {
          id: regionSlug,
          name: displayName,
          available: hostAvailable,
        });
      }
    }

    const regions = Array.from(regionMap.values());

    // 6. Deduplicate OS templates — group by os_display_name (or name)
    const osMap = new Map<string, OSOption>();
    const hostRegionMap = new Map<string, string>();
    for (const h of hosts) {
      hostRegionMap.set(h.id, h.region || "default");
    }

    for (const t of templates || []) {
      const displayName = t.os_display_name || t.name;
      const hostRegion = hostRegionMap.get(t.host_id);
      if (!hostRegion) continue;

      const existing = osMap.get(displayName);
      if (existing) {
        if (!existing.regions.includes(hostRegion)) {
          existing.regions.push(hostRegion);
        }
      } else {
        osMap.set(displayName, {
          id: displayName,
          name: displayName,
          regions: [hostRegion],
        });
      }
    }

    let osOptions = Array.from(osMap.values());

    if (osOptions.length === 0) {
      osOptions = [
        { id: "Ubuntu 24.04 LTS", name: "Ubuntu 24.04 LTS", regions: regions.map(r => r.id) },
      ];
    }

    const options: ComputeOptions = {
      regions,
      osOptions,
      specs: getSpecRanges(),
    };

    return NextResponse.json({ ok: true, data: options });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Compute options error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load compute options" },
      { status: 500 }
    );
  }
}

function getSpecRanges() {
  return {
    minCpuCores: 1,
    maxCpuCores: 32,
    minMemoryMB: 512,
    maxMemoryMB: 262144,
    minDiskGB: 10,
    maxDiskGB: 2000,
  };
}
