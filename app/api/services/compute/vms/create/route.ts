import { NextRequest, after } from "next/server";
import { Agent as UndiciAgent } from "undici";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { calculateHourlyCost, type ServerSpecs } from "@/lib/pricing";
import { addHostRoute, writeCloudInitSnippet } from "@/lib/proxmox-utils";
import { buildCiCustomValue, buildVmNetworkPlan } from "@/lib/proxmox-network";
import { limitByUser } from "@/lib/cooldown/userbased";
import { redis } from "@/lib/redis";
import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotency";
import { BillingCredits } from "@/lib/billing/credits";
import { postProvisionBilling } from "@/config/billing-flow";
import { allocateVmacForIp, isRoutedPool } from "@/lib/proxmox/on-demand-vmac";
import { pickBestStorage } from "@/lib/proxmox/storage-picker";
import { findPlanBySlug } from "@/lib/pricing/plan-catalog";
import { computeHostAvailability } from "@/lib/pricing/instance-plans";

export const dynamic = "force-dynamic";

const MAX_VMS_PER_USER = 25;

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

type ProxmoxFormValue = string | number | boolean | Array<string | number | boolean>;

interface PoolItem {
  ip: string;
  mac?: string;
  poolId: number;
  label?: string | null;
  // When the host is in vMAC failover mode AND this IP comes from the
  // routed BYOIP pool (i.e. no vMAC bound yet), we'll mint one via the
  // OVH API after winning the IP lock and before VM creation.
  needsVmac?: boolean;
}

function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); })
     .catch((e) => { clearTimeout(id); reject(e); });
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeMessage = cause instanceof Error ? `: ${cause.message}` : cause ? `: ${String(cause)}` : "";
    return `${error.message}${causeMessage}`;
  }
  return String(error);
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

async function proxmoxAuthCookie(apiBase: string, dispatcher: UndiciAgent | undefined, host: HostConfig): Promise<ProxmoxAuthHeaders> {
  const tokenId = host.token_id || undefined;
  const tokenSecret = host.token_secret || undefined;
  const rawUsername = host.username || undefined;
  const password = host.password || undefined;

  // Prefer password/ticket auth — API tokens often lack VM.Clone and other mutating permissions
  if (rawUsername && password) {
    const username = rawUsername.includes("@") ? rawUsername : `${rawUsername}@pam`;
    const body = new URLSearchParams({ username, password });
  let ticketRes: Response;
  try {
    ticketRes = await withTimeout(
      fetch(`${apiBase}/api2/json/access/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        redirect: "follow",
        // @ts-expect-error undici dispatcher
        dispatcher,
      })
    );
  } catch (error) {
    throw new Error(`Proxmox login request failed: ${errorMessage(error)}`);
  }
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
  let res: Response;
  try {
    res = await withTimeout(
      fetch(`${apiBase}${path}`, {
        cache: "no-store",
        redirect: "follow",
        headers: init?.headers || {},
        // @ts-expect-error undici dispatcher
        dispatcher,
      })
    );
  } catch (error) {
    throw new Error(`${path} request failed: ${errorMessage(error)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function postForm<T = unknown>(apiBase: string, path: string, form: Record<string, ProxmoxFormValue>, auth: ProxmoxAuthHeaders, dispatcher?: UndiciAgent): Promise<T> {
  const body = new URLSearchParams();
  Object.entries(form).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((item) => body.append(k, String(item)));
    } else {
      body.append(k, String(v));
    }
  });
  let res: Response;
  try {
    res = await withTimeout(
      fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...auth.headers },
        body,
        redirect: "follow",
        // @ts-expect-error undici dispatcher
        dispatcher,
      })
    );
  } catch (error) {
    throw new Error(`${path} request failed: ${errorMessage(error)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

function buildLinuxGuestNetworkScript(args: {
  publicIp: string;
  privateIp: string;
  privatePrefixLength: number;
  privateGateway: string;
  dnsPrimary: string;
  dnsSecondary: string;
}): string {
  return [
    "set -eu",
    `PUB='${args.publicIp}'`,
    `PRIV='${args.privateIp}'`,
    `PREFIX='${args.privatePrefixLength}'`,
    `GW='${args.privateGateway}'`,
    `DNS1='${args.dnsPrimary}'`,
    `DNS2='${args.dnsSecondary}'`,
    "DEV=$(ip -o link show | awk -F': ' '$2 != \"lo\" && $0 ~ /link\\/ether/ {print $2; exit}')",
    "[ -n \"$DEV\" ]",
    "ip link set \"$DEV\" up",
    "ip addr flush dev \"$DEV\" scope global || true",
    "ip addr replace \"$PRIV/$PREFIX\" dev \"$DEV\"",
    "ip addr replace \"$PUB/32\" dev \"$DEV\"",
    "ip route replace default via \"$GW\" dev \"$DEV\" onlink src \"$PUB\"",
    "if [ -d /etc/netplan ]; then",
    "  mkdir -p /etc/netplan /etc/cloud/cloud.cfg.d",
    "  cat > /etc/netplan/99-byoip.yaml <<NETEOF",
    "network:",
    "  version: 2",
    "  ethernets:",
    "    ${DEV}:",
    "      match:",
    "        name: \"${DEV}\"",
    "      addresses:",
    "        - ${PRIV}/${PREFIX}",
    "        - ${PUB}/32",
    "      nameservers:",
    "        addresses:",
    "          - ${DNS1}",
    "          - ${DNS2}",
    "      routes:",
    "        - to: default",
    "          via: ${GW}",
    "          on-link: true",
    "          from: ${PUB}",
    "NETEOF",
    "  chmod 600 /etc/netplan/99-byoip.yaml",
    "  rm -f /etc/netplan/50-cloud-init.yaml",
    "  echo 'network: {config: disabled}' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg",
    "  netplan generate",
    "  netplan apply || true",
    "fi",
    "systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true",
    "ip -4 addr show \"$DEV\"",
    "ip route",
  ].join("\n");
}

async function configureLinuxNetworkViaGuestAgent(args: {
  apiBase: string;
  node: string;
  vmid: number;
  auth: ProxmoxAuthHeaders;
  dispatcher?: UndiciAgent;
  script: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = args.timeoutMs ?? 180000;
  const start = Date.now();
  let lastError = "";

  while (Date.now() - start < timeoutMs) {
    try {
      const exec = await postForm<ProxmoxResponse<{ pid?: number }>>(
        args.apiBase,
        `/api2/json/nodes/${encodeURIComponent(args.node)}/qemu/${args.vmid}/agent/exec`,
        { command: ["/bin/bash", "-lc", args.script], "capture-output": 1 },
        args.auth,
        args.dispatcher
      );
      const pid = Number(exec.data?.pid);
      if (!pid) throw new Error("guest agent exec did not return pid");

      const statusDeadline = Date.now() + 60000;
      while (Date.now() < statusDeadline) {
        const statusJson = await fetchJson(
          args.apiBase,
          `/api2/json/nodes/${encodeURIComponent(args.node)}/qemu/${args.vmid}/agent/exec-status?pid=${encodeURIComponent(String(pid))}`,
          args.auth,
          args.dispatcher
        );
        const status = ((statusJson as ProxmoxResponse)?.data ?? statusJson) as Record<string, unknown>;
        if (status.exited) {
          const exitCode = Number(status.exitcode || 0);
          if (exitCode === 0) return;
          const out = status["out-data"] ? Buffer.from(String(status["out-data"]), "base64").toString("utf8") : "";
          const err = status["err-data"] ? Buffer.from(String(status["err-data"]), "base64").toString("utf8") : "";
          throw new Error(`guest network setup failed (${exitCode}): ${out || err}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw new Error("guest network setup timed out");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  throw new Error(`QEMU guest agent did not configure networking: ${lastError}`);
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

  // Rate limit: max 5 VM creations per 5 minutes per user
  const rl = await limitByUser(user.id, {
    prefix: "rl:vm-create",
    limit: 5,
    windowMs: 300_000,
  });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Too many servers created recently. Please try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  // Idempotency check — prevent duplicate VM creates from double-clicks or retries
  const idempKey = getIdempotencyKey(req.headers);
  let idempComplete: ((data: unknown) => Promise<void>) | null = null;
  if (idempKey) {
    const idemp = await checkIdempotency(`vm-create:${user.id}:${idempKey}`);
    if (idemp.status === "completed") {
      return Response.json(idemp.data, { status: 200 });
    }
    if (idemp.status === "in-progress") {
      return Response.json(
        { ok: false, error: "This request is already being processed. Please wait." },
        { status: 409, headers: { "Retry-After": String(idemp.retryAfter) } }
      );
    }
    // Reserve the key
    const reserved = await idemp.reserve();
    if (!reserved) {
      return Response.json(
        { ok: false, error: "Duplicate request detected. Please wait." },
        { status: 409 }
      );
    }
    idempComplete = idemp.complete;
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const region = String(body.region || "");
  if (!region) return Response.json({ ok: false, error: "region is required" }, { status: 400 });

  const supabase = await createWorkerClient();

  // Per-user VM limit — prevent a single user from exhausting infrastructure
  const { count: existingVMs } = await supabase
    .from("servers")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .in("status", ["provisioning", "running", "stopped", "suspended"]);

  if ((existingVMs || 0) >= MAX_VMS_PER_USER) {
    return Response.json(
      { ok: false, error: `You have reached the maximum of ${MAX_VMS_PER_USER} active servers. Please delete unused servers first.` },
      { status: 429 }
    );
  }

  // --- Smart host selection ---
  // 1. Find all active hosts in the requested region
  const { data: regionHosts, error: regionErr } = await supabase
    .from("proxmox_hosts")
    .select("id, name, host_url, allow_insecure_tls, node, storage, bridge, template_vmid, gateway_ip, dns_primary, dns_secondary, token_id, token_secret, username, password, region, is_active, total_cpu_cores, total_memory_mb, total_disk_gb, shared_oversubscription_ratio, provider, server_series, network_mode, vm_private_cidr, vm_private_gateway, vm_private_ip_start, public_prefix_length, snippet_storage")
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

  // Resolve the spec from a plan slug if supplied; otherwise fall back
  // to the legacy free-form cpuCores/memoryMB/diskGB body fields
  // (kept for backward compatibility while the dashboard rolls over).
  const planSlug = body.planSlug ? String(body.planSlug) : undefined;
  let cpuCores: number;
  let memoryMB: number;
  let diskGB: number | undefined;
  let planTier: "shared" | "dedicated" | null = null;
  let planAllowedHostIds: string[] | null = null; // set when plan has a host whitelist
  // When a plan is selected we bill the plan's ADVERTISED price (what the
  // customer sees + agrees to), not the legacy spec formula. Only the
  // free-form custom-specs path falls back to calculateHourlyCost().
  let planHourlyUSD: number | null = null;

  if (planSlug) {
    const plan = await findPlanBySlug(supabase, planSlug);
    if (!plan) {
      return Response.json({ ok: false, error: `Unknown plan: ${planSlug}` }, { status: 400 });
    }
    if (!plan.isActive) {
      return Response.json({ ok: false, error: `Plan ${planSlug} is no longer available` }, { status: 400 });
    }
    // Enforce region whitelist if the plan has one
    if (plan.allowedRegions && plan.allowedRegions.length > 0 && !plan.allowedRegions.includes(region)) {
      return Response.json({
        ok: false,
        error: `Plan ${planSlug} is not available in this region.`,
      }, { status: 400 });
    }
    cpuCores = plan.vcpu;
    memoryMB = plan.memoryMB;
    diskGB = plan.diskGB;
    planTier = plan.tier;
    planHourlyUSD = plan.defaultHourlyUSD;
    if (plan.allowedHostIds && plan.allowedHostIds.length > 0) {
      planAllowedHostIds = plan.allowedHostIds;
    }
  } else {
    cpuCores = Number(body.cpuCores || 2);
    memoryMB = Number(body.memoryMB || 2048);
    diskGB = body.diskGB ? Number(body.diskGB) : undefined;

    // Validate spec ranges (only enforced on free-form path; plans are validated at admin write time)
    if (cpuCores < 1 || cpuCores > 32) return Response.json({ ok: false, error: "CPU cores must be between 1 and 32." }, { status: 400 });
    if (memoryMB < 512 || memoryMB > 262144) return Response.json({ ok: false, error: "Memory must be between 512 MB and 256 GB." }, { status: 400 });
    if (diskGB !== undefined && (diskGB < 10 || diskGB > 2000)) return Response.json({ ok: false, error: "Disk size must be between 10 GB and 2 TB." }, { status: 400 });
  }
  const os = body.os || "Ubuntu 24.04 LTS";

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

  // Get used resources per host, split by tier so we can apply CPU
  // overcommit only to shared placements (dedicated keeps 1:1).
  const { data: serverUsage } = await supabase
    .from("servers")
    .select("location, cpu_cores, memory_mb, disk_gb, tier")
    .in("location", regionHostIds)
    .in("status", ["provisioning", "running", "stopped", "suspended"]);

  type HostUsage = {
    sharedCpu: number;
    dedicatedCpu: number;
    mem: number;
    disk: number;
  };
  const usedByHost = new Map<string, HostUsage>();
  for (const s of serverUsage || []) {
    const loc = String(s.location);
    const prev = usedByHost.get(loc) || { sharedCpu: 0, dedicatedCpu: 0, mem: 0, disk: 0 };
    const tier = String((s as Record<string, unknown>).tier || "shared");
    const cpu = Number(s.cpu_cores || 0);
    if (tier === "dedicated") prev.dedicatedCpu += cpu;
    else prev.sharedCpu += cpu;
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
    .select("id, mac, host_id, label, is_active")
    .in("host_id", regionHostIds);
  const poolIds = (pools || []).map((p: Record<string, unknown>) => Number(p.id));
  const macByPool = new Map<number, string | undefined>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), p.mac as string | undefined]));
  const hostByPool = new Map<number, string>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), String(p.host_id)]));
  const labelByPool = new Map<number, string | null>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), (p.label as string | null) || null]));
  const activeByPool = new Map<number, boolean>((pools || []).map((p: Record<string, unknown>) => [Number(p.id), (p.is_active as boolean | null) !== false]));

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
      const label = labelByPool.get(poolId);
      const host = regionHosts.find((h) => h.id === hostId);
      const routedMode = host?.network_mode === "ovh_hg_scale_routed" || host?.network_mode === "ovh_advance_gen3_routed" || host?.network_mode === "ovh_vrack_block";
      const vmacMode = host?.network_mode === "ovh_failover_vmac";
      const routedPool = isRoutedPool(mac, label);
      if (!activeByPool.get(poolId)) continue;
      // Routed BYOIP host modes must draw only from routed pools
      if (routedMode && !routedPool) continue;
      // Non-vMAC + non-routed hosts must NOT pick up routed-pool IPs
      if (!routedMode && !vmacMode && routedPool) continue;
      // For vMAC-mode hosts we accept BOTH:
      //   - existing (mac, ip) vMAC pool rows (fast path)
      //   - routed BYOIP pool IPs (we'll mint the vMAC on demand at
      //     VM-create time, then save the new pool row)
      const needsVmac = vmacMode && routedPool;
      if (!usedIpSet.has(ip) && hostId) {
        const list = ipCandidatesByHost.get(hostId) || [];
        list.push({
          ip,
          mac: routedPool ? undefined : mac,
          poolId,
          label,
          needsVmac,
        });
        ipCandidatesByHost.set(hostId, list);
      }
    }
    // Dedupe per host: same IP can appear in BOTH the routed pool AND a
    // vMAC pool (post on-demand allocation we keep the IP in both).
    // Prefer the existing vMAC entry (needsVmac=false) so we reuse the
    // already-provisioned MAC instead of asking OVH for a new one.
    for (const [hostId, list] of ipCandidatesByHost.entries()) {
      const bestByIp = new Map<string, typeof list[number]>();
      for (const item of list) {
        const existing = bestByIp.get(item.ip);
        if (!existing || (!item.needsVmac && existing.needsVmac)) {
          bestByIp.set(item.ip, item);
        }
      }
      ipCandidatesByHost.set(hostId, [...bestByIp.values()]);
    }
  }

  // Score and rank hosts — pick the one with the most headroom
  type HostCandidate = {
    host: typeof regionHosts[0];
    template: { vmid: number; name: string };
    freeCpu: number;
    freeMem: number;
    freeDisk: number;
  };

  const candidates: HostCandidate[] = [];
  const requestedDisk = diskGB || 20;

  // Tier-aware capacity: shared placements use the oversubscribed pool
  // (physical × ratio), dedicated reserves real cores 1:1. See
  // computeHostAvailability for the full model.
  const effectiveTier: "shared" | "dedicated" = planTier === "dedicated" ? "dedicated" : "shared";

  for (const h of regionHosts) {
    // Honor plan's host whitelist (if any)
    if (planAllowedHostIds && !planAllowedHostIds.includes(h.id)) continue;

    // Must have matching template
    const tpl = templatesByHost.get(h.id);
    if (!tpl) continue;

    // Must have available IPs
    const ips = ipCandidatesByHost.get(h.id);
    if (!ips || ips.length === 0) continue;

    const used = usedByHost.get(h.id) || { sharedCpu: 0, dedicatedCpu: 0, mem: 0, disk: 0 };
    const ratio = (h as Record<string, unknown>).shared_oversubscription_ratio
      ? Number((h as Record<string, unknown>).shared_oversubscription_ratio)
      : undefined;

    const avail = computeHostAvailability({
      totalCpuCores: h.total_cpu_cores || 0,
      totalMemoryMB: h.total_memory_mb || 0,
      totalDiskGB: h.total_disk_gb || 0,
      sharedRatio: ratio,
      usage: {
        dedicatedVcpuUsed: used.dedicatedCpu,
        sharedVcpuUsed: used.sharedCpu,
        memoryMBUsed: used.mem,
        diskGBUsed: used.disk,
      },
    });

    const freeCpu = effectiveTier === "dedicated" ? avail.dedicatedVcpu : avail.sharedVcpu;
    const freeMem = avail.memoryMB;
    const freeDisk = avail.diskGB;

    if (freeCpu < cpuCores) continue;
    if (freeMem < memoryMB) continue;
    if (freeDisk < requestedDisk) continue;

    candidates.push({ host: h, template: tpl, freeCpu, freeMem, freeDisk });
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

  // Atomically allocate an IP using Redis locks to prevent race conditions.
  // Two concurrent requests will never get the same IP because only one can
  // acquire the NX lock on a given IP key.
  let selected: typeof candidates[0] | null = null;
  let allocatedIp: PoolItem | null = null;
  let ipLockKey: string | null = null;

  for (const candidate of candidates) {
    const ips = ipCandidatesByHost.get(candidate.host.id) || [];
    for (const ipItem of ips) {
      const lockKey = `ip-alloc:${ipItem.ip}`;
      // NX = set only if not exists, EX = auto-expire after 5 min (covers provisioning time)
      const locked = await redis.set(lockKey, `vm:${user.id}:${Date.now()}`, { nx: true, ex: 300 });
      if (locked) {
        selected = candidate;
        allocatedIp = ipItem;
        ipLockKey = lockKey;
        break;
      }
    }
    if (selected) break;
  }

  if (!selected || !allocatedIp) {
    return Response.json({
      ok: false,
      error: "This region is currently at capacity. Please try a different region or a smaller configuration."
    }, { status: 409 });
  }

  const cfg = selected.host as unknown as HostConfig;
  const selectedTemplate = selected.template;
  const ipPrimary = allocatedIp.ip;
  let macAddress = allocatedIp.mac;
  const hostId = cfg.id;

  // On-demand vMAC minting: if the IP we won the lock for came from the
  // routed BYOIP pool on a vMAC-mode host, we don't have a MAC yet. The
  // 5-minute Redis IP lock comfortably covers the ~30-90s OVH provisioning.
  if (allocatedIp.needsVmac) {
    try {
      const supabaseAdmin = await createWorkerClient();
      const { mac } = await allocateVmacForIp({
        supabase: supabaseAdmin,
        host: { id: cfg.id, host_url: cfg.host_url, provider: cfg.provider },
        ip: ipPrimary,
      });
      macAddress = mac;
    } catch (e) {
      if (ipLockKey) { try { await redis.del(ipLockKey); } catch { /* ignore */ } }
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("[VM Create] On-demand vMAC failed:", errMsg);
      return Response.json({
        ok: false,
        error:
          `Could not allocate a vMAC for ${ipPrimary}: ${errMsg}. ` +
          `If this persists, check that the BYOIP block is attached as additional IPs on the OVH server.`,
      }, { status: 502 });
    }
  }

  const modeWithoutRequiredMac = new Set(["ovh_hg_scale_routed", "ovh_advance_gen3_routed", "ovh_vrack_block"]);
  if (!macAddress && !modeWithoutRequiredMac.has(String(cfg.network_mode || "legacy_public_gateway"))) {
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
    location: region,
  };

  // Plan-based servers bill the advertised catalog price; free-form custom
  // specs fall back to the spec formula.
  const hourlyCost =
    planHourlyUSD != null ? planHourlyUSD : calculateHourlyCost(serverSpecs);
  const minimumHours = 1;

  // Balance check — user must have at least 1 hour of credit before provisioning
  const minimumBalance = hourlyCost * minimumHours;
  const hasFunds = await BillingCredits.hasSufficientBalance(user.id, minimumBalance);
  if (!hasFunds) {
    if (ipLockKey) await redis.del(ipLockKey).catch(() => {});
    return Response.json(
      { ok: false, error: `Insufficient balance. You need at least $${minimumBalance.toFixed(2)} to create this server.` },
      { status: 402 }
    );
  }

  const node = cfg.node;
  // Auto-pick the storage with the most free space that can fit the
  // requested disk. The host's configured `cfg.storage` is used as the
  // fallback if the Proxmox API is unreachable or no storage fits.
  const requestedDiskGB = diskGB || 20;
  const storagePick = await pickBestStorage({
    hostUrl: cfg.host_url,
    username: cfg.username || "root",
    password: cfg.password || "",
    node: cfg.node,
    requiredGB: requestedDiskGB,
    allowInsecure: !!cfg.allow_insecure_tls,
    fallback: cfg.storage || "local",
  });
  const storage = storagePick.storage;
  if (storagePick.reason === "fallback-no-fit") {
    if (ipLockKey) { try { await redis.del(ipLockKey); } catch { /* ignore */ } }
    return Response.json({
      ok: false,
      error: `No storage with ${requestedDiskGB} GB free on the selected host. Please reduce the disk size or try a different region.`,
    }, { status: 409 });
  }
  console.log(
    `[VM Create] storage=${storage} (${storagePick.reason}) — required ${requestedDiskGB} GB`
  );

  // Reserve DB record to avoid reuse
  let reservationId: number | null = null;
  let billingServiceId: string | null = null;
  const db: DbReservation = { saved: false, id: null, error: null };

  try {
    const { data: existing } = await supabase
      .from("servers")
      .select("id")
      .eq("ip", ipPrimary)
      .limit(1)
      .maybeSingle();
    if (existing) {
      // Release IP lock since we can't use this IP
      if (ipLockKey) await redis.del(ipLockKey).catch(() => {});
      return Response.json({ ok: false, error: "Resources temporarily unavailable. Please try again." }, { status: 409 });
    }

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
        tier: planTier ?? "shared",
        plan_slug: planSlug ?? null,
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
      .select("id, billing_service_id")
      .single();

    if (insertErr) {
      // Release IP lock on failure
      if (ipLockKey) await redis.del(ipLockKey).catch(() => {});
      db.error = insertErr.message;
      if (insertErr.message?.toLowerCase().includes("duplicate") || (insertErr as unknown as Record<string, unknown>).code === "23505") {
        return Response.json({ ok: false, error: "Resources temporarily unavailable. Please try again." }, { status: 409 });
      }
      return Response.json({ ok: false, error: "Unable to reserve your server. Please try again later." }, { status: 500 });
    }
    reservationId = (inserted as Record<string, unknown>)?.id as number ?? null;
    billingServiceId = ((inserted as Record<string, unknown>)?.billing_service_id as string) ?? null;
    db.saved = true;
    db.id = reservationId;
    // IP is now tracked in the servers table — release the Redis lock
    if (ipLockKey) await redis.del(ipLockKey).catch(() => {});
  } catch (e) {
    // Release IP lock on error
    if (ipLockKey) await redis.del(ipLockKey).catch(() => {});
    const error = e instanceof Error ? e : new Error(String(e));
    db.error = error?.message || String(e);
    console.error("[VM Create] DB reservation failed:", db.error);
    return Response.json({ ok: false, error: "Unable to reserve your server. Please try again later." }, { status: 500 });
  }

  // Determine connection type for immediate response
  const isDebian = osLower.includes("debian");
  const isCentos = osLower.includes("centos");
  const ciuser = isWindows ? "admin" : isDebian ? "debian" : isCentos ? "centos" : "ubuntu";
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
    const networkPlan = buildVmNetworkPlan({
      host: cfg,
      publicIp: ipPrimary,
      vmid: newid,
      reservationId: reservationId || newid,
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
    const rateMBps = cpuCores <= 2 ? 4 : cpuCores <= 4 ? 8 : cpuCores <= 6 ? 15 : 30;

    const configPayload: Record<string, string | number | boolean> = {
      cpu: 'host',
      sockets: 1,
      cores: cpuCores,
      memory: memoryMB,
      agent: "enabled=1",
      onboot: 1,
      ciupgrade: 0,
      nameserver: nameservers,
      net0: `${macAddress ? `virtio=${macAddress}` : "virtio"},bridge=${bridge},rate=${rateMBps}`,
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
    } catch (e) {
      console.error(`[VM Create] Failed to fetch VM config for ${newid}:`, e instanceof Error ? e.message : e);
    }

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
      } catch (e) {
        console.error(`[VM Create] Disk resize failed for VM ${newid} (${primaryDisk} +${diskGB}G):`, e instanceof Error ? e.message : e);
      }
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

    if (networkPlan.addHostRoute) {
      await addHostRoute(cfg as Parameters<typeof addHostRoute>[0], ipPrimary, bridge);
    }

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

    if (process.env.PROXMOX_USE_GUEST_AGENT_NETWORK === "1" && (networkPlan.mode === "ovh_hg_scale_routed" || networkPlan.mode === "ovh_advance_gen3_routed")) {
      if (!networkPlan.privateIp || !networkPlan.privateGateway || !networkPlan.privatePrefixLength) {
        throw new Error("Missing routed BYOIP network plan values");
      }
      await updateStage('networking', 90, 'Applying routed BYOIP network inside server...');
      const dnsServers = networkPlan.nameservers.split(/\s+/).filter(Boolean);
      await configureLinuxNetworkViaGuestAgent({
        apiBase,
        node,
        vmid: newid,
        auth,
        dispatcher,
        script: buildLinuxGuestNetworkScript({
          publicIp: ipPrimary,
          privateIp: networkPlan.privateIp,
          privatePrefixLength: networkPlan.privatePrefixLength,
          privateGateway: networkPlan.privateGateway,
          dnsPrimary: dnsServers[0] || "8.8.8.8",
          dnsSecondary: dnsServers[1] || "1.1.1.1",
        }),
      });
    }

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
            network: networkPlan.details,
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

    // Start metered billing now that the VM is live. The 5-min cron meters
    // active_compute hourly (prorated) with the standard grace lifecycle.
    // Best-effort: a failure here is logged but never tears down a live VM.
    if (billingServiceId) {
      try {
        await postProvisionBilling({
          userId: user.id,
          initialCost: 0,
          hourlyRate: hourlyCost,
          serviceId: billingServiceId,
          serviceType: "compute",
          addActive: BillingCredits.addActiveCompute,
        });
      } catch (billingErr) {
        console.error(
          "[VM Create] failed to register compute billing meter:",
          billingErr instanceof Error ? billingErr.message : billingErr
        );
      }
    }
  } catch (e: unknown) {
    const failureMessage = errorMessage(e);
    console.error("[VM Create] Provisioning failed:", failureMessage, e);
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
                message: failureMessage,
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
  const successResponse = {
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
  };

  // Record idempotency result so retries get the same response
  if (idempComplete) {
    await idempComplete(successResponse).catch(() => {});
  }

  return Response.json(successResponse);
}
