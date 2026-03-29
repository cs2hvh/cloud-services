import { NextRequest } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import {
  proxmoxAuth,
  getDispatcher,
  createVNCProxy,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { limitByUser } from "@/lib/cooldown/userbased";
import { createVncToken } from "@/lib/vnc-token";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/services/compute/vms/[id]/console
 *
 * Creates a VNC proxy session for web console access.
 * Returns the Proxmox host URL, VNC port, and ticket for noVNC connection.
 * Rate limited to 10 req/min per user.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json(
      { ok: false, error: "Invalid server ID" },
      { status: 400 }
    );
  }

  /* ── Auth ─────────────────────────────────────────── */
  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json(
      { ok: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  /* ── Rate limit (10 req/min — console sessions are expensive) ── */
  const rl = await limitByUser(user.id, {
    prefix: "rl:vm-console",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Rate limited. Try again shortly." },
      { status: 429 }
    );
  }

  /* ── Lookup server & verify ownership ─────────────── */
  const supabase = await createWorkerClient();
  const { data: srv, error: dbErr } = await supabase
    .from("servers")
    .select("vmid, node, location, status, owner_id")
    .eq("id", serverId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!srv) {
    return Response.json(
      { ok: false, error: "Server not found" },
      { status: 404 }
    );
  }
  if (srv.status !== "running") {
    return Response.json(
      { ok: false, error: "Server must be running to open console" },
      { status: 422 }
    );
  }
  if (!srv.vmid || !srv.location) {
    return Response.json(
      { ok: false, error: "Server is still provisioning" },
      { status: 422 }
    );
  }

  /* ── Fetch Proxmox host config ────────────────────── */
  const { data: host, error: hostError } = await supabase
    .from("proxmox_hosts")
    .select("*")
    .eq("id", srv.location)
    .maybeSingle();

  if (hostError || !host) {
    console.error("[console] Host lookup failed:", hostError?.message);
    return Response.json(
      { ok: false, error: "Infrastructure host unavailable" },
      { status: 503 }
    );
  }

  /* ── Get VNC proxy ticket from Proxmox ────────────── */
  try {
    const pxHost = host as ProxmoxHost;
    const dispatcher = getDispatcher(pxHost.allow_insecure_tls);
    const auth = await proxmoxAuth(pxHost, dispatcher);
    const vnc = await createVNCProxy(pxHost, srv.vmid, auth, dispatcher);

    // Build the noVNC URL pointing at the Proxmox host
    const proxmoxBase = pxHost.host_url.replace(/\/$/, "");
    const node = pxHost.node;

    // Extract PVE auth ticket from cookie header
    const cookieHeader = (auth.headers as Record<string, string>).Cookie || "";
    const pveTicket = cookieHeader.replace("PVEAuthCookie=", "");

    // Create a short-lived signed token for the VNC WebSocket proxy
    const vncToken = createVncToken({
      proxmoxUrl: proxmoxBase,
      allowInsecureTls: !!pxHost.allow_insecure_tls,
      node,
      vmid: srv.vmid,
      vncPort: vnc.port,
      vncTicket: vnc.ticket,
      pveTicket,
      userId: user.id,
    });

    return Response.json({
      ok: true,
      console: {
        wsPath: `/ws/vnc?token=${encodeURIComponent(vncToken)}`,
        ticket: vnc.ticket,
        port: vnc.port,
      },
    });
  } catch (err) {
    console.error("[console] VNC proxy failed:", err);
    return Response.json(
      { ok: false, error: "Failed to create console session" },
      { status: 502 }
    );
  }
}
