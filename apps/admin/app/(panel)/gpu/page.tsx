import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getGpuDeployEnabled } from "@/lib/admin/platform-settings";
import {
  auditCustomerRead,
  requireCustomerDataAccess,
} from "@admin/lib/customer-data";
import { PageHeader } from "@admin/components/page-header";
import { Callout } from "@admin/components/deploy/bits";
import { GpuView } from "@admin/components/gpu/gpu-view";
import {
  deriveGpuFindings,
  type GpuCatalogRow,
  type GpuInventoryRow,
  type GpuMeter,
  type GpuPod,
  type GpuPodEvent,
  type GpuQuotePricingRow,
  type GpuTemplateRow,
  type GpuVolume,
} from "@admin/lib/gpu";

export const dynamic = "force-dynamic";

/**
 * GPU pods (RunPod resale) — pods, unbillable drift, inventory
 * (gpu_inventory_latest ONLY; the snapshots table once hit a million rows
 * and took the deploy page down), the dual price books, volumes, catalog.
 * Customer data throughout, so the customer-data gate + per-view audit.
 */
export default async function GpuAdminPage() {
  const admin = await requireCustomerDataAccess();
  if (!admin.ok) {
    notFound();
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");

  const [
    podsRes,
    volumesRes,
    eventsRes,
    catalogRes,
    templatesRes,
    pricingRes,
    inventoryRes,
    metersRes,
    chargeRes,
    deployEnabled,
  ] = await Promise.all([
    supabase
      .from("gpu_pods")
      .select(
        "id, name, owner_id, owner_email, gpu_catalog_id, gpu_count, cloud_type, data_center_id, status, interruptible, hourly_cost_usd, runpod_cost_per_hr, container_disk_gb, volume_gb, image_name, template_id, billing_service_id, billing_start, billing_end, runpod_pod_id, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("gpu_network_volumes")
      .select(
        "id, name, owner_id, owner_email, size_gb, data_center_id, status, monthly_cost_usd, runpod_cost_per_month_usd, billing_service_id, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("gpu_pod_events")
      .select("id, pod_id, event_type, message, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("gpu_catalog").select("id, display_name, vendor, memory_gb, tier, is_active, sort_order").order("sort_order"),
    supabase.from("gpu_templates").select("id, name, image_name, category, is_active").order("sort_order"),
    supabase
      .from("gpu_pricing")
      .select("gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd")
      .order("gpu_catalog_id"),
    supabase.from("gpu_inventory_latest").select("*").order("gpu_catalog_id"),
    billing
      .from("service_meters")
      .select("id, service_type, service_id, user_id, plan_key, status, units, started_at, ended_at")
      .in("service_type", ["gpu_pod", "gpu_pod_storage", "gpu_volume"]),
    billing
      .from("service_pricing")
      .select("amount, unit")
      .eq("service_type", "gpu_pod")
      .eq("plan_key", "*")
      .is("effective_to", null)
      .limit(1),
    getGpuDeployEnabled(),
  ]);

  const firstError =
    podsRes.error ?? volumesRes.error ?? catalogRes.error ?? inventoryRes.error ?? metersRes.error;
  if (firstError) {
    return (
      <div>
        <PageHeader title="GPU Pods" />
        <Callout tone="critical">Could not read GPU data: {firstError.message}</Callout>
      </div>
    );
  }

  const pods = (podsRes.data ?? []) as GpuPod[];
  const volumes = (volumesRes.data ?? []) as GpuVolume[];
  const meters = (metersRes.data ?? []) as GpuMeter[];

  // Wallet presence per owner — the ved case: resources whose owner has no
  // billing.user_credits row can never be charged.
  const ownerIds = [
    ...new Set([...pods.map((p) => p.owner_id), ...volumes.map((v) => v.owner_id)].filter(Boolean)),
  ];
  const { data: walletRows } = ownerIds.length
    ? await billing.from("user_credits").select("user_id").in("user_id", ownerIds)
    : { data: [] };
  const walletOwners = (walletRows ?? []).map((w) => w.user_id as string);

  const findings = deriveGpuFindings({
    pods,
    volumes,
    meters,
    ownersWithWallet: new Set(walletOwners),
  });

  const chargeMarkup = chargeRes.data?.[0]
    ? Number(chargeRes.data[0].amount)
    : null;

  await auditCustomerRead({
    admin,
    serviceType: "gpu",
    subjectId: "gpu:overview",
    subjectName: "GPU pods overview",
    viewed: `pods (${pods.length}), volumes (${volumes.length}), unbillable findings (${findings.length})`,
  });

  return (
    <div>
      <PageHeader
        title="GPU Pods"
        description="RunPod resale — fleet, billing drift, inventory, the two price books, and catalog. Page views and every action are audited."
      />
      <GpuView
        pods={pods}
        volumes={volumes}
        events={(eventsRes.data ?? []) as GpuPodEvent[]}
        catalog={(catalogRes.data ?? []) as GpuCatalogRow[]}
        templates={(templatesRes.data ?? []) as GpuTemplateRow[]}
        quotePricing={(pricingRes.data ?? []) as GpuQuotePricingRow[]}
        chargeMarkup={chargeMarkup}
        inventory={(inventoryRes.data ?? []) as GpuInventoryRow[]}
        meters={meters}
        findings={findings}
        walletOwners={walletOwners}
        deployEnabled={deployEnabled}
      />
    </div>
  );
}
