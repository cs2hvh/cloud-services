import { createWorkerClient } from "@/lib/supabase/server";
import {
  proxmoxAuth,
  getDispatcher,
  deleteVM,
  postForm,
  removeHostRoute,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { releaseOnDemandVmac } from "@/lib/proxmox/on-demand-vmac";
import { closeActiveBilling } from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";

export interface DestroyServerResult {
  success: boolean;
  alreadyGone?: boolean;
  message?: string;
}

/**
 * Tear down a virtual server end-to-end and settle its billing. Shared by the
 * user-initiated DELETE route and the billing grace-expiry path so both behave
 * identically.
 *
 *   1. Stop + delete the Proxmox VM
 *   2. Release its host route / on-demand vMAC (so the IP can be reused)
 *   3. Settle billing — prorate the final partial hour + remove the
 *      active_compute meter row
 *   4. Remove the DB row
 *
 * Auth is the caller's responsibility (the API route checks ownership; the
 * grace path is system-driven). Best-effort upstream: a Proxmox failure is
 * logged but billing-close + DB cleanup still proceed (so a stuck Proxmox host
 * can't leave a phantom meter billing forever).
 *
 * Step 4 is conditional on step 3. A failed billing close used to be logged and
 * swallowed, and the row deleted regardless — which is precisely how a phantom
 * meter DOES get left billing forever, just from the other direction.
 */
export async function destroyServer(serverId: number): Promise<DestroyServerResult> {
  const supabase = await createWorkerClient();
  const { data: server, error } = await supabase
    .from("servers")
    .select("id, vmid, node, ip, location, owner_id, status, billing_service_id, provider, linode_id")
    .eq("id", serverId)
    .maybeSingle();

  if (error) return { success: false, message: error.message };
  if (!server) return { success: true, alreadyGone: true, message: "Server already deleted" };

  const provider = (server.provider as string | null) ?? "proxmox";

  if (provider === "linode") {
    // Linode teardown: delete the instance (404-tolerant — already gone is
    // success). Billing close + row cleanup below are provider-agnostic.
    const linodeId = server.linode_id as number | null;
    if (linodeId) {
      try {
        const { deleteLinodeInstance } = await import(
          "@/lib/services/compute/providers/linode/lifecycle"
        );
        await deleteLinodeInstance(linodeId);
      } catch (e) {
        console.error(
          "[destroyServer] Linode cleanup failed:",
          e instanceof Error ? e.message : e
        );
        // Continue with billing close + DB cleanup even if Linode failed —
        // the reconcile job reports any instance left behind.
      }
    }
  }

  const vmid = server.vmid as number | undefined;
  const node = server.node as string | undefined;
  const hostId = server.location as string | undefined;

  if (provider === "proxmox" && vmid && vmid > 0 && node && hostId) {
    const { data: host } = await supabase
      .from("proxmox_hosts")
      .select(
        "id, name, host_url, allow_insecure_tls, token_id, token_secret, username, password, node, storage, bridge, gateway_ip, dns_primary, dns_secondary, network_mode, provider"
      )
      .eq("id", hostId)
      .maybeSingle();

    if (host) {
      const cfg = host as unknown as ProxmoxHost;
      const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);
      try {
        const auth = await proxmoxAuth(cfg, dispatcher);

        if (server.status === "running") {
          try {
            await postForm(
              cfg,
              `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/stop`,
              {},
              auth,
              dispatcher
            );
            await new Promise((r) => setTimeout(r, 3000));
          } catch {}
        }

        await deleteVM(cfg, vmid, auth, dispatcher);

        if (server.ip) {
          const routeModes = new Set([
            "legacy_public_gateway",
            "ovh_hg_scale_routed",
            "ovh_advance_gen3_routed",
          ]);
          if (
            routeModes.has(
              String((cfg as { network_mode?: string | null }).network_mode || "legacy_public_gateway")
            )
          ) {
            await removeHostRoute(cfg, server.ip, cfg.bridge || "vmbr0");
          }
        }

        if (
          server.ip &&
          (cfg as { network_mode?: string | null }).network_mode === "ovh_failover_vmac"
        ) {
          try {
            await releaseOnDemandVmac({
              supabase,
              host: {
                id: cfg.id,
                host_url: cfg.host_url,
                provider: (cfg as { provider?: string | null }).provider,
              },
              ip: server.ip,
            });
          } catch (e) {
            console.warn(
              `[destroyServer] vMAC release failed for ${server.ip}: ${e instanceof Error ? e.message : e}`
            );
          }
        }
      } catch (e) {
        console.error(
          "[destroyServer] Proxmox cleanup failed:",
          e instanceof Error ? e.message : e
        );
        // Continue with billing close + DB cleanup even if Proxmox failed.
      }
    }
  }

  // Settle billing: prorate the final partial period and remove the meter row.
  //
  // Whether this SUCCEEDED decides if the servers row may be hard-deleted
  // below. The meter in billing.active_compute is keyed by billing_service_id
  // and has no foreign key back here, so deleting the row after a failed close
  // strands the meter: it keeps accruing every cron tick with nothing left to
  // trace it to, and no path that would ever close it. Five such meters were
  // found running this way, one at $120/hr since June.
  let billingSettled = false;
  if (server.billing_service_id && server.owner_id) {
    try {
      await closeActiveBilling({
        userId: server.owner_id as string,
        serviceId: server.billing_service_id as string,
        serviceType: "compute",
        closeActive: () =>
          BillingCredits.closeActiveCompute({ serviceId: server.billing_service_id as string }),
      });
      billingSettled = true;
    } catch (billErr) {
      console.error("[destroyServer] billing close FAILED — keeping the servers row so the meter stays traceable:", billErr);
    }
  } else {
    // Nothing to close against. Safe to drop the row: a meter is keyed by
    // billing_service_id, so without one there is nothing that could be left
    // stranded.
    billingSettled = true;
  }

  await supabase
    .from("servers")
    .update({ status: "destroyed", billing_end: new Date().toISOString() })
    .eq("id", serverId);

  if (!billingSettled) {
    // The upstream resource is gone and the row is marked destroyed, so it is
    // out of every customer-facing list and every quota count. Keeping it is
    // what makes the stranded meter findable and re-closable.
    return {
      success: true,
      message: "Server deleted; final billing could not be settled and is pending review.",
    };
  }

  const { error: deleteErr } = await supabase.from("servers").delete().eq("id", serverId);
  if (deleteErr) return { success: false, message: deleteErr.message };

  return { success: true };
}
