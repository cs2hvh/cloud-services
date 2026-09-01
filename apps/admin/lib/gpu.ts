/**
 * Types + derivations for the GPU pods admin section (RunPod resale).
 *
 * THE TRAP THIS SECTION EXISTS TO SURFACE: there are TWO GPU price books.
 * public.gpu_pricing (per model × cloud × interruptible) prices the QUOTE in
 * createPod(); billing.service_pricing ('gpu_pod', '*') prices the CHARGE in
 * charge_service_hour(). They are not connected — both read 1.000 today by
 * coincidence (GPU sells at cost, deliberate 2026-08-26 decision), and any
 * edit to one silently diverges from the other: quoted one price, charged
 * another, no error anywhere. The pricing tab renders both side by side and
 * banners on ANY disagreement. Unifying them is a billing-lane schema task —
 * the panel surfaces drift, it does not merge books.
 */

export interface GpuPod {
  id: number;
  name: string;
  owner_id: string;
  owner_email: string | null;
  gpu_catalog_id: string;
  gpu_count: number;
  cloud_type: string;
  data_center_id: string | null;
  status: string;
  interruptible: boolean;
  hourly_cost_usd: number | null;
  runpod_cost_per_hr: number | null;
  container_disk_gb: number | null;
  volume_gb: number | null;
  image_name: string | null;
  template_id: string | null;
  billing_service_id: string | null;
  billing_start: string | null;
  billing_end: string | null;
  runpod_pod_id: string | null;
  created_at: string;
}

export interface GpuVolume {
  id: number;
  name: string;
  owner_id: string;
  owner_email: string | null;
  size_gb: number;
  data_center_id: string | null;
  status: string;
  monthly_cost_usd: number | null;
  runpod_cost_per_month_usd: number | null;
  billing_service_id: string | null;
  created_at: string;
}

export interface GpuPodEvent {
  id: number;
  pod_id: number;
  event_type: string;
  message: string | null;
  created_at: string;
}

export interface GpuCatalogRow {
  id: string;
  display_name: string;
  vendor: string | null;
  memory_gb: number | null;
  tier: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface GpuTemplateRow {
  id: string;
  name: string;
  image_name: string;
  category: string | null;
  is_active: boolean;
}

export interface GpuQuotePricingRow {
  gpu_catalog_id: string;
  cloud_type: string;
  interruptible: boolean;
  markup_pct: number;
  floor_per_hour_usd: number;
}

export interface GpuInventoryRow {
  gpu_catalog_id: string;
  cloud_type: string;
  data_center_id: string;
  stock_status: string;
  on_demand_per_hr: number | null;
  spot_per_hr: number | null;
  observed_at: string;
}

export interface GpuMeter {
  id: string;
  service_type: string;
  service_id: string;
  user_id: string;
  plan_key: string | null;
  status: string;
  units: number | null;
  started_at: string;
  ended_at: string | null;
}

/** One operational finding for the Unbillable tab. */
export interface GpuFinding {
  severity: "critical" | "warning";
  title: string;
  detail: string;
  action: string;
}

const LIVE_POD_STATUSES = new Set(["running", "stopped", "provisioning"]);

/**
 * The drift class that made deleted buckets bill for months, applied to GPU:
 * resources that exist but cannot bill, and meters that bill for nothing.
 */
export function deriveGpuFindings(input: {
  pods: GpuPod[];
  volumes: GpuVolume[];
  meters: GpuMeter[];
  ownersWithWallet: Set<string>;
}): GpuFinding[] {
  const findings: GpuFinding[] = [];
  // Keyed by type AND service id: a pod opens TWO meters (gpu_pod +
  // gpu_pod_storage), so presence of one is not "billed" — compute metered
  // with storage unmetered is a real, silent half-billed state. At most one
  // open meter per (type, service) exists by unique index; no check needed.
  const openMeter = new Set(
    input.meters
      .filter((m) => m.ended_at === null)
      .map((m) => `${m.service_type}:${m.service_id}`),
  );
  const liveServiceIds = new Set<string>();

  for (const pod of input.pods) {
    if (!LIVE_POD_STATUSES.has(pod.status)) continue;
    if (pod.billing_service_id) liveServiceIds.add(pod.billing_service_id);

    const compute = pod.billing_service_id
      ? openMeter.has(`gpu_pod:${pod.billing_service_id}`)
      : false;
    const storage = pod.billing_service_id
      ? openMeter.has(`gpu_pod_storage:${pod.billing_service_id}`)
      : false;

    if (!compute && !storage) {
      findings.push({
        severity: "critical",
        title: `Pod "${pod.name}" (${pod.owner_email ?? pod.owner_id}) has no open meter`,
        detail: `Status ${pod.status}, ${pod.gpu_count}× ${pod.gpu_catalog_id} — running unbilled since ${pod.billing_start ?? pod.created_at}.`,
        action: "Open both meters or stop the pod; every unmetered hour is free.",
      });
    } else if (!compute || !storage) {
      const missing = compute ? "gpu_pod_storage" : "gpu_pod";
      const present = compute ? "gpu_pod" : "gpu_pod_storage";
      findings.push({
        severity: "critical",
        title: `Pod "${pod.name}" (${pod.owner_email ?? pod.owner_id}) is HALF-billed`,
        detail: `The ${present} meter is open but ${missing} is not — a pod opens two meters, and this state bills one and silently gives the other away.`,
        action: `Open the ${missing} meter (or close both and stop the pod).`,
      });
    }
    if (!input.ownersWithWallet.has(pod.owner_id)) {
      findings.push({
        severity: "critical",
        title: `Pod "${pod.name}" owner ${pod.owner_email ?? pod.owner_id} has no wallet row`,
        detail:
          "billing.user_credits has no row for this user, so every hourly charge returns 'insufficient' and always will.",
        action: "Create the wallet row (or suspend the resource) — nothing collects until then.",
      });
    }
  }

  for (const vol of input.volumes) {
    if (vol.status !== "available" || !vol.owner_id) continue;
    if (vol.billing_service_id) liveServiceIds.add(vol.billing_service_id);

    if (!vol.billing_service_id || !openMeter.has(`gpu_volume:${vol.billing_service_id}`)) {
      findings.push({
        severity: "critical",
        title: `Volume "${vol.name}" (${vol.owner_email ?? vol.owner_id}, ${vol.size_gb} GB) has no open meter`,
        detail: `Available since ${vol.created_at.slice(0, 10)} — storage costs accrue upstream with nothing billed downstream.`,
        action: "Open a gpu_volume meter or delete the volume.",
      });
    }
    if (!input.ownersWithWallet.has(vol.owner_id)) {
      findings.push({
        severity: "critical",
        title: `Volume "${vol.name}" owner ${vol.owner_email ?? vol.owner_id} has no wallet row`,
        detail: `${vol.size_gb} GB at $${(Number(vol.monthly_cost_usd) || 0).toFixed(2)}/month — charges return 'insufficient' forever.`,
        action: "Create the wallet row or reclaim the volume.",
      });
    }
  }

  for (const m of input.meters) {
    if (m.ended_at !== null) continue;
    if (!liveServiceIds.has(m.service_id)) {
      findings.push({
        severity: "warning",
        title: `Open ${m.service_type} meter with no live resource`,
        detail: `Meter ${m.id.slice(0, 8)}… (user ${m.user_id.slice(0, 8)}…) open since ${m.started_at.slice(0, 10)} — this is the shape that billed deleted buckets for months.`,
        action: "Close the meter unless a resource legitimately owns it.",
      });
    }
  }

  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
