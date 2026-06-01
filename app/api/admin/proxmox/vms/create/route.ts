import { NextRequest, NextResponse } from "next/server";
import { createWorkerClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { Agent as UndiciAgent } from "undici";
import { calculateHourlyCost, type ServerSpecs } from "@/lib/pricing";
import { addHostRoute, writeCloudInitSnippet } from "@/lib/proxmox-utils";
import { buildCiCustomValue, buildVmNetworkPlan } from "@/lib/proxmox-network";
import { allocateVmacForIp, isRoutedPool } from "@/lib/proxmox/on-demand-vmac";
import { pickBestStorage } from "@/lib/proxmox/storage-picker";

export const dynamic = "force-dynamic";

interface CreateVMRequest {
  hostId: string;
  name: string;
  node: string;
  cpuCores: number;
  memoryMB: number;
  diskGB: number;
  sshPassword: string;    // Used for both SSH (Linux) and RDP (Windows)
  templateVmid?: number;
  storage?: string;
  bridge?: string;
  os?: string;            // e.g. "Ubuntu 24.04 LTS" or "Windows Server 2025"
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
  provider?: string | null;
  server_series?: string | null;
  network_mode?: string | null;
  vm_private_cidr?: string | null;
  vm_private_gateway?: string | null;
  vm_private_ip_start?: number | null;
  public_prefix_length?: number | null;
  snippet_storage?: string | null;
};

interface ProxmoxResponse<T = unknown> {
  data?: T;
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
  const ticket = ticketJson?.data?.ticket;
  const csrf = ticketJson?.data?.CSRFPreventionToken;
  if (!ticket || !csrf) throw new Error("Missing ticket or CSRF token");
  return { headers: { Cookie: `PVEAuthCookie=${ticket}`, CSRFPreventionToken: csrf } };
  }

  throw new Error("Missing Proxmox credentials");
}

async function fetchJson(apiBase: string, path: string, auth: ProxmoxAuthHeaders, dispatcher?: UndiciAgent): Promise<unknown> {
  const res = await withTimeout(
    fetch(`${apiBase}${path}`, {
      cache: "no-store",
      redirect: "follow",
      headers: auth.headers,
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
  const formBody = new URLSearchParams();
  Object.entries(form).forEach(([k, v]) => formBody.append(k, String(v)));
  const res = await withTimeout(
    fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth.headers },
      body: formBody,
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

// On-demand vMAC allocation.
//
// When network_mode=ovh_failover_vmac and the strict vMAC-pool scan
// found nothing, we look at the routed pools (typically the BYOIP
// block seeded by auto-setup) for an unused IP. For that IP we ask
// OVH to mint a fresh vMAC, wait for the task, persist the new
// (mac, ip) as its own public_ip_pools row, and return it.
//
// Requirements:
//   - host.provider == "ovh"
//   - OVH credentials in env (OVH_APP_KEY / _SECRET / OVH_CONSUMER_KEY)
//   - the IP must already be attached as an additional IP on the
//     server in OVH (i.e. createVirtualMac succeeds). If the BYOIP
//     block isn't attached, OVH rejects and we surface the error.
async function allocateOnDemandVmac(args: {
  supabase: Awaited<ReturnType<typeof createWorkerClient>>;
  host: HostConfig;
  ipRows: Array<Record<string, unknown>>;
  usedSet: Set<string>;
  macByPool: Map<number, string | undefined>;
  labelByPool: Map<number, string | null>;
  isRoutedPool: (mac?: string, label?: string | null) => boolean;
}): Promise<{ ip: string; mac: string } | null> {
  // First unused IP in a routed pool
  for (const r of args.ipRows) {
    const ip = String((r as Record<string, unknown>).ip);
    const poolId = Number((r as Record<string, unknown>).pool_id);
    const mac = args.macByPool.get(poolId);
    const label = args.labelByPool.get(poolId);
    if (!args.isRoutedPool(mac, label)) continue;
    if (args.usedSet.has(ip)) continue;
    return allocateVmacForIp({
      supabase: args.supabase,
      host: { id: args.host.id, host_url: args.host.host_url, provider: args.host.provider },
      ip,
    });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await checkAdminAuth();
  if (!authorized || !user) {
    return NextResponse.json(
      { ok: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as CreateVMRequest;

    // Determine OS type
    const os = body.os || "Ubuntu 24.04 LTS";
    const osLower = os.toLowerCase();
    const isWindows = osLower.includes("windows") || osLower.includes("win");
    const isDesktop = osLower.includes("desktop");
    const usesRDP = isWindows || isDesktop;

    // Validate required fields
    if (!body.hostId || !body.name || !body.node || !body.sshPassword) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: hostId, name, node, password" },
        { status: 400 }
      );
    }

    // Strict hostname validation — alphanumeric, hyphens, 1-63 chars
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(body.name)) {
      return NextResponse.json(
        { ok: false, error: "VM name must be alphanumeric with hyphens, 1-63 characters" },
        { status: 400 }
      );
    }

    if (!body.cpuCores || body.cpuCores < 1 || body.cpuCores > 64) {
      return NextResponse.json({ ok: false, error: "Invalid cpuCores (1-64)" }, { status: 400 });
    }

    if (!body.memoryMB || body.memoryMB < 512 || body.memoryMB > 262144) {
      return NextResponse.json({ ok: false, error: "Invalid memoryMB (512-262144)" }, { status: 400 });
    }

    // Windows/Desktop requires minimum 2GB RAM
    if ((isWindows || isDesktop) && body.memoryMB < 2048) {
      return NextResponse.json({ ok: false, error: "Windows/Desktop requires minimum 2048 MB (2 GB) memory" }, { status: 400 });
    }

    if (!body.diskGB || body.diskGB < 10 || body.diskGB > 2000) {
      return NextResponse.json({ ok: false, error: "Invalid diskGB (10-2000)" }, { status: 400 });
    }

    // Windows requires minimum 40GB disk
    if (isWindows && body.diskGB < 40) {
      return NextResponse.json({ ok: false, error: "Windows requires minimum 40 GB disk" }, { status: 400 });
    }

    // Password strength validation
    if (body.sshPassword.length < 12) {
      return NextResponse.json({ ok: false, error: "Password must be at least 12 characters" }, { status: 400 });
    }
    if (isWindows) {
      const hasUpper = /[A-Z]/.test(body.sshPassword);
      const hasLower = /[a-z]/.test(body.sshPassword);
      const hasDigit = /[0-9]/.test(body.sshPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(body.sshPassword);
      const complexityCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
      if (complexityCount < 3) {
        return NextResponse.json({
          ok: false,
          error: "Windows password must contain at least 3 of: uppercase, lowercase, digit, special character"
        }, { status: 400 });
      }
    }

    const supabase = await createWorkerClient();

    // Verify host exists and is active
    const { data: host, error: hostErr } = await supabase
      .from("proxmox_hosts")
      .select("id, name, host_url, allow_insecure_tls, node, storage, bridge, template_vmid, gateway_ip, dns_primary, dns_secondary, token_id, token_secret, username, password, provider, server_series, network_mode, vm_private_cidr, vm_private_gateway, vm_private_ip_start, public_prefix_length, snippet_storage")
      .eq("id", body.hostId)
      .eq("is_active", true)
      .single();

    if (hostErr || !host) {
      return NextResponse.json({ ok: false, error: "Host not found or inactive" }, { status: 404 });
    }

    const cfg = host as HostConfig;
    const allowInsecure = !!cfg.allow_insecure_tls;
    const dispatcher = allowInsecure ? new UndiciAgent({ connect: { rejectUnauthorized: false } }) : undefined;
    const apiBase = (cfg.host_url.startsWith("http:") ? cfg.host_url.replace(/^http:/, "https:") : cfg.host_url).replace(/\/+$/, "");
    const node = cfg.node;
    // If the admin pinned a specific storage in body.storage, honor it.
    // Otherwise auto-pick the storage with the most free space across
    // every disk that accepts VM disk content.
    let storage: string;
    if (body.storage) {
      storage = body.storage;
    } else {
      const pick = await pickBestStorage({
        hostUrl: cfg.host_url,
        username: cfg.username || "root",
        password: cfg.password || "",
        node: cfg.node,
        requiredGB: body.diskGB || 20,
        allowInsecure: !!cfg.allow_insecure_tls,
        fallback: cfg.storage || "local",
      });
      storage = pick.storage;
      if (pick.reason === "fallback-no-fit") {
        return NextResponse.json({
          ok: false,
          error: `No storage with ${body.diskGB || 20} GB free on this host.`,
        }, { status: 409 });
      }
      console.log(`[Admin VM Create] storage=${storage} (${pick.reason})`);
    }
    const bridgeOverride = body.bridge || undefined;

    // IP auto-assign from pools
    let assignedIp: string | undefined;
    let macAddress: string | undefined;

    const { data: usedRows } = await supabase.from("servers").select("ip");
    const usedSet = new Set<string>((usedRows || []).map((r: Record<string, unknown>) => String(r.ip)));

    const { data: pools } = await supabase
      .from("public_ip_pools")
      .select("id, mac, label, is_active")
      .eq("host_id", cfg.id)
      .neq("is_active", false);

    const vmacMode = cfg.network_mode === "ovh_failover_vmac";

    if (pools && pools.length > 0) {
      const poolIds = pools.map((p: Record<string, unknown>) => Number(p.id));
      const macByPool = new Map<number, string | undefined>(
        pools.map((p: Record<string, unknown>) => [Number(p.id), p.mac as string | undefined])
      );
      const labelByPool = new Map<number, string | null>(
        pools.map((p: Record<string, unknown>) => [Number(p.id), (p.label as string | null) || null])
      );
      const routedMode = cfg.network_mode === "ovh_hg_scale_routed" || cfg.network_mode === "ovh_advance_gen3_routed" || cfg.network_mode === "ovh_vrack_block";

      const { data: ipRows } = await supabase
        .from("public_ip_pool_ips")
        .select("pool_id, ip")
        .in("pool_id", poolIds);

      for (const r of ipRows || []) {
        const ip = String((r as Record<string, unknown>).ip);
        const poolId = Number((r as Record<string, unknown>).pool_id);
        const mac = macByPool.get(poolId);
        const label = labelByPool.get(poolId);
        const routedPool = isRoutedPool(mac, label);
        if (routedMode && !routedPool) continue;
        if (!routedMode && routedPool) continue;
        if (!usedSet.has(ip)) {
          assignedIp = ip;
          macAddress = routedPool ? undefined : mac;
          break;
        }
      }

      // On-demand vMAC allocation:
      // If we're in vMAC mode (ovh_failover_vmac) on an OVH host and the
      // strict vMAC-pool scan found nothing, fall back to the routed pool
      // (typically the BYOIP block seeded by auto-setup). For the next
      // unused routed IP we'll mint a fresh vMAC via the OVH API, persist
      // it as its own (mac, ip) pool row, and hand both back to the VM.
      // This is the "vMAC per IP, on demand" flow.
      if (!assignedIp && vmacMode && (cfg.provider || "ovh") === "ovh") {
        const allocation = await allocateOnDemandVmac({
          supabase,
          host: cfg,
          ipRows: ipRows || [],
          usedSet,
          macByPool,
          labelByPool,
          isRoutedPool,
        });
        if (allocation) {
          assignedIp = allocation.ip;
          macAddress = allocation.mac;
        }
      }
    }

    if (!assignedIp) {
      return NextResponse.json(
        {
          ok: false,
          error:
            vmacMode
              ? "No available IPs (vMAC pool empty and on-demand allocation failed — is the BYOIP block attached as additional IPs in OVH?)"
              : "No available IPs",
        },
        { status: 409 }
      );
    }
    const modeWithoutRequiredMac = new Set(["ovh_hg_scale_routed", "ovh_advance_gen3_routed", "ovh_vrack_block"]);
    if (!macAddress && !modeWithoutRequiredMac.has(String(cfg.network_mode || "legacy_public_gateway"))) {
      return NextResponse.json({ ok: false, error: "MAC address required for this network profile" }, { status: 400 });
    }

    // Calculate pricing
    const serverSpecs: ServerSpecs = {
      cpuCores: body.cpuCores,
      memoryGB: body.memoryMB / 1024,
      diskGB: body.diskGB,
      location: body.hostId,
    };
    const hourlyCost = calculateHourlyCost(serverSpecs);

    // Reserve DB record
    const { data: existing } = await supabase
      .from("servers")
      .select("id")
      .eq("ip", assignedIp)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: false, error: "IP already in use" }, { status: 409 });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("servers")
      .insert({
        vmid: 0,
        node,
        name: body.name,
        ip: assignedIp,
        os,
        location: body.hostId,
        cpu_cores: body.cpuCores,
        memory_mb: body.memoryMB,
        disk_gb: body.diskGB,
        status: "provisioning",
        owner_email: user.email,
        hourly_cost: hourlyCost,
        billing_start: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: "Failed to reserve server record" }, { status: 500 });
    }

    const reservationId = (inserted as Record<string, unknown>)?.id as number;

    try {
      const auth = await proxmoxAuthCookie(apiBase, dispatcher, cfg);

      // Resolve template VMID
      let templateVmid = body.templateVmid ? Number(body.templateVmid) : undefined;

      if (!templateVmid) {
        // Search proxmox_templates by OS type
        const osTypeSearch = isWindows ? "windows" : "ubuntu";
        const { data: t } = await supabase
          .from("proxmox_templates")
          .select("vmid, name, os_type, is_active")
          .eq("host_id", cfg.id)
          .eq("is_active", true)
          .ilike("os_type", `%${osTypeSearch}%`)
          .limit(1)
          .maybeSingle();

        if (t && typeof t === "object" && "vmid" in t) {
          templateVmid = Number((t as Record<string, unknown>).vmid);
        }
      }

      if (!templateVmid && cfg.template_vmid) {
        templateVmid = cfg.template_vmid;
      }

      if (!templateVmid) {
        throw new Error(`No ${isWindows ? "Windows" : "Ubuntu"} template found. Configure a template for this host.`);
      }

      // Get next available VMID
      const nextIdJson = await fetchJson(apiBase, "/api2/json/cluster/nextid", auth, dispatcher);
      const newVmid = Number(((nextIdJson as ProxmoxResponse)?.data ?? nextIdJson) as string);

      // Clone template
      const cloneRes = await postForm<ProxmoxResponse<string>>(
        apiBase,
        `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${templateVmid}/clone`,
        { newid: newVmid, name: body.name, full: 1, target: node, storage },
        auth,
        dispatcher
      );
      const cloneUpid = cloneRes.data;
      if (!cloneUpid) throw new Error("Clone did not return task ID");
      await waitTask(apiBase, node, String(cloneUpid), auth, dispatcher);

      // Configure VM — different settings for Windows vs Linux
      const networkPlan = buildVmNetworkPlan({
        host: { ...cfg, bridge: bridgeOverride || cfg.bridge },
        publicIp: assignedIp,
        vmid: newVmid,
        reservationId,
        isWindows,
      });
      if (networkPlan.networkSnippetFilename && networkPlan.networkSnippetContent) {
        await writeCloudInitSnippet(cfg as Parameters<typeof writeCloudInitSnippet>[0], networkPlan.networkSnippetFilename, networkPlan.networkSnippetContent);
      }
      if (networkPlan.vendorSnippetFilename && networkPlan.vendorSnippetContent) {
        await writeCloudInitSnippet(cfg as Parameters<typeof writeCloudInitSnippet>[0], networkPlan.vendorSnippetFilename, networkPlan.vendorSnippetContent);
      }
      const ipConfig0 = networkPlan.ipconfig0;
      const nameservers = networkPlan.nameservers;
      const bridge = networkPlan.bridge;

      // Bandwidth rate limit (MBps) based on vCPU count
      const rateMBps = body.cpuCores <= 2 ? 4 : body.cpuCores <= 4 ? 8 : body.cpuCores <= 6 ? 15 : 30;

      const configPayload: Record<string, string | number | boolean> = {
        cpu: 'host',
        sockets: 1,
        cores: body.cpuCores,
        memory: body.memoryMB,
        ciupgrade: 0,
        onboot: 1,
        nameserver: nameservers,
        net0: `${macAddress ? `virtio=${macAddress}` : "virtio"},bridge=${bridge},rate=${rateMBps}`,
        ipconfig0: ipConfig0,
        cipassword: body.sshPassword,
      };

      // Delete inherited vcpus so total = sockets * cores
      try {
        await postForm(
          apiBase,
          `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newVmid}/config`,
          { delete: "vcpus" },
          auth,
          dispatcher
        );
      } catch {}

      const isDebian = osLower.includes("debian");
      const isCentos = osLower.includes("centos");
      if (isWindows) {
        configPayload.ciuser = "admin";
      } else {
        configPayload.ciuser = isDebian ? "debian" : isCentos ? "centos" : "ubuntu";
        const vendorSnippet = networkPlan.cicustomVendor || `vendor=${networkPlan.snippetStorage}:snippets/linux-cloud-init.yml`;
        const cicustom = buildCiCustomValue({
          networkSnippet: networkPlan.cicustomNetwork,
          vendorSnippet,
        });
        if (cicustom) configPayload.cicustom = cicustom;
      }

      await postForm(
        apiBase,
        `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newVmid}/config`,
        configPayload,
        auth,
        dispatcher
      );

      // Resize disk if specified
      if (body.diskGB && body.diskGB > 0) {
        // Detect the primary disk — Windows templates typically use ide0, Linux uses scsi0
        let primaryDisk = "scsi0";
        try {
          const vmConfig = await fetchJson(apiBase, `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newVmid}/config`, auth, dispatcher);
          const cfgData = (vmConfig as { data?: Record<string, unknown> })?.data ?? (vmConfig as Record<string, unknown>);
          if (cfgData && typeof cfgData === "object") {
            if ("ide0" in cfgData && typeof cfgData.ide0 === "string" && !cfgData.ide0.includes("media=cdrom") && !cfgData.ide0.includes("cloudinit")) {
              primaryDisk = "ide0";
            } else if ("virtio0" in cfgData) {
              primaryDisk = "virtio0";
            }
          }
        } catch {}
        try {
          const resizeBody = new URLSearchParams();
          resizeBody.append('disk', primaryDisk);
          resizeBody.append('size', `+${body.diskGB}G`);
          await withTimeout(
            fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newVmid}/resize`, {
              method: "PUT",
              headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth.headers },
              body: resizeBody,
              redirect: "follow",
              // @ts-expect-error undici dispatcher
              dispatcher,
            })
          );
        } catch { /* resize is best-effort */ }
      }

      // Regenerate cloud-init ISO so new ciuser/cipassword/ipconfig take effect
      try {
        await withTimeout(
          fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newVmid}/cloudinit`, {
            method: "PUT",
            headers: { ...auth.headers },
            // @ts-expect-error undici dispatcher
            dispatcher,
          })
        );
      } catch {}

      if (networkPlan.addHostRoute) {
        await addHostRoute(cfg as Parameters<typeof addHostRoute>[0], assignedIp, bridge);
      }

      // Start VM
      const startRes = await postForm<ProxmoxResponse<string>>(
        apiBase,
        `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${newVmid}/status/start`,
        {},
        auth,
        dispatcher
      );
      const startUpid = startRes.data;
      if (startUpid) {
        await waitTask(apiBase, node, String(startUpid), auth, dispatcher, 60000).catch(() => {});
      }

      // Update DB record with actual VMID
      await supabase
        .from("servers")
        .update({ vmid: newVmid, status: "running", details: { network: networkPlan.details } })
        .eq("id", reservationId);

      return NextResponse.json({
        ok: true,
        vmid: newVmid,
        name: body.name,
        ip: assignedIp,
        os,
        specs: { cpuCores: body.cpuCores, memoryMB: body.memoryMB, diskGB: body.diskGB },
        ...(usesRDP
          ? { rdp: { username: isWindows ? "admin" : "ubuntu", port: 3389 }, accessType: "rdp" }
          : { ssh: { username: isDebian ? "debian" : "ubuntu", port: 22 }, accessType: "ssh" }
        ),
        message: `VM ${body.name} provisioned successfully`,
        pricing: { hourlyCost },
      });
    } catch (provisionErr) {
      // Mark as failed in DB
      await supabase
        .from("servers")
        .update({ status: "failed", details: { error: provisionErr instanceof Error ? provisionErr.message : String(provisionErr) } })
        .eq("id", reservationId);

      return NextResponse.json(
        { ok: false, error: "VM provisioning failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Admin VM Create] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "VM creation failed" },
      { status: 500 }
    );
  }
}
