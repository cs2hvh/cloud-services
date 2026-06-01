import { createWorkerClient } from "@/lib/supabase/server";
import {
  computeHostAvailability,
  canFitPlan,
  planAllowedOnHost,
  DEFAULT_SHARED_OVERSUBSCRIPTION,
  type HostAvailability,
} from "@/lib/pricing/instance-plans";
import type { CatalogPlan } from "@/lib/pricing/plan-catalog";

const ACTIVE_STATES = ["provisioning", "running", "stopped", "suspended"];

/**
 * Compute what a host can still allocate, EXCLUDING one server's current
 * footprint. Used by resize: the server stays on its host, so the target
 * plan must fit in (host total − every other VM), since the new plan fully
 * replaces this VM's current allocation. Also returns the host region slug
 * (for the location pricing multiplier) — not exposed to customers.
 */
export async function getHostAvailabilityExcludingServer(params: {
  hostId: string;
  excludeServerId: number;
}): Promise<{ availability: HostAvailability; hostRegion: string | null } | null> {
  const supabase = await createWorkerClient();

  const { data: host } = await supabase
    .from("proxmox_hosts")
    .select(
      "id, region, total_cpu_cores, total_memory_mb, total_disk_gb, shared_oversubscription_ratio"
    )
    .eq("id", params.hostId)
    .maybeSingle();
  if (!host) return null;

  const { data: usageRows } = await supabase
    .from("servers")
    .select("id, cpu_cores, memory_mb, disk_gb, tier")
    .eq("location", params.hostId)
    .in("status", ACTIVE_STATES);

  let dedicatedVcpuUsed = 0;
  let sharedVcpuUsed = 0;
  let memoryMBUsed = 0;
  let diskGBUsed = 0;
  for (const s of usageRows || []) {
    if (Number(s.id) === params.excludeServerId) continue; // exclude self
    const vcpu = Number(s.cpu_cores || 0);
    if (s.tier === "dedicated") dedicatedVcpuUsed += vcpu;
    else sharedVcpuUsed += vcpu;
    memoryMBUsed += Number(s.memory_mb || 0);
    diskGBUsed += Number(s.disk_gb || 0);
  }

  const availability = computeHostAvailability({
    totalCpuCores: host.total_cpu_cores || 0,
    totalMemoryMB: host.total_memory_mb || 0,
    totalDiskGB: host.total_disk_gb || 0,
    sharedRatio: host.shared_oversubscription_ratio || DEFAULT_SHARED_OVERSUBSCRIPTION,
    usage: { dedicatedVcpuUsed, sharedVcpuUsed, memoryMBUsed, diskGBUsed },
  });

  return { availability, hostRegion: host.region ?? null };
}

/**
 * Whether a server on `hostId` (currently using `currentDiskGb`) can be
 * resized to `plan`, given host availability that already excludes this
 * server. Returns a customer-safe reason when it can't.
 */
export function planFitsResize(params: {
  plan: CatalogPlan;
  hostId: string;
  availability: HostAvailability;
  currentDiskGb: number;
}): { fits: boolean; reason?: string } {
  const { plan, hostId, availability, currentDiskGb } = params;
  if (!planAllowedOnHost(plan, hostId)) {
    return { fits: false, reason: "Not offered in this location" };
  }
  if (plan.diskGB < currentDiskGb) {
    return { fits: false, reason: "Disk can't be shrunk" };
  }
  if (!canFitPlan(plan, availability)) {
    return { fits: false, reason: "Not enough capacity in this location" };
  }
  return { fits: true };
}
