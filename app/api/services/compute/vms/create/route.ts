import { NextRequest } from "next/server";
import { Agent as UndiciAgent } from "undici";
import { createWorkerClient } from "@/lib/supabase/server";
import { calculateHourlyCost, type ServerSpecs } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Type definitions
interface ErrorObject {
  name?: string;
  message?: string;
  stack?: string;
  code?: string | number;
  cause?: string;
}

interface ProxmoxResponse<T = unknown> {
  data?: T;
  [key: string]: unknown;
}

interface ProxmoxAuthHeaders {
  headers: Record<string, string>;
}

interface DbReservation {
  saved: boolean;
  id: number | null;
  error: string | null;
}

interface PoolItem {
  ip: string;
  mac?: string;
  poolId: number;
}

interface ProxmoxVM {
  vmid?: number;
  name?: string;
  [key: string]: unknown;
}

// interface ProxmoxTemplate {
//   vmid?: number;
//   name?: string;
//   is_active?: boolean;
// }

function serializeError(err: unknown): ErrorObject {
  const e = err as Record<string, unknown>;
  return {
    name: e?.name as string | undefined,
    message: (e?.message ?? String(e)) as string,
    stack: e?.stack as string | undefined,
    code: e?.code as string | number | undefined,
    cause: e?.cause ? ((e.cause as Record<string, unknown>).message as string | undefined || String(e.cause)) : undefined,
  };
}

function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); })
     .catch((e) => { clearTimeout(id); reject(e); });
  });
}

type HostConfig = {
  id: string;
  name: string;
  host_url: string;
  allow_insecure_tls: boolean;
  token_id: string | null;
  token_secret: string | null;
  username: string | null;
  password: string | null;
  node: string;
  storage: string;
  bridge: string;
  template_vmid: number | null;
  gateway_ip: string | null;
  dns_primary: string | null;
  dns_secondary: string | null;
};

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

async function fetchJson(apiBase: string, path: string, init?: ProxmoxAuthHeaders, dispatcher?: UndiciAgent): Promise<unknown> {
  const res = await withTimeout(
    fetch(`${apiBase}${path}`, {
      cache: "no-store",
      redirect: "follow",
      headers: init?.headers || {},
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

async function postForm<T = unknown>(apiBase: string, path: string, form: Record<string, string | number | boolean>, auth: ProxmoxAuthHeaders, dispatcher?: UndiciAgent): Promise<T> {
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
  return res.json() as Promise<T>;
}

async function waitTask(apiBase: string, node: string, upid: string, auth: ProxmoxAuthHeaders, dispatcher?: UndiciAgent, timeoutMs = 180000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const json = await fetchJson(apiBase, `/api2/json/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`, auth, dispatcher);
    const data = (json as ProxmoxResponse)?.data ?? json;
    const taskData = data as Record<string, unknown>;
    if (taskData?.status === "stopped" && taskData?.exitstatus) {
      if (String(taskData.exitstatus).toUpperCase() === "OK") return true;
      throw new Error(`task failed: ${taskData.exitstatus}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("task timeout");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  console.log(`[VM Create Request] Full Request Body:`, JSON.stringify(body, null, 2));

  const hostId = String(body.location || "");
  if (!hostId) return Response.json({ ok: false, error: "location (hostId) required" }, { status: 400 });

  const supabase = await createWorkerClient();
  const { data: host, error: hostErr } = await supabase
    .from("proxmox_hosts")
    .select("*")
    .eq("id", hostId)
    .eq("is_active", true)
    .maybeSingle();

  if (hostErr) return Response.json({ ok: false, error: hostErr.message }, { status: 500 });
  if (!host) return Response.json({ ok: false, error: "Host not found or inactive" }, { status: 404 });

  const cfg = host as HostConfig;

  const allowInsecure = !!cfg.allow_insecure_tls;
  const dispatcher = allowInsecure ? new UndiciAgent({ connect: { rejectUnauthorized: false } }) : undefined;
  const apiBase = cfg.host_url.startsWith("http:") ? cfg.host_url.replace(/^http:/, "https:") : cfg.host_url;

  const hostname = body.hostname || `vm-${Date.now()}`;
  const sshPassword = body.sshPassword as string | undefined;
  const cpuCores = Number(body.cpuCores || 2);
  const memoryMB = Number(body.memoryMB || 2048);
  const diskGB = body.diskGB ? Number(body.diskGB) : undefined;
  const os = body.os || "Ubuntu 24.04 LTS";

  if (!sshPassword) return Response.json({ ok: false, error: "sshPassword is required" }, { status: 400 });

  console.log(`[VM Create] Parsed Parameters:`, {
    hostname,
    cpuCores,
    memoryMB,
    diskGB,
    os,
    location: hostId,
    sshPassword: "***",
  });

  // Calculate server costs
  const serverSpecs: ServerSpecs = {
    cpuCores,
    memoryGB: memoryMB / 1024,
    diskGB: diskGB || 20,
    location: hostId
  };

  const hourlyCost = calculateHourlyCost(serverSpecs);
  const minimumHours = 1;

  // IP auto-assign from DB pools if not provided
  let ipPrimary: string | undefined = body.ipPrimary ? String(body.ipPrimary) : undefined;
  let macAddress: string | undefined = body.mac ? String(body.mac) : undefined;

  try {
    const { data: usedRows } = await supabase.from("servers").select("ip");
    const usedSet = new Set<string>((usedRows || []).map((r: Record<string, unknown>) => String(r.ip)));

    const { data: pools } = await supabase
      .from("public_ip_pools")
      .select("id, mac")
      .eq("host_id", cfg.id);
    const poolIds = (pools || []).map((p: Record<string, unknown>) => Number(p.id));
    const macByPool = new Map<number, string | undefined>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), p.mac as string | undefined]));

    const candidates: PoolItem[] = [];
    if (poolIds.length > 0) {
      const { data: ipRows } = await supabase
        .from("public_ip_pool_ips")
        .select("pool_id, ip")
        .in("pool_id", poolIds);
      for (const r of ipRows || []) {
        const poolId = Number((r as Record<string, unknown>).pool_id);
        const ip = String((r as Record<string, unknown>).ip);
        const mac = macByPool.get(poolId);
        if (!usedSet.has(ip)) candidates.push({ ip, mac, poolId });
      }
    }

    if (!ipPrimary) ipPrimary = candidates[0]?.ip;
    if (!macAddress && ipPrimary) {
      const found = candidates.find((x) => x.ip === ipPrimary);
      macAddress = found?.mac;
    }

    console.log(`[IP Assignment] Assigned IP: ${ipPrimary}, MAC: ${macAddress}`);
  } catch {}

  const gateway = cfg.gateway_ip || undefined;
  const dns1 = cfg.dns_primary || "8.8.8.8";
  const dns2 = cfg.dns_secondary || "1.1.1.1";

  if (!ipPrimary || !gateway) return Response.json({ ok: false, error: "No available IPs or gateway missing" }, { status: 409 });
  if (!macAddress) return Response.json({ ok: false, error: "MAC address required for routed IP" }, { status: 400 });

  const node = cfg.node;
  const storage = cfg.storage || "local";
  const bridge = cfg.bridge || "vmbr0";
  const templateVmidFromDb = cfg.template_vmid || undefined;

  console.log(`[Proxmox Config] Host Config:`, {
    apiBase,
    node,
    storage,
    bridge,
    gateway,
    dns1,
    dns2,
    templateVmidFromDb,
  });

  // Reserve DB record to avoid reuse
  let reservationId: number | null = null;
  const db: DbReservation = { saved: false, id: null, error: null };

  try {
    const { data: existing } = await supabase
      .from("servers")
      .select("id")
      .eq("ip", ipPrimary)
      .limit(1)
      .maybeSingle();
    if (existing) return Response.json({ ok: false, error: "IP already in use" }, { status: 409 });

    const billingStart = new Date();

    console.log('[DB Insert] Attempting to insert server record:', {
      vmid: 0,
      node,
      name: hostname,
      ip: ipPrimary,
      os,
      location: hostId,
      cpu_cores: cpuCores,
      memory_mb: memoryMB,
      disk_gb: diskGB ?? null,
      owner_id: body.ownerId || null,
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("servers")
      .insert({
        vmid: 0,
        node,
        name: hostname,
        ip: ipPrimary,
        os,
        location: hostId,
        cpu_cores: cpuCores,
        memory_mb: memoryMB,
        disk_gb: diskGB ?? null,
        status: "provisioning",
        details: null,
        owner_id: body.ownerId || null,
        owner_email: body.ownerEmail || null,
        hourly_cost: hourlyCost,
        billing_start: billingStart.toISOString(),
      })
      .select("id")
      .single();

    console.log('[DB Insert] Result:', { inserted, insertErr });

    if (insertErr) {
      db.error = insertErr.message;
      console.error('[DB Insert] Full error:', {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
      });
      if (insertErr.message?.toLowerCase().includes("duplicate") || (insertErr as unknown as Record<string, unknown>).code === "23505") {
        return Response.json({ ok: false, error: "IP already in use" }, { status: 409 });
      }
      return Response.json({
        ok: false,
        error: "Failed to reserve IP",
        details: insertErr.message,
        code: insertErr.code,
        db
      }, { status: 500 });
    }
    reservationId = (inserted as Record<string, unknown>)?.id as number ?? null;
    db.saved = true;
    db.id = reservationId;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    db.error = error?.message || String(e);
    return Response.json({ ok: false, error: "DB reservation failed", db }, { status: 500 });
  }

  try {
    const auth = await proxmoxAuthCookie(apiBase, dispatcher, cfg);

    // Resolve template vmid
    let templateVmid = templateVmidFromDb ? Number(templateVmidFromDb) : undefined;
    console.log(`[VM Create] Looking for template with OS="${os}" for host="${cfg.id}"`);

    if (!templateVmid) {
      const { data: t } = await supabase
        .from('proxmox_templates')
        .select('vmid, name, is_active')
        .eq('host_id', cfg.id)
        .ilike('name', String(os))
        .maybeSingle();

      console.log(`[VM Create] ILIKE query result:`, t);
      if (t && typeof t === 'object' && 'vmid' in t) templateVmid = Number((t as Record<string, unknown>).vmid);
    }

    if (!templateVmid) {
      // Fallback guessing
      const listJson = await fetchJson(apiBase, `/api2/json/nodes/${encodeURIComponent(node)}/qemu`, auth, dispatcher);
      const vms = ((listJson as ProxmoxResponse)?.data ?? listJson) as ProxmoxVM[];
      const guess = vms.find((v) => String(v?.name || "").toLowerCase().includes("ubuntu"));
      if (guess?.vmid) templateVmid = Number(guess.vmid);
    }
    if (!templateVmid) {
      return Response.json({ ok: false, error: "No template found. Configure template_vmid for host" }, { status: 400 });
    }

    // Next VMID
    const nextIdJson = await fetchJson(apiBase, "/api2/json/cluster/nextid", auth, dispatcher);
    const newid = Number(((nextIdJson as ProxmoxResponse)?.data ?? nextIdJson) as string);

    console.log(`[Proxmox Clone] New VMID allocated: ${newid}`);

    // Clone
    const clonePayload: Record<string, string | number | boolean> = { newid, name: String(hostname), full: 1, target: String(node), storage: String(storage) };
    console.log(`[Proxmox Clone] Cloning from template VMID ${templateVmid} to new VMID ${newid}`);

    const cloneRes = await postForm<ProxmoxResponse<string>>(
      apiBase,
      `/api2/json/nodes/${encodeURIComponent(String(node))}/qemu/${templateVmid}/clone`,
      clonePayload,
      auth,
      dispatcher
    );
    const upid = cloneRes.data;
    if (!upid) throw new Error("clone did not return task id");
    await waitTask(apiBase, String(node), String(upid), auth, dispatcher);

    // Configure
    const ipConfig0 = `ip=${ipPrimary}/32,gw=${gateway}`;
    const nameservers = `${dns1}${dns2 ? ` ${dns2}` : ""}`;

    const configPayload = {
      cores: cpuCores,
      memory: memoryMB,
      onboot: 1,
      ciuser: "ubuntu",
      cipassword: sshPassword,
      ide2: `${storage}:cloudinit`,
      nameserver: nameservers,
      net0: `virtio=${macAddress},bridge=${bridge}`,
      ipconfig0: ipConfig0,
    };
    console.log(`[Proxmox Config] Configure Payload:`, configPayload);

    await postForm(
      apiBase,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/config`,
      configPayload,
      auth,
      dispatcher
    );

    if (diskGB && diskGB > 0) {
      const resizePayload = { disk: "scsi0", size: `+${diskGB}G` };
      console.log(`[Proxmox Resize] Resize Payload:`, resizePayload);
      try {
        await postForm(
          apiBase,
          `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/resize`,
          resizePayload,
          auth,
          dispatcher
        );
      } catch {}
    }

    const startRes = await postForm<ProxmoxResponse<string>>(
      apiBase,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/status/start`,
      {},
      auth,
      dispatcher
    );
    const startUpid = startRes.data;
    if (startUpid) await waitTask(apiBase, node, startUpid, auth, dispatcher, 60000).catch(() => {});

    let details: Record<string, unknown> | null = null;
    try {
      const cur = await fetchJson(apiBase, `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/status/current`, auth, dispatcher);
      details = (cur as { data?: Record<string, unknown> })?.data ?? (cur as Record<string, unknown>);
    } catch {}

    const responsePayload = {
      ok: true,
      node,
      vmid: newid,
      name: hostname,
      ip: ipPrimary,
      os,
      location: hostId,
      specs: { cpuCores, memoryMB, diskGB },
      status: details?.status || "starting",
      details,
      ssh: { username: "ubuntu", port: 22 },
    } as const;

    try {
      if (reservationId != null) {
        const { error: updErr } = await supabase
          .from("servers")
          .update({ vmid: newid, status: responsePayload.status, details })
          .eq("id", reservationId);
        if (updErr) db.error = updErr.message; else db.saved = true;
      }
    } catch (e: unknown) {
      db.error = e instanceof Error ? e.message : String(e);
    }

    return Response.json({ ...responsePayload, db, pricing: { hourlyCost, initialCharge: hourlyCost * minimumHours } });
  } catch (e: unknown) {
    try {
      if (reservationId != null) {
        await supabase
          .from("servers")
          .update({ status: "failed", details: { error: e instanceof Error ? e.message : String(e) } })
          .eq("id", reservationId);
      }
    } catch {}
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e), errorDetails: serializeError(e) }, { status: 500 });
  }
}
