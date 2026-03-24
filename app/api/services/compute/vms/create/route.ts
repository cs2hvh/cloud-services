import { NextRequest, after } from "next/server";
import { Agent as UndiciAgent } from "undici";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { calculateHourlyCost, type ServerSpecs } from "@/lib/pricing";
import { addHostRoute } from "@/lib/proxmox-utils";

export const dynamic = "force-dynamic";

// Type definitions
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
  const rawUsername = host.username || undefined;
  const password = host.password || undefined;

  // Prefer password/ticket auth — API tokens often lack VM.Clone and other mutating permissions
  if (rawUsername && password) {
    const username = rawUsername.includes("@") ? rawUsername : `${rawUsername}@pam`;
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

  // Fallback to API token if no password credentials
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

  throw new Error("Missing Proxmox credentials in DB");
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
  // Authenticate the user via session cookie
  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const region = String(body.region || "");
  if (!region) return Response.json({ ok: false, error: "region is required" }, { status: 400 });

  const supabase = await createWorkerClient();

  // --- Smart host selection ---
  // 1. Find all active hosts in the requested region
  const { data: regionHosts, error: regionErr } = await supabase
    .from("proxmox_hosts")
    .select("*")
    .eq("region", region)
    .eq("is_active", true);

  if (regionErr) {
    console.error("[VM Create] Region query failed:", regionErr.message);
    return Response.json({ ok: false, error: "Unable to check available regions. Please try again later." }, { status: 500 });
  }
  if (!regionHosts || regionHosts.length === 0) {
    return Response.json({ ok: false, error: "This region is currently unavailable. Please select a different region." }, { status: 404 });
  }

  const rawHostname = body.hostname ? String(body.hostname) : `vm-${Date.now()}`;
  // Strict hostname validation — alphanumeric, hyphens, 1-63 chars
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(rawHostname)) {
    return Response.json({ ok: false, error: "Server name must only contain letters, numbers, and hyphens (1-63 characters)." }, { status: 400 });
  }
  const hostname = rawHostname;
  const sshPassword = body.sshPassword as string | undefined;
  const cpuCores = Number(body.cpuCores || 2);
  const memoryMB = Number(body.memoryMB || 2048);
  const diskGB = body.diskGB ? Number(body.diskGB) : undefined;
  const os = body.os || "Ubuntu 24.04 LTS";

  // Validate spec ranges
  if (cpuCores < 1 || cpuCores > 32) return Response.json({ ok: false, error: "CPU cores must be between 1 and 32." }, { status: 400 });
  if (memoryMB < 512 || memoryMB > 262144) return Response.json({ ok: false, error: "Memory must be between 512 MB and 256 GB." }, { status: 400 });
  if (diskGB !== undefined && (diskGB < 10 || diskGB > 2000)) return Response.json({ ok: false, error: "Disk size must be between 10 GB and 2 TB." }, { status: 400 });

  // Determine if this is a Windows VM based on the OS name
  const osLower = String(os).toLowerCase();
  const isWindows = osLower.includes("windows") || osLower.includes("win");
  const isDesktop = osLower.includes("desktop");
  const usesRDP = isWindows || isDesktop;

  // Windows/Desktop-specific minimums
  if ((isWindows || isDesktop) && memoryMB < 2048) return Response.json({ ok: false, error: `${isWindows ? "Windows" : "Desktop"} servers require at least 2 GB of memory.` }, { status: 400 });
  if (isWindows && diskGB !== undefined && diskGB < 40) return Response.json({ ok: false, error: "Windows servers require at least 40 GB of disk space." }, { status: 400 });
  if (isDesktop && !isWindows && diskGB !== undefined && diskGB < 25) return Response.json({ ok: false, error: "Desktop servers require at least 25 GB of disk space." }, { status: 400 });

  if (!sshPassword) return Response.json({ ok: false, error: "Password is required." }, { status: 400 });

  // Password validation — enforce strong passwords especially for Windows RDP
  if (sshPassword.length < 12) {
    return Response.json({ ok: false, error: "Password must be at least 12 characters" }, { status: 400 });
  }
  if (usesRDP) {
    const hasUpper = /[A-Z]/.test(sshPassword);
    const hasLower = /[a-z]/.test(sshPassword);
    const hasDigit = /[0-9]/.test(sshPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(sshPassword);
    const complexityCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    if (complexityCount < 3) {
      return Response.json({
        ok: false,
        error: "Password must include at least 3 of: uppercase letter, lowercase letter, number, special character."
      }, { status: 400 });
    }
  }

  // --- Smart host selection: pick the best host that has ---
  //   1) A matching OS template (by os_display_name or name)
  //   2) Available IPs
  //   3) Enough CPU/RAM/disk capacity

  // Get templates that match the requested OS across all region hosts
  const regionHostIds = regionHosts.map(h => h.id);
  const { data: matchingTemplates } = await supabase
    .from("proxmox_templates")
    .select("vmid, name, host_id, os_type, os_display_name")
    .in("host_id", regionHostIds)
    .eq("is_active", true);

  const templatesByHost = new Map<string, { vmid: number; name: string }>();
  for (const t of matchingTemplates || []) {
    const displayName = t.os_display_name || t.name;
    if (displayName === os) {
      templatesByHost.set(t.host_id, { vmid: t.vmid, name: t.name });
    }
  }

  // Get used resources per host
  const { data: serverUsage } = await supabase
    .from("servers")
    .select("location, cpu_cores, memory_mb, disk_gb")
    .in("location", regionHostIds)
    .in("status", ["provisioning", "running", "stopped", "suspended"]);

  const usedByHost = new Map<string, { cpu: number; mem: number; disk: number }>();
  for (const s of serverUsage || []) {
    const loc = String(s.location);
    const prev = usedByHost.get(loc) || { cpu: 0, mem: 0, disk: 0 };
    prev.cpu += Number(s.cpu_cores || 0);
    prev.mem += Number(s.memory_mb || 0);
    prev.disk += Number(s.disk_gb || 0);
    usedByHost.set(loc, prev);
  }

  // Get available IPs per host
  const { data: usedIpRows } = await supabase.from("servers").select("ip")
    .in("status", ["provisioning", "running", "stopped", "suspended"]);
  const usedIpSet = new Set<string>((usedIpRows || []).map((r: Record<string, unknown>) => String(r.ip)));

  const { data: pools } = await supabase
    .from("public_ip_pools")
    .select("id, mac, host_id, label")
    .in("host_id", regionHostIds)
    .or("label.is.null,label.not.ilike.*IPXO*");
  const poolIds = (pools || []).map((p: Record<string, unknown>) => Number(p.id));
  const macByPool = new Map<number, string | undefined>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), p.mac as string | undefined]));
  const hostByPool = new Map<number, string>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), String(p.host_id)]));

  // Build available IP list per host
  const ipCandidatesByHost = new Map<string, PoolItem[]>();
  if (poolIds.length > 0) {
    const { data: ipRows } = await supabase
      .from("public_ip_pool_ips")
      .select("pool_id, ip")
      .in("pool_id", poolIds);
    for (const r of ipRows || []) {
      const poolId = Number((r as Record<string, unknown>).pool_id);
      const ip = String((r as Record<string, unknown>).ip);
      const mac = macByPool.get(poolId);
      const hostId = hostByPool.get(poolId);
      if (!usedIpSet.has(ip) && hostId) {
        const list = ipCandidatesByHost.get(hostId) || [];
        list.push({ ip, mac, poolId });
        ipCandidatesByHost.set(hostId, list);
      }
    }
  }

  // Score and rank hosts — pick the one with the most headroom
  type HostCandidate = {
    host: typeof regionHosts[0];
    template: { vmid: number; name: string };
    ip: PoolItem;
    freeCpu: number;
    freeMem: number;
    freeDisk: number;
  };

  const candidates: HostCandidate[] = [];
  const requestedDisk = diskGB || 20;

  for (const h of regionHosts) {
    // Must have matching template
    const tpl = templatesByHost.get(h.id);
    if (!tpl) continue;

    // Must have available IPs
    const ips = ipCandidatesByHost.get(h.id);
    if (!ips || ips.length === 0) continue;

    // Must have enough capacity
    const used = usedByHost.get(h.id) || { cpu: 0, mem: 0, disk: 0 };
    const freeCpu = (h.total_cpu_cores || 0) - used.cpu;
    const freeMem = (h.total_memory_mb || 0) - used.mem;
    const freeDisk = (h.total_disk_gb || 0) - used.disk;

    if (freeCpu < cpuCores) continue;
    if (freeMem < memoryMB) continue;
    if (freeDisk < requestedDisk) continue;

    candidates.push({ host: h, template: tpl, ip: ips[0], freeCpu, freeMem, freeDisk });
  }

  if (candidates.length === 0) {
    return Response.json({
      ok: false,
      error: "This region is currently at capacity. Please try a different region or a smaller configuration."
    }, { status: 409 });
  }

  // Pick the best host: most free resources (simple scoring: % free weighted)
  candidates.sort((a, b) => {
    const scoreA = a.freeCpu + (a.freeMem / 1024) + (a.freeDisk / 100);
    const scoreB = b.freeCpu + (b.freeMem / 1024) + (b.freeDisk / 100);
    return scoreB - scoreA;
  });

  const selected = candidates[0];
  const cfg = selected.host as unknown as HostConfig;
  const selectedTemplate = selected.template;
  const ipPrimary = selected.ip.ip;
  const macAddress = selected.ip.mac;
  const hostId = cfg.id;

  if (!macAddress) {
    console.error("[VM Create] No MAC address for IP:", ipPrimary);
    return Response.json({ ok: false, error: "Network configuration error. Please contact support." }, { status: 500 });
  }

  const allowInsecure = !!cfg.allow_insecure_tls;
  const dispatcher = allowInsecure ? new UndiciAgent({ connect: { rejectUnauthorized: false } }) : undefined;
  const apiBase = (cfg.host_url.startsWith("http:") ? cfg.host_url.replace(/^http:/, "https:") : cfg.host_url).replace(/\/+$/, "");

  // Calculate server costs
  const serverSpecs: ServerSpecs = {
    cpuCores,
    memoryGB: memoryMB / 1024,
    diskGB: diskGB || 20,
    location: hostId
  };

  const hourlyCost = calculateHourlyCost(serverSpecs);
  const minimumHours = 1;

  const gateway = cfg.gateway_ip || undefined;
  const dns1 = cfg.dns_primary || "8.8.8.8";
  const dns2 = cfg.dns_secondary || "1.1.1.1";

  if (!gateway) {
    console.error("[VM Create] Gateway missing on host:", hostId);
    return Response.json({ ok: false, error: "Network configuration error. Please contact support." }, { status: 500 });
  }

  const node = cfg.node;
  const storage = cfg.storage || "local";
  const bridge = cfg.bridge || "vmbr0";

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
    if (existing) return Response.json({ ok: false, error: "Resources temporarily unavailable. Please try again." }, { status: 409 });

    const billingStart = new Date();

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
        disk_gb: diskGB || 20,
        status: "provisioning",
        details: {
          provisioning: {
            stage: 'allocating',
            progress: 10,
            message: 'Reserving resources...',
            started_at: new Date().toISOString(),
          }
        },
        owner_id: user.id,
        owner_email: user.email || null,
        hourly_cost: hourlyCost,
        billing_start: billingStart.toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      db.error = insertErr.message;
      if (insertErr.message?.toLowerCase().includes("duplicate") || (insertErr as unknown as Record<string, unknown>).code === "23505") {
        return Response.json({ ok: false, error: "Resources temporarily unavailable. Please try again." }, { status: 409 });
      }
      return Response.json({ ok: false, error: "Unable to reserve your server. Please try again later." }, { status: 500 });
    }
    reservationId = (inserted as Record<string, unknown>)?.id as number ?? null;
    db.saved = true;
    db.id = reservationId;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    db.error = error?.message || String(e);
    console.error("[VM Create] DB reservation failed:", db.error);
    return Response.json({ ok: false, error: "Unable to reserve your server. Please try again later." }, { status: 500 });
  }

  // Determine connection type for immediate response
  const isDebian = osLower.includes("debian");
  const ciuser = isWindows ? "admin" : isDebian ? "debian" : "ubuntu";
  const provisioningStarted = new Date().toISOString();

  // Helper to update provisioning stage (triggers Supabase realtime events)
  const updateStage = async (stage: string, progress: number, message: string) => {
    if (reservationId == null) return;
    try {
      await supabase.from("servers").update({
        details: {
          provisioning: { stage, progress, message, started_at: provisioningStarted, updated_at: new Date().toISOString() }
        },
      }).eq("id", reservationId);
    } catch {}
  };

  // Schedule background provisioning — runs after response is sent
  after(async () => {
  try {
    await updateStage('cloning', 25, 'Creating disk image...');
    const auth = await proxmoxAuthCookie(apiBase, dispatcher, cfg);

    // Use the template VMID from smart selection
    const templateVmid = selectedTemplate.vmid;

    // Next VMID
    const nextIdJson = await fetchJson(apiBase, "/api2/json/cluster/nextid", auth, dispatcher);
    const newid = Number(((nextIdJson as ProxmoxResponse)?.data ?? nextIdJson) as string);

    // Clone
    const clonePayload: Record<string, string | number | boolean> = { newid, name: String(hostname), full: 1, target: String(node), storage: String(storage) };

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

    await updateStage('configuring', 50, 'Configuring hardware...');

    // Configure — different approach for Windows vs Linux
    const ipConfig0 = `ip=${ipPrimary}/32,gw=${gateway}`;
    const nameservers = `${dns1}${dns2 ? ` ${dns2}` : ""}`;

    // Bandwidth rate limit (MBps) based on vCPU count
    const rateMBps = cpuCores <= 2 ? 4 : cpuCores <= 4 ? 8 : cpuCores <= 6 ? 15 : 30;

    const configPayload: Record<string, string | number | boolean> = {
      cpu: 'host',
      sockets: 1,
      cores: cpuCores,
      memory: memoryMB,
      onboot: 1,
      nameserver: nameservers,
      net0: `virtio=${macAddress},bridge=${bridge},rate=${rateMBps}`,
      ipconfig0: ipConfig0,
      cipassword: sshPassword,
    };

    // Delete inherited vcpus so total = sockets * cores
    try {
      await postForm(
        apiBase,
        `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/config`,
        { delete: "vcpus" },
        auth,
        dispatcher
      );
    } catch {}

    // Set ciuser based on OS type
    if (isWindows) {
      configPayload.ciuser = "admin";
    } else {
      configPayload.ciuser = isDebian ? "debian" : "ubuntu";
      // Apply vendor cloud-init snippet to enable SSH password auth on Linux VMs
      configPayload.cicustom = "vendor=local:snippets/linux-cloud-init.yml";
    }
    
    await postForm(
      apiBase,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/config`,
      configPayload,
      auth,
      dispatcher
    );

    // Fetch VM config once — used for CD-ROM cleanup + disk detection
    let cfgData: Record<string, unknown> | null = null;
    try {
      const vmConfig = await fetchJson(apiBase, `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/config`, auth, dispatcher);
      cfgData = (vmConfig as { data?: Record<string, unknown> })?.data ?? (vmConfig as Record<string, unknown>);
    } catch {}

    // Remove any CD-ROM / ISO drives inherited from the template (e.g. VirtIO drivers, Windows installer)
    if (cfgData && typeof cfgData === "object") {
      const cdromKeys: string[] = [];
      for (const [key, val] of Object.entries(cfgData)) {
        if (typeof val === "string" && val.includes("media=cdrom") && !val.includes("cloudinit")) {
          cdromKeys.push(key);
        }
      }
      if (cdromKeys.length > 0) {
        try {
          const deletePayload: Record<string, string> = { delete: cdromKeys.join(",") };
          await postForm(
            apiBase,
            `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/config`,
            deletePayload,
            auth,
            dispatcher
          );
          if (process.env.NODE_ENV === "development") console.log(`[Proxmox] Removed CD-ROM drives from VM ${newid}: ${cdromKeys.join(", ")}`);
        } catch (e) {
          console.warn(`[Proxmox] Failed to remove CD-ROM drives:`, e instanceof Error ? e.message : e);
        }
      }
    }

    if (diskGB && diskGB > 0) {
      // Detect the primary disk — Windows templates typically use ide0, Linux uses scsi0
      let primaryDisk = "scsi0";
      if (cfgData && typeof cfgData === "object") {
        if ("ide0" in cfgData && typeof cfgData.ide0 === "string" && !String(cfgData.ide0).includes("media=cdrom") && !String(cfgData.ide0).includes("cloudinit")) {
          primaryDisk = "ide0";
        } else if ("virtio0" in cfgData) {
          primaryDisk = "virtio0";
        }
      }
      const resizePayload = { disk: primaryDisk, size: `+${diskGB}G` };
      try {
        const resizeBody = new URLSearchParams();
        Object.entries(resizePayload).forEach(([k, v]) => resizeBody.append(k, String(v)));
        await withTimeout(
          fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/resize`, {
            method: "PUT",
            headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth.headers },
            body: resizeBody,
            redirect: "follow",
            // @ts-expect-error undici dispatcher
            dispatcher,
          })
        );
      } catch {}
    }

    // Regenerate cloud-init ISO so new ciuser/cipassword/ipconfig take effect
    try {
      await withTimeout(
        fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/cloudinit`, {
          method: "PUT",
          headers: { ...auth.headers },
          // @ts-expect-error undici dispatcher
          dispatcher,
        })
      );
    } catch (e) {
      console.warn(`[Proxmox CloudInit] Regeneration warning:`, e instanceof Error ? e.message : e);
    }

    await updateStage('networking', 70, 'Setting up network...');

    // Add host route for this VM's IP (OVH routed IP model)
    await addHostRoute(cfg as Parameters<typeof addHostRoute>[0], ipPrimary, bridge);

    await updateStage('booting', 85, 'Starting server...');

    const startRes = await postForm<ProxmoxResponse<string>>(
      apiBase,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/status/start`,
      {},
      auth,
      dispatcher
    );
    const startUpid = startRes.data;
    if (startUpid) await waitTask(apiBase, node, startUpid, auth, dispatcher, 60000).catch(() => {});

    await updateStage('verifying', 95, 'Verifying server status...');

    let vmStatus = "running";
    try {
      const cur = await fetchJson(apiBase, `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newid}/status/current`, auth, dispatcher);
      const statusData = (cur as { data?: Record<string, unknown> })?.data ?? (cur as Record<string, unknown>);
      vmStatus = (statusData?.status as string) || "running";
    } catch {}

    // Final update — server is ready
    if (reservationId != null) {
      await supabase
        .from("servers")
        .update({
          vmid: newid,
          status: vmStatus,
          details: {
            provisioning: {
              stage: 'complete',
              progress: 100,
              message: 'Server is ready!',
              started_at: provisioningStarted,
              completed_at: new Date().toISOString(),
            }
          },
        })
        .eq("id", reservationId);
    }
  } catch (e: unknown) {
    console.error("[VM Create] Provisioning failed:", e instanceof Error ? e.message : e);
    try {
      if (reservationId != null) {
        await supabase
          .from("servers")
          .update({
            status: "failed",
            details: {
              provisioning: {
                stage: 'failed',
                progress: 0,
                message: 'Deployment failed. Our team has been notified.',
                started_at: provisioningStarted,
                failed_at: new Date().toISOString(),
              }
            },
          })
          .eq("id", reservationId);
      }
    } catch {}
  }
  }); // end after()

  // Return immediately — client tracks progress via Supabase realtime
  return Response.json({
    ok: true,
    serverId: reservationId,
    name: hostname,
    ip: ipPrimary,
    os,
    region,
    specs: { cpuCores, memoryMB, diskGB: diskGB || 20 },
    status: 'provisioning',
    pricing: { hourlyCost, initialCharge: hourlyCost * minimumHours },
    ...(usesRDP
      ? { rdp: { username: ciuser, port: 3389 } }
      : { ssh: { username: ciuser, port: 22 } }
    ),
  });
}
