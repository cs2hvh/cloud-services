import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { linodePower } from "@/lib/services/compute/providers/linode/ops";
import {
  proxmoxAuth,
  postForm,
  getDispatcher,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ACTIONS = ["start", "stop", "reboot"] as const;
type PowerAction = (typeof ACTIONS)[number];

/**
 * Admin power control for any customer's VM, both providers. Same provider
 * branches as the user-facing /api/services/compute/vms/power route, with
 * the ownership check replaced by the admin gate + an audit entry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const serverId = Number(id);
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = String(body.action || "").toLowerCase() as PowerAction;

  if (!Number.isInteger(serverId) || !ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "Provide a valid server id and action (start|stop|reboot)" },
      { status: 400 },
    );
  }

  const supabase = await createServiceClient();
  const { data: server, error: serverErr } = await supabase
    .from("servers")
    .select("id, name, vmid, node, location, provider, linode_id, owner_email")
    .eq("id", serverId)
    .maybeSingle();

  if (serverErr) {
    console.error("[Admin Power] lookup failed:", serverErr.message);
    return NextResponse.json({ error: "Server lookup failed" }, { status: 500 });
  }
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const audit = async (ok: boolean, detail?: string) => {
    try {
      await AuditLogService.create({
        user_id: admin.userId || "",
        user_email: admin.email,
        user_role: "admin",
        action: "update",
        service_type: "compute",
        service_id: String(serverId),
        service_name: server.name || `server ${serverId}`,
        metadata: {
          operation: `admin.server.power.${action}`,
          provider: server.provider,
          owner_email: server.owner_email,
          ok,
          detail,
        },
        user_agent: request.headers.get("user-agent") || undefined,
      });
    } catch {
      // audit must never fail the action
    }
  };

  if (server.provider === "linode") {
    try {
      const result = await linodePower(
        {
          id: Number(server.id),
          linode_id: server.linode_id as number | null,
          location: server.location as string | null,
          plan_slug: null,
        },
        action,
      );
      await supabase
        .from("servers")
        .update({ status: result.status })
        .eq("id", serverId);
      await audit(true);
      return NextResponse.json({ ok: true, action, status: result.status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[Admin Power] Linode action failed:", message);
      await audit(false, message);
      return NextResponse.json(
        { error: `Linode ${action} failed: ${message}` },
        { status: 502 },
      );
    }
  }

  // Proxmox branch
  const vmid = server.vmid as number | null;
  const node = server.node as string | null;
  const hostId = server.location as string | null;
  if (!vmid || !node || !hostId) {
    return NextResponse.json(
      { error: "Server row is missing vmid/node/host — cannot send power action" },
      { status: 500 },
    );
  }

  const { data: host, error: hostErr } = await supabase
    .from("proxmox_hosts")
    .select(
      "id, name, host_url, allow_insecure_tls, token_id, token_secret, username, password, node, storage, bridge, gateway_ip, dns_primary, dns_secondary",
    )
    .eq("id", hostId)
    .maybeSingle();

  if (hostErr || !host) {
    return NextResponse.json(
      { error: "Proxmox host unavailable" },
      { status: hostErr ? 500 : 404 },
    );
  }

  const cfg = host as unknown as ProxmoxHost;
  const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);

  try {
    const auth = await proxmoxAuth(cfg, dispatcher);
    const verb =
      action === "start" ? "start" : action === "stop" ? "shutdown" : "reboot";
    await postForm(
      cfg,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/${verb}`,
      {},
      auth,
      dispatcher,
    );

    // Proxmox tasks run async; realtime sync will correct the actual status.
    const newStatus = action === "stop" ? "stopped" : "running";
    await supabase
      .from("servers")
      .update({ status: newStatus })
      .eq("id", serverId);
    await audit(true);
    return NextResponse.json({ ok: true, action, status: newStatus });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[Admin Power] Proxmox action failed:", message);
    await audit(false, message);
    return NextResponse.json(
      { error: `Proxmox ${action} failed: ${message}` },
      { status: 502 },
    );
  }
}
