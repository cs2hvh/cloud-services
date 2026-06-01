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
 */
export async function destroyServer(serverId: number): Promise<DestroyServerResult> {
  const supabase = await createWorkerClient();
  const { data: server, error } = await supabase
    .from("servers")
    .select("id, vmid, node, ip, location, owner_id, status, billing_service_id")
    .eq("id", serverId)
    .maybeSingle();

  if (error) return { success: false, message: error.message };
  if (!server) return { success: true, alreadyGone: true, message: "Server already deleted" };

  const vmid = server.vmid as number | undefined;
  const node = server.node as string | undefined;
  const hostId = server.location as string | undefined;

  if (vmid && vmid > 0 && node && hostId) {
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
  if (server.billing_service_id && server.owner_id) {
    try {
      await closeActiveBilling({
        userId: server.owner_id as string,
        serviceId: server.billing_service_id as string,
        serviceType: "compute",
        closeActive: () =>
          BillingCredits.closeActiveCompute({ serviceId: server.billing_service_id as string }),
      });
    } catch (billErr) {
      console.warn("[destroyServer] billing close failed:", billErr);
    }
  }

  await supabase
    .from("servers")
    .update({ status: "destroyed", billing_end: new Date().toISOString() })
    .eq("id", serverId);

  const { error: deleteErr } = await supabase.from("servers").delete().eq("id", serverId);
  if (deleteErr) return { success: false, message: deleteErr.message };

  return { success: true };
}
