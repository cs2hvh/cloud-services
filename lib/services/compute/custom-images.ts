import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
import { BillingCredits } from "@/lib/billing/credits";
import { getRatePerGbForCustomImage } from "@/config/pricing";
import { closeActiveBilling } from "@/config/billing-flow";
import {
  proxmoxAuth,
  getDispatcher,
  buildCustomImageTemplate,
  exportVmDiskToUrl,
  deleteVM,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import {
  snapshotKey,
  presignSnapshotUpload,
  presignSnapshotDownload,
  deleteSnapshotObject,
} from "@/lib/services/compute/image-storage";

export interface CustomImageRow {
  id: string;
  owner_id: string;
  name: string;
  os_family: string;
  default_user: string;
  source_type: string;
  source_ref: string | null;
  cloud_init: boolean;
  status: string;
  size_gb: number;
  billing_service_id: string;
}

const IMAGE_COLS =
  "id, owner_id, name, os_family, default_user, source_type, source_ref, cloud_init, status, size_gb, billing_service_id";

/**
 * Resolve a customer's AVAILABLE custom image by display name. Used by the
 * deploy flow to detect that a chosen "OS" is actually one of the user's custom
 * images (and to verify ownership before provisioning from it).
 */
export async function findAvailableCustomImageByName(
  supabase: SupabaseClient,
  ownerId: string,
  name: string
): Promise<CustomImageRow | null> {
  const { data } = await supabase
    .from("custom_images")
    .select(IMAGE_COLS)
    .eq("owner_id", ownerId)
    .eq("status", "available")
    .eq("name", name)
    .maybeSingle();
  return (data as CustomImageRow) ?? null;
}

/** List a customer's available custom images (for the deploy OS picker). */
export async function listAvailableCustomImages(
  supabase: SupabaseClient,
  ownerId: string
): Promise<CustomImageRow[]> {
  const { data } = await supabase
    .from("custom_images")
    .select(IMAGE_COLS)
    .eq("owner_id", ownerId)
    .eq("status", "available")
    .order("created_at", { ascending: false });
  return (data as CustomImageRow[]) ?? [];
}

async function existingTemplateVmid(
  supabase: SupabaseClient,
  customImageId: string,
  hostId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("proxmox_templates")
    .select("vmid")
    .eq("custom_image_id", customImageId)
    .eq("host_id", hostId)
    .eq("is_active", true)
    .maybeSingle();
  return data ? Number(data.vmid) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * LAZY per‑host build: ensure `image` exists as an active Proxmox template on
 * `hostId`, building it on first use, and return the template vmid to clone.
 *
 * - Fast path: a template row already exists → return its vmid.
 * - Build path: acquire a per‑(image,host) Redis lock, download + import +
 *   templatize via `buildCustomImageTemplate`, register the proxmox_templates
 *   row, and (on first ever build) record the measured image size for billing.
 * - Contended path: another deploy is already building the same image on the
 *   same host → poll for the template row to appear.
 *
 * This can take several minutes on first use in a region; callers run it inside
 * the provisioning background task and surface progress to the customer.
 */
export async function ensureCustomTemplateOnHost(params: {
  image: CustomImageRow;
  hostId: string;
}): Promise<number> {
  const supabase = await createServiceClient();
  const { image, hostId } = params;

  // Fast path.
  const existing = await existingTemplateVmid(supabase, image.id, hostId);
  if (existing) return existing;

  if (!image.source_ref) {
    throw new Error("Custom image has no source to build from");
  }

  const lockKey = `customimg:build:${image.id}:${hostId}`;
  const locked = await redis.set(lockKey, `build:${Date.now()}`, { nx: true, ex: 3600 });

  if (!locked) {
    // Someone else is building it — poll for the template row (up to ~30 min).
    for (let i = 0; i < 180; i++) {
      await sleep(10_000);
      const vmid = await existingTemplateVmid(supabase, image.id, hostId);
      if (vmid) return vmid;
    }
    throw new Error("Timed out waiting for the custom image to finish building");
  }

  try {
    const { data: host } = await supabase
      .from("proxmox_hosts")
      .select(
        "id, name, host_url, allow_insecure_tls, node, storage, bridge, token_id, token_secret, username, password"
      )
      .eq("id", hostId)
      .maybeSingle();
    if (!host) throw new Error("Host not found");

    const cfg = host as unknown as ProxmoxHost;
    const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);
    const auth = await proxmoxAuth(cfg, dispatcher);

    // Snapshots store an R2 object key in source_ref → sign a fresh GET URL so
    // this host can pull it. URL imports store the https URL directly.
    const sourceUrl =
      image.source_type === "snapshot"
        ? await presignSnapshotDownload(image.source_ref)
        : image.source_ref;

    const { vmid, sizeBytes } = await buildCustomImageTemplate(
      cfg,
      {
        sourceUrl,
        name: image.name,
        osType: image.os_family.toLowerCase().includes("windows") ? "win11" : "l26",
      },
      auth,
      dispatcher
    );

    // Register the template so future deploys to this host are instant and the
    // normal clone/host-selection path can find it.
    await supabase.from("proxmox_templates").insert({
      host_id: hostId,
      vmid,
      name: image.name,
      os_type: image.os_family,
      os_display_name: image.name,
      is_active: true,
      owner_id: image.owner_id,
      custom_image_id: image.id,
    });

    // On first materialization, settle the billed size and start the storage
    // meter. The meter is keyed per image (UNIQUE service_id), so it's billed
    // ONCE regardless of how many hosts the image is later replicated to.
    const measuredGb =
      sizeBytes > 0 ? Math.max(0.01, Math.round((sizeBytes / 1024 ** 3) * 100) / 100) : 0;
    const billedGb = image.size_gb && image.size_gb > 0 ? image.size_gb : measuredGb;
    if ((!image.size_gb || image.size_gb <= 0) && measuredGb > 0) {
      await supabase.from("custom_images").update({ size_gb: measuredGb }).eq("id", image.id);
    }
    if (billedGb > 0) {
      const { data: meter } = await supabase
        .schema("billing")
        .from("active_custom_image")
        .select("id")
        .eq("service_id", image.billing_service_id)
        .maybeSingle();
      if (!meter) {
        const gbRate = await getRatePerGbForCustomImage();
        const hourlyRate = Math.max(0.0001, (billedGb * gbRate) / 730);
        await BillingCredits.addActiveCustomImage({
          userId: image.owner_id,
          serviceId: image.billing_service_id,
          hourlyRate,
        }).catch((e) => console.error("[custom-image] meter register failed:", e));
      }
    }

    return vmid;
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

/**
 * Delete a custom image: destroy its per‑host template VMs, remove the template
 * rows, drop the storage billing meter, and delete the catalog row. Running VMs
 * already cloned from it are independent and unaffected. Owner‑verified.
 */
export async function deleteCustomImage(params: {
  imageId: string;
  ownerId: string;
}): Promise<void> {
  const supabase = await createServiceClient();

  const { data: image } = await supabase
    .from("custom_images")
    .select("id, owner_id, billing_service_id, source_type, source_ref")
    .eq("id", params.imageId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();
  if (!image) throw new Error("Image not found");

  await supabase.from("custom_images").update({ status: "deleting" }).eq("id", params.imageId);

  // Destroy the template VM on every host it was built on.
  const { data: tmpls } = await supabase
    .from("proxmox_templates")
    .select("id, host_id, vmid")
    .eq("custom_image_id", params.imageId);

  for (const t of tmpls || []) {
    try {
      const { data: host } = await supabase
        .from("proxmox_hosts")
        .select(
          "id, host_url, allow_insecure_tls, node, storage, bridge, token_id, token_secret, username, password"
        )
        .eq("id", t.host_id)
        .maybeSingle();
      if (host) {
        const cfg = host as unknown as ProxmoxHost;
        const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);
        const auth = await proxmoxAuth(cfg, dispatcher);
        await deleteVM(cfg, Number(t.vmid), auth, dispatcher);
      }
    } catch (e) {
      console.error("[custom-image delete] template VM destroy failed:", e);
    }
    await supabase.from("proxmox_templates").delete().eq("id", t.id);
  }

  // Remove the staged R2 object for snapshots (best effort).
  if (image.source_type === "snapshot" && image.source_ref) {
    try {
      await deleteSnapshotObject(image.source_ref);
    } catch (e) {
      console.error("[custom-image delete] R2 object cleanup failed:", e);
    }
  }

  // Charge the final prorated period then close the meter.
  try {
    await closeActiveBilling({
      userId: image.owner_id,
      serviceId: image.billing_service_id,
      serviceType: "custom_image",
      closeActive: () => BillingCredits.closeActiveCustomImage({ serviceId: image.billing_service_id }),
    });
  } catch (e) {
    console.error("[custom-image delete] final billing close failed:", e);
  }

  await supabase.from("custom_images").delete().eq("id", params.imageId);
}

/**
 * Background: export a (stopped) server's disk to R2 and finalize the snapshot
 * image. Sets source_ref to the R2 key, records size, marks it available, and
 * starts the storage meter. On failure the image is marked `failed`.
 */
export async function runSnapshotExport(params: {
  imageId: string;
  serverId: number;
}): Promise<void> {
  const supabase = await createServiceClient();

  const { data: image } = await supabase
    .from("custom_images")
    .select("id, owner_id, billing_service_id")
    .eq("id", params.imageId)
    .maybeSingle();
  if (!image) return;

  try {
    const { data: srv } = await supabase
      .from("servers")
      .select("vmid, location")
      .eq("id", params.serverId)
      .maybeSingle();
    if (!srv?.vmid || !srv.location) throw new Error("Server not found");

    const { data: host } = await supabase
      .from("proxmox_hosts")
      .select(
        "id, host_url, allow_insecure_tls, node, storage, bridge, token_id, token_secret, username, password"
      )
      .eq("id", srv.location)
      .maybeSingle();
    if (!host) throw new Error("Host not found");

    const cfg = host as unknown as ProxmoxHost;
    const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);
    const auth = await proxmoxAuth(cfg, dispatcher);

    const key = snapshotKey(image.owner_id, image.id);
    const putUrl = await presignSnapshotUpload(key);
    const { sizeBytes } = await exportVmDiskToUrl(cfg, Number(srv.vmid), putUrl, auth, dispatcher);
    const sizeGb = Math.max(0.01, Math.round((sizeBytes / 1024 ** 3) * 100) / 100);

    await supabase
      .from("custom_images")
      .update({ source_ref: key, size_gb: sizeGb, status: "available" })
      .eq("id", image.id);

    const gbRate = await getRatePerGbForCustomImage();
    const hourlyRate = Math.max(0.0001, (sizeGb * gbRate) / 730);
    await BillingCredits.addActiveCustomImage({
      userId: image.owner_id,
      serviceId: image.billing_service_id,
      hourlyRate,
    }).catch((e) => console.error("[snapshot] meter register failed:", e));
  } catch (err) {
    console.error("[snapshot] export failed:", err);
    const msg = err instanceof Error ? err.message : "Snapshot failed";
    await supabase
      .from("custom_images")
      .update({ status: "failed", error: msg.slice(0, 300) })
      .eq("id", image.id);
  }
}
