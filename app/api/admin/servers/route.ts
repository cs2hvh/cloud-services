import { NextRequest, NextResponse } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { Agent as UndiciAgent } from "undici";

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

interface ProxmoxResponse<T = unknown> {
  data?: T;
  [key: string]: unknown;
}

interface TaskData {
  status?: string;
  exitstatus?: string;
  [key: string]: unknown;
}

interface ProxmoxAuthHeaders {
  headers: Record<string, string>;
}

function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); })
     .catch((e) => { clearTimeout(id); reject(e); });
  });
}

async function proxmoxAuthCookie(apiBase: string, dispatcher: UndiciAgent | undefined, host: HostConfig): Promise<ProxmoxAuthHeaders> {
  const tokenId = host.token_id || undefined;
  const tokenSecret = host.token_secret || undefined;
  const username = host.username || undefined;
  const password = host.password || undefined;

  if (tokenId && tokenSecret) {
    const tokenAuth: ProxmoxAuthHeaders = { headers: { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` } };
    try {
      
      const verify = await withTimeout(
        fetch(`${apiBase}/api2/json/nodes`, {
          cache: "no-store",
          redirect: "follow",
          headers: tokenAuth.headers,
         
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
  const ticketJson = (await ticketRes.json()) as ProxmoxResponse<{ ticket?: string; CSRFPreventionToken?: string }>;
  const ticket = ticketJson?.data?.ticket as string | undefined;
  const csrf = ticketJson?.data?.CSRFPreventionToken as string | undefined;
  if (!ticket) throw new Error("Missing PVE ticket in response");
  if (!csrf) throw new Error("Missing CSRFPreventionToken in response");
  return { headers: { Cookie: `PVEAuthCookie=${ticket}`, CSRFPreventionToken: csrf } };
}

async function postForm(apiBase: string, path: string, form: Record<string, string | number | boolean>, auth: ProxmoxAuthHeaders, dispatcher?: UndiciAgent): Promise<unknown> {
  const body = new URLSearchParams();
  Object.entries(form).forEach(([k, v]) => body.append(k, String(v)));
  const res = await withTimeout(
    fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth.headers },
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

async function waitTask(apiBase: string, node: string, upid: string, auth: ProxmoxAuthHeaders, dispatcher?: UndiciAgent, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await withTimeout(
      fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`, {
        cache: "no-store",
        redirect: "follow",
        headers: auth.headers,
        // @ts-expect-error undici dispatcher
        dispatcher,
      })
    );
    if (res.ok) {
      const json = (await res.json()) as ProxmoxResponse<TaskData>;
      const data: TaskData = json?.data ?? json;
      if (data?.status === "stopped" && data?.exitstatus) {
        if (String(data.exitstatus).toUpperCase() === "OK") return true;
        throw new Error(`task failed: ${data.exitstatus}`);
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("task timeout");
}

// Check if user is admin
async function requireAdmin(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || "";

    if (!email) return { ok: false };

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length > 0 && !adminEmails.includes(email.toLowerCase())) {
      return { ok: false };
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  try {
    const supabase = await createWorkerClient();

    const { data: servers, error } = await supabase
      .from("servers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      servers: servers || [],
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get('id');

    if (!serverId) {
      return NextResponse.json(
        { ok: false, error: "Server ID required" },
        { status: 400 }
      );
    }

    const supabase = await createWorkerClient();

    // Get server details
    const { data: server, error: serverErr } = await supabase
      .from("servers")
      .select("id, name, vmid, node, location")
      .eq("id", serverId)
      .maybeSingle();

    if (serverErr) {
      return NextResponse.json(
        { ok: false, error: serverErr.message },
        { status: 500 }
      );
    }

    if (!server) {
      return NextResponse.json(
        { ok: false, error: "Server not found" },
        { status: 404 }
      );
    }

    const vmid = (server as Record<string, unknown>).vmid;
    const node = (server as Record<string, unknown>).node;
    const location = (server as Record<string, unknown>).location;

    // Get Proxmox host config
    if (vmid && node && location) {
      try {
        const { data: host } = await supabase
          .from("proxmox_hosts")
          .select("*")
          .eq("id", location)
          .maybeSingle();

        if (host) {
          const cfg = host as HostConfig;
          const allowInsecure = !!cfg.allow_insecure_tls;
          const dispatcher = allowInsecure ? new UndiciAgent({ connect: { rejectUnauthorized: false } }) : undefined;
          const apiBase = cfg.host_url.startsWith('http:') ? cfg.host_url.replace(/^http:/, 'https:') : cfg.host_url;

          // Try to delete from Proxmox
          try {
            console.log(`[Admin Delete] Attempting to delete VM ${vmid} from Proxmox node ${node}`);
            const auth = await proxmoxAuthCookie(apiBase, dispatcher, cfg);

            // First, stop the VM
            try {
              console.log(`[Admin Delete] Stopping VM ${vmid}...`);
              const stopRes = await postForm(
                apiBase,
                `/api2/json/nodes/${encodeURIComponent(node as string)}/qemu/${vmid}/status/stop`,
                { timeout: 60 },
                auth,
                dispatcher
              );
              const upid = (stopRes as ProxmoxResponse)?.data;
              if (upid) {
                await waitTask(apiBase, node as string, upid as string, auth, dispatcher, 120000).catch(() => {});
              }
              console.log(`[Admin Delete] VM ${vmid} stopped`);
            } catch (stopErr) {
              console.warn(`[Admin Delete] Failed to stop VM (continuing):`, stopErr);
            }

            // Delete VM with purge query parameter
            console.log(`[Admin Delete] Deleting VM ${vmid}...`);
            const delRes = await withTimeout(
              fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node as string)}/qemu/${vmid}?purge=1`, {
                method: "DELETE",
                headers: auth.headers,
                redirect: "follow",
                // @ts-expect-error undici dispatcher
                dispatcher,
              }),
              30000
            );

            console.log(`[Admin Delete] Proxmox delete response status: ${delRes.status}`);

            if (!delRes.ok) {
              if (delRes.status === 404) {
                console.log(`[Admin Delete] VM ${vmid} already deleted from Proxmox`);
              } else {
                const text = await delRes.text().catch(() => "");
                console.error(`[Admin Delete] Delete failed (${delRes.status}): ${text}`);
                throw new Error(`delete failed (${delRes.status}): ${text}`);
              }
            } else {
              const delJson = (await delRes.json().catch(() => ({}))) as ProxmoxResponse;
              const delUpid = delJson?.data;
              if (delUpid) {
                console.log(`[Admin Delete] Waiting for delete task ${delUpid}...`);
                await waitTask(apiBase, node as string, delUpid as string, auth, dispatcher, 180000);
              }
              console.log(`[Admin Delete] VM ${vmid} deleted from Proxmox successfully`);
            }
          } catch (proxmoxErr) {
            const error = proxmoxErr instanceof Error ? proxmoxErr : new Error(String(proxmoxErr));
            console.error(`[Admin Delete] Failed to delete VM from Proxmox:`, error?.message || proxmoxErr);
            throw new Error(`Proxmox delete failed: ${error?.message || proxmoxErr}`);
          }
        }
      } catch (hostErr) {
        console.warn(`[Admin Delete] Failed to get host config:`, hostErr);
        // Continue to delete from DB
      }
    }

    // Delete from database
    const { error: deleteErr } = await supabase
      .from("servers")
      .delete()
      .eq("id", serverId);

    if (deleteErr) {
      return NextResponse.json(
        { ok: false, error: deleteErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Server "${server.name}" deleted successfully`,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
