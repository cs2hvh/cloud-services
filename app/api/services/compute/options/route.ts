import { NextResponse } from "next/server";
import { createWorkerClient } from "@/lib/supabase/server";
import { getActivePlans, type CatalogPlan } from "@/lib/pricing/plan-catalog";
import {
  DEFAULT_SHARED_OVERSUBSCRIPTION,
  canFitPlan,
  computeHostAvailability,
  planAllowedInRegion,
  planAllowedOnHost,
} from "@/lib/pricing/instance-plans";

export const dynamic = "force-dynamic";

/**
 * Compute options API — returns deduplicated OS list + regions +
 * instance-plan catalog with per-region availability.
 *
 * The UI shows regions (e.g. "France", "India") and a single entry
 * per OS even if multiple hosts in the same region have the same OS
 * template. Plan availability per region is computed by checking
 * whether any host in the region has enough free capacity to fit
 * the plan (tier-aware: dedicated plans demand 1:1 physical cores,
 * shared plans use the oversubscribed pool).
 *
 * The backend auto-selects the best host at VM creation time based
 * on capacity and IP availability — customers never see host IDs.
 */

interface Region {
  id: string;
  name: string;
  available: boolean;
}

interface OSOption {
  id: string;
  name: string;
  regions: string[];
}

interface PlanWire {
  slug: string;
  name: string;
  tier: "shared" | "dedicated";
  vcpu: number;
  memoryMB: number;
  diskGB: number;
  hourlyUSD: number;
  monthlyUSD: number;
  tagline?: string;
  /** If set, plan is only offered in these region slugs. */
  allowedRegions?: string[];
  /** If set, plan only provisions on these specific hosts. */
  allowedHostIds?: string[];
}

interface ComputeOptions {
  regions: Region[];
  osOptions: OSOption[];
  plans: PlanWire[];
  /** Map: regionSlug → planSlug → true if any host in that region has capacity for the plan. */
  planAvailability: Record<string, Record<string, boolean>>;
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
      .select("id, name, node, region, display_region, total_cpu_cores, total_memory_mb, total_disk_gb, shared_oversubscription_ratio")
      .eq("is_active", true);

    if (hostsErr) {
      console.error("[Compute Options] Hosts query failed:", hostsErr.message);
      return NextResponse.json({ ok: false, error: "Unable to load server options. Please try again later." }, { status: 500 });
    }

    if (!hosts || hosts.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { regions: [], osOptions: [], plans: [], planAvailability: {}, specs: getSpecRanges() },
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

    // 3. Get used resources per host (sum of active servers), split by tier
    const { data: serverUsage } = await supabase
      .from("servers")
      .select("location, cpu_cores, memory_mb, disk_gb, tier")
      .in("status", ["provisioning", "running", "stopped", "suspended"]);

    type Usage = {
      cpu: number; mem: number; disk: number;
      dedicatedVcpu: number; sharedVcpu: number;
    };
    const usedByHost = new Map<string, Usage>();
    for (const s of serverUsage || []) {
      const loc = String(s.location);
      const prev: Usage = usedByHost.get(loc) || {
        cpu: 0, mem: 0, disk: 0, dedicatedVcpu: 0, sharedVcpu: 0,
      };
      const vcpu = Number(s.cpu_cores || 0);
      prev.cpu += vcpu;
      prev.mem += Number(s.memory_mb || 0);
      prev.disk += Number(s.disk_gb || 0);
      if (s.tier === "dedicated") prev.dedicatedVcpu += vcpu;
      else prev.sharedVcpu += vcpu;
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
      const used = usedByHost.get(h.id) || {
        cpu: 0, mem: 0, disk: 0, dedicatedVcpu: 0, sharedVcpu: 0,
      };
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

    // 7. Plan catalog + per-region availability.
    // For each (plan, region) pair: true iff at least one host in
    // that region has enough free CPU/RAM/disk to fit the plan AND
    // has at least one IP available.
    const activePlans = await getActivePlans(supabase);
    const planAvailability: Record<string, Record<string, boolean>> = {};
    for (const region of regions) {
      planAvailability[region.id] = {};
      for (const plan of activePlans) planAvailability[region.id][plan.slug] = false;
    }

    for (const h of hosts) {
      const regionSlug = h.region || "default";
      const used = usedByHost.get(h.id) || {
        cpu: 0, mem: 0, disk: 0, dedicatedVcpu: 0, sharedVcpu: 0,
      };
      const freeIps = availableIpsByHost.get(h.id) || 0;
      if (freeIps <= 0) continue; // no point checking — VM-create needs an IP

      const avail = computeHostAvailability({
        totalCpuCores: h.total_cpu_cores || 0,
        totalMemoryMB: h.total_memory_mb || 0,
        totalDiskGB: h.total_disk_gb || 0,
        sharedRatio: h.shared_oversubscription_ratio || DEFAULT_SHARED_OVERSUBSCRIPTION,
        usage: {
          dedicatedVcpuUsed: used.dedicatedVcpu,
          sharedVcpuUsed: used.sharedVcpu,
          memoryMBUsed: used.mem,
          diskGBUsed: used.disk,
        },
      });

      for (const plan of activePlans) {
        // Whitelist filters take precedence over capacity check.
        if (!planAllowedInRegion(plan, regionSlug)) continue;
        if (!planAllowedOnHost(plan, h.id)) continue;
        if (canFitPlan(plan, avail)) {
          if (!planAvailability[regionSlug]) planAvailability[regionSlug] = {};
          planAvailability[regionSlug][plan.slug] = true;
        }
      }
    }

    // Hide plans from the customer catalog if they're whitelisted to
    // a set of regions that don't intersect with what we have. A plan
    // whose whitelist matches at least one platform region is shown
    // (with sold-out states elsewhere based on capacity).
    const platformRegionSlugs = new Set(regions.map((r) => r.id));
    const plansWire: PlanWire[] = activePlans
        .filter((p) => {
          if (!p.allowedRegions || p.allowedRegions.length === 0) return true;
          return p.allowedRegions.some((r) => platformRegionSlugs.has(r));
        })
        .map(planToWire);

    const options: ComputeOptions = {
      regions,
      osOptions,
      plans: plansWire,
      planAvailability,
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

function planToWire(p: CatalogPlan): PlanWire {
  return {
    slug: p.slug,
    name: p.name,
    tier: p.tier,
    vcpu: p.vcpu,
    memoryMB: p.memoryMB,
    diskGB: p.diskGB,
    hourlyUSD: p.defaultHourlyUSD,
    monthlyUSD: p.defaultMonthlyUSD,
    tagline: p.tagline,
    allowedRegions: p.allowedRegions && p.allowedRegions.length > 0 ? p.allowedRegions : undefined,
    allowedHostIds: p.allowedHostIds && p.allowedHostIds.length > 0 ? p.allowedHostIds : undefined,
  };
}
