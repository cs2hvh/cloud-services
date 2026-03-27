import { NextRequest } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { proxmoxAuth, postForm, getDispatcher, type ProxmoxHost } from "@/lib/proxmox-utils";


export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Authenticate the user via session cookie
  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string; serverId?: string };
  const action = String(body.action || '').toLowerCase();
  const serverId = body.serverId;

  if (!serverId || !['start', 'stop', 'reboot'].includes(action)) {
    return Response.json({ ok: false, error: "Please provide a valid server and action." }, { status: 400 });
  }

  const supabase = await createWorkerClient();
  const { data: server, error: serverErr } = await supabase
    .from('servers')
    .select('id, vmid, node, location, owner_id')
    .eq('id', serverId)
    .maybeSingle();

  if (serverErr) {
    console.error("[VM Power] Server lookup failed:", serverErr.message);
    return Response.json({ ok: false, error: "Unable to find your server. Please try again." }, { status: 500 });
  }
  if (!server) return Response.json({ ok: false, error: "Server not found." }, { status: 404 });

  // Verify the user owns this server
  if (!server.owner_id || server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const vmid = server.vmid as number | undefined;
  const node = server.node as string | undefined;
  const hostId = server.location as string | undefined;
  if (!vmid || !node || !hostId) {
    console.error("[VM Power] Missing vmid/node/location for server:", serverId);
    return Response.json({ ok: false, error: "Server configuration is incomplete. Please contact support." }, { status: 500 });
  }

  const { data: host, error: hostErr } = await supabase
    .from('proxmox_hosts')
    .select('id, name, host_url, allow_insecure_tls, token_id, token_secret, username, password, node, storage, bridge, gateway_ip, dns_primary, dns_secondary')
    .eq('id', hostId)
    .maybeSingle();

  if (hostErr) {
    console.error("[VM Power] Host lookup failed:", hostErr.message);
    return Response.json({ ok: false, error: "Unable to reach your server. Please try again." }, { status: 500 });
  }
  if (!host) return Response.json({ ok: false, error: "Server host is unavailable. Please contact support." }, { status: 404 });

  const cfg = host as unknown as ProxmoxHost;
  const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);

  try {
    const auth = await proxmoxAuth(cfg, dispatcher);

    let endpoint = '';
    if (action === 'start') endpoint = `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/start`;
    else if (action === 'stop') endpoint = `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/shutdown`;
    else if (action === 'reboot') endpoint = `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/reboot`;

    await postForm(cfg, endpoint, {}, auth, dispatcher);

    // Update status in DB
    const newStatus = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'running';
    await supabase.from('servers').update({ status: newStatus }).eq('id', serverId);

    return Response.json({ ok: true, action, status: newStatus });
  } catch (e: unknown) {
    console.error("[VM Power] Action failed:", e instanceof Error ? e.message : e);
    const actionLabel = action === 'start' ? 'start' : action === 'stop' ? 'shut down' : 'restart';
    return Response.json({ ok: false, error: `Unable to ${actionLabel} your server. Please try again or contact support.` }, { status: 500 });
  }
}
