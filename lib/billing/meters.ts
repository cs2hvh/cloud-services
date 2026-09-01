/**
 * Billing v2 meters — open one when a resource starts existing, close it when
 * it stops.
 *
 * WHAT A METER IS, AND IS NOT
 *
 * A meter records THAT something is running and WHO PAYS. It deliberately does
 * not record what that costs. The price lives in billing.service_pricing and
 * is resolved per hour at charge time.
 *
 * That split is the fix for the defect that produced this rebuild. The old
 * billing.active_* rows froze an hourly_rate at provision time, so a rate that
 * was wrong when written stayed wrong for months with nothing pointing back at
 * the decision — one meter charged $120/hr, and two charged $60/hr, because a
 * MONTHLY figure had been written into a column meaning DOLLARS PER HOUR.
 * Under this model correcting a price corrects the next charge, everywhere, and
 * no meter row has to be found and edited.
 *
 * THE OTHER RULE: A METER MUST NOT OUTLIVE ITS RESOURCE
 *
 * At audit time two of three live objectspace meters were billing deleted
 * buckets — one of them a paying customer's, who was charged $4,629.91 for an
 * empty bucket that no longer existed. `closeMeter` must therefore be called by
 * the SAME code path that tears the resource down, not by a later sweep. The
 * sweep's liveness check is a backstop for when this is forgotten, not the
 * mechanism.
 */

import { createServiceClient } from "@/lib/supabase/server";

/** Service types that have a price in billing.service_pricing. */
export type MeteredService =
  | "compute"
  | "gpu_pod"
  | "gpu_pod_storage"
  | "gpu_volume"
  | "objectspace"
  | "spectrum"
  | "database"
  | "kubernetes"
  | "platform_apps"
  | "custom_image"
  | "inference_vector";

export interface OpenMeterParams {
  serviceType: MeteredService;
  /**
   * The uuid the billing spine keys on. For bigint-keyed resources (servers,
   * gpu_pods, gpu_network_volumes) this is their `billing_service_id`, NOT
   * their `id`.
   */
  serviceId: string;
  /** Who pays. Resolved by the caller — every service does it differently. */
  userId: string;
  /**
   * Selects the price row: an instance_plans slug, a platform-app size, or '*'
   * where the service has a single price.
   */
  planKey?: string;
  /** Node count, GPU count — a multiplier on the hourly rate. Not storage GB. */
  units?: number;
}

/**
 * Strip a provider prefix from a plan slug.
 *
 * `servers.plan_slug` is written at create time as `linode:g6-standard-1`,
 * while billing.service_pricing is keyed by the bare instance_plans slug
 * (`a-1`, `s-3`). Without this, every newly provisioned Linode would open a
 * meter whose plan_key matches no price, and the sweep would report 'no-price'
 * forever — a silent billing stop for exactly the servers that are newest.
 *
 * Existing rows carry both shapes (`s-3` and NULL are both present in prod
 * today), so this normalises rather than assuming either.
 */
export function normalizePlanKey(planSlug: string | null | undefined): string {
  if (!planSlug) return "*";
  const idx = planSlug.indexOf(":");
  const bare = idx === -1 ? planSlug : planSlug.slice(idx + 1);
  return bare.trim() || "*";
}

/**
 * Open a meter. Idempotent: a partial unique index allows only one open meter
 * per (service_type, service_id), so a retried provision does not create a
 * second meter and start double-billing.
 */
export async function openMeter(params: OpenMeterParams): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .schema("billing")
    .from("service_meters")
    .insert({
      service_type: params.serviceType,
      service_id: params.serviceId,
      user_id: params.userId,
      plan_key: params.planKey ?? "*",
      units: params.units ?? 1,
      status: "active",
    });

  // 23505 is the partial unique index doing its job: a meter is already open
  // for this resource. That is the desired end state, so it is not an error.
  if (error && error.code !== "23505") {
    throw new Error(`[billing] could not open ${params.serviceType} meter: ${error.message}`);
  }
}

/**
 * Close a meter. Idempotent — closing an already-closed meter is a no-op.
 *
 * Call this from the teardown path itself. A meter left open bills for a
 * resource that no longer exists, which is exactly the defect that charged a
 * customer $4,629.91 for a deleted bucket.
 */
export async function closeMeter(
  serviceType: MeteredService,
  serviceId: string
): Promise<void> {
  const supabase = await createServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("billing")
    .from("service_meters")
    .update({ status: "closed", ended_at: now, updated_at: now })
    .eq("service_type", serviceType)
    .eq("service_id", serviceId)
    .is("ended_at", null);

  if (error) {
    throw new Error(`[billing] could not close ${serviceType} meter: ${error.message}`);
  }
}

/**
 * Open the two meters a GPU pod needs, in one call.
 *
 * A pod is two billable things on different rules: the GPU, released upstream
 * the moment the pod stops, and the local disk, which persists and which
 * RunPod keeps charging us for. Splitting them is what lets a stopped pod be
 * billed for storage only — matching RunPod's own model — and what lets an
 * invoice show the two as separate lines.
 */
export async function openGpuPodMeters(params: {
  billingServiceId: string;
  userId: string;
  gpuCount: number;
}): Promise<void> {
  await openMeter({
    serviceType: "gpu_pod",
    serviceId: params.billingServiceId,
    userId: params.userId,
    units: Math.max(1, params.gpuCount),
  });
  await openMeter({
    serviceType: "gpu_pod_storage",
    serviceId: params.billingServiceId,
    userId: params.userId,
  });
}

/** Close both of a pod's meters. Call on terminate, never on stop. */
export async function closeGpuPodMeters(billingServiceId: string): Promise<void> {
  await closeMeter("gpu_pod", billingServiceId);
  await closeMeter("gpu_pod_storage", billingServiceId);
}
