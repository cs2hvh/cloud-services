import { NextRequest } from "next/server";
import { Agent as UndiciAgent } from "undici";
import { createWorkerClient } from "@/lib/supabase/server";


export const dynamic = "force-dynamic";

type HostConfig = {
  id: string;
  host_url: string;
  allow_insecure_tls: boolean;
  token_id: string | null;
  token_secret: string | null;
  username: string | null;
  password: string | null;
};

function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); })
     .catch((e) => { clearTimeout(id); reject(e); });
  });
}

async function proxmoxAuthCookie(apiBase: string, dispatcher: UndiciAgent | undefined, host: HostConfig) {
  const tokenId = host.token_id || undefined;
  const tokenSecret = host.token_secret || undefined;
  const username = host.username || undefined;
  const password = host.password || undefined;

  if (tokenId && tokenSecret) {
    const tokenAuth = { headers: { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` } as HeadersInit };
    try {
      const verify = await withTimeout(
        fetch(`${apiBase}/api2/json/nodes`, {
          cache: "no-store",
          redirect: "follow",
          ...tokenAuth,
          // @ts-expect-error undici dispatcher
          dispatcher,
        })
      );
      if (verify.ok) return tokenAuth;
    } catch {}
  }

  if (!username || !password) throw new Error("Missing Proxmox credentials in DB");

  const body = new URLSearchParams({ username, password });
  const ticketRes = await withTimeout(
    fetch(`${apiBase}/api2/json/access/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "follow",
      // @ts-expect-error undici dispatcher
      dispatcher,
    })
  );
  if (!ticketRes.ok) {
    const t = await ticketRes.text();
    throw new Error(`login failed (${ticketRes.status}): ${t}`);
  }
  const ticketJson = (await ticketRes.json()) as { data?: { ticket?: string; CSRFPreventionToken?: string } };
  const ticket = ticketJson?.data?.ticket as string | undefined;
  const csrf = ticketJson?.data?.CSRFPreventionToken as string | undefined;
  if (!ticket) throw new Error("Missing PVE ticket in response");
  if (!csrf) throw new Error("Missing CSRFPreventionToken in response");
  return { headers: { Cookie: `PVEAuthCookie=${ticket}`, CSRFPreventionToken: csrf } as HeadersInit };
}

async function postForm(apiBase: string, path: string, form: Record<string, string | number | boolean>, auth: RequestInit, dispatcher?: UndiciAgent) {
  const body = new URLSearchParams();
  Object.entries(form).forEach(([k, v]) => body.append(k, String(v)));
  const res = await withTimeout(
    fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(auth.headers as Record<string, string>) },
      body,
      redirect: "follow",
      // @ts-expect-error undici dispatcher
      dispatcher,
    })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; serverId?: string };
  const action = String(body.action || '').toLowerCase();
  const serverId = body.serverId;

  if (!serverId || !['start', 'stop', 'reboot'].includes(action)) {
    return Response.json({ ok: false, error: "serverId and valid action (start|stop|reboot) are required" }, { status: 400 });
  }

  const supabase = await createWorkerClient();
  const { data: server, error: serverErr } = await supabase
    .from('servers')
    .select('id, vmid, node, location')
    .eq('id', serverId)
    .maybeSingle();

  if (serverErr) return Response.json({ ok: false, error: serverErr.message }, { status: 500 });
  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });

  const vmid = server.vmid as number | undefined;
  const node = server.node as string | undefined;
  const hostId = server.location as string | undefined;
  if (!vmid || !node || !hostId) return Response.json({ ok: false, error: "Missing vmid/node/location" }, { status: 400 });

  const { data: host, error: hostErr } = await supabase
    .from('proxmox_hosts')
    .select('id, host_url, allow_insecure_tls, token_id, token_secret, username, password')
    .eq('id', hostId)
    .maybeSingle();

  if (hostErr) return Response.json({ ok: false, error: hostErr.message }, { status: 500 });
  if (!host) return Response.json({ ok: false, error: "Host not found" }, { status: 404 });

  const cfg = host as HostConfig;
  const allowInsecure = !!cfg.allow_insecure_tls;
  const dispatcher = allowInsecure ? new UndiciAgent({ connect: { rejectUnauthorized: false } }) : undefined;
  const apiBase = cfg.host_url.startsWith('http:') ? cfg.host_url.replace(/^http:/, 'https:') : cfg.host_url;

  try {
    const auth = await proxmoxAuthCookie(apiBase, dispatcher, cfg);

    let path = '';
    if (action === 'start') path = `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/start`;
    else if (action === 'stop') path = `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/shutdown`;
    else if (action === 'reboot') path = `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/reboot`;

    await postForm(apiBase, path, {}, auth, dispatcher);

    // Update status in DB
    const newStatus = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : 'running';
    await supabase.from('servers').update({ status: newStatus }).eq('id', serverId);

    return Response.json({ ok: true, action, vmid, node, status: newStatus });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
