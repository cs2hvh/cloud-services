import { NextRequest } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import {
  proxmoxAuth,
  getDispatcher,
  deleteVM,
  postForm,
  removeHostRoute,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { limitByUser } from "@/lib/cooldown/userbased";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/services/compute/vms/[id] — fetch single VM details */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = await createWorkerClient();
  const { data: server, error } = await supabase
    .from("servers")
    .select(
      "id, vmid, node, name, ip, os, cpu_cores, memory_mb, disk_gb, status, hourly_cost, billing_start, created_at, details, location"
    )
    .eq("id", serverId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[VM Get] Lookup failed:", error.message);
    return Response.json({ ok: false, error: "Unable to load server" }, { status: 500 });
  }
  if (!server) {
    return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  }

  // Fetch host info for region/display data
  let region: string | null = null;
  let displayRegion: string | null = null;
  if (server.location) {
    const { data: host } = await supabase
      .from("proxmox_hosts")
      .select("region, display_region, gateway_ip, dns_primary, dns_secondary, bridge")
      .eq("id", server.location)
      .maybeSingle();
    if (host) {
      region = host.region;
      displayRegion = host.display_region;
    }
  }

  return Response.json({
    ok: true,
    server: {
      ...server,
      region,
      displayRegion,
    },
  });
}

/** PATCH /api/services/compute/vms/[id] — rename server */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  // Rate limit: max 10 renames per minute
  const rl = await limitByUser(user.id, { prefix: "rl:vm-rename", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ ok: false, error: "Too many requests. Try again later.", retryAfterSec: rl.retryAfterSec }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const newName = body.name?.trim();
  if (!newName || !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(newName)) {
    return Response.json(
      { ok: false, error: "Name must be 1-63 characters, alphanumeric and hyphens only" },
      { status: 400 }
    );
  }

  const supabase = await createWorkerClient();
  const { data: server } = await supabase
    .from("servers")
    .select("id, owner_id")
    .eq("id", serverId)
    .maybeSingle();

  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  if (server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const { error } = await supabase.from("servers").update({ name: newName }).eq("id", serverId);
  if (error) {
    return Response.json({ ok: false, error: "Failed to rename server" }, { status: 500 });
  }

  return Response.json({ ok: true, name: newName });
}

/** DELETE /api/services/compute/vms/[id] — destroy VM */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  // Rate limit: max 10 deletes per hour
  const rl = await limitByUser(user.id, { prefix: "rl:vm-delete", limit: 10, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json({ ok: false, error: "Too many delete requests. Try again later.", retryAfterSec: rl.retryAfterSec }, { status: 429 });
  }

  const supabase = await createWorkerClient();
  const { data: server, error: serverErr } = await supabase
    .from("servers")
    .select("id, vmid, node, ip, location, owner_id, status")
    .eq("id", serverId)
    .maybeSingle();

  if (serverErr) {
    return Response.json({ ok: false, error: "Unable to find server" }, { status: 500 });
  }
  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  if (server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const vmid = server.vmid as number | undefined;
  const node = server.node as string | undefined;
  const hostId = server.location as string | undefined;

  // If VM was fully provisioned, destroy it on Proxmox
  if (vmid && vmid > 0 && node && hostId) {
    const { data: host } = await supabase
      .from("proxmox_hosts")
      .select(
        "id, name, host_url, allow_insecure_tls, token_id, token_secret, username, password, node, storage, bridge, gateway_ip, dns_primary, dns_secondary"
      )
      .eq("id", hostId)
      .maybeSingle();

    if (host) {
      const cfg = host as unknown as ProxmoxHost;
      const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);

      try {
        const auth = await proxmoxAuth(cfg, dispatcher);

        // Stop VM first if running
        if (server.status === "running") {
          try {
            await postForm(
              cfg,
              `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/stop`,
              {},
              auth,
              dispatcher
            );
            // Brief wait for stop
            await new Promise((r) => setTimeout(r, 3000));
          } catch {}
        }

        // Delete VM from Proxmox
        await deleteVM(cfg, vmid, auth, dispatcher);

        // Clean up host route
        if (server.ip) {
          await removeHostRoute(cfg, server.ip, cfg.bridge || "vmbr0");
        }
      } catch (e) {
        console.error("[VM Delete] Proxmox cleanup failed:", e instanceof Error ? e.message : e);
        // Continue with DB deletion even if Proxmox cleanup fails
      }
    }
  }

  // Record billing end before deletion for accurate invoicing
  await supabase
    .from("servers")
    .update({ status: "destroyed", billing_end: new Date().toISOString() })
    .eq("id", serverId);

  // Remove from database
  const { error: deleteErr } = await supabase.from("servers").delete().eq("id", serverId);
  if (deleteErr) {
    console.error("[VM Delete] DB delete failed:", deleteErr.message);
    return Response.json({ ok: false, error: "Failed to delete server record" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
