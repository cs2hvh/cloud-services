/* eslint-disable @typescript-eslint/no-explicit-any */
import { Agent as UndiciAgent } from "undici";
// @ts-expect-error ssh2 has no type declarations
import { Client as SSHClient } from "ssh2";

const DEBUG = process.env.NODE_ENV === 'development';

export interface ProxmoxAuth {
  headers: HeadersInit;
}

export interface ProxmoxHost {
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
  template_vmid?: number;
  is_active?: boolean;
}

/**
 * Serialize errors for JSON responses
 */
export function serializeError(err: unknown): Record<string, any> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: DEBUG ? err.stack : undefined,
    };
  }
  return { message: String(err) };
}

/**
 * Wrap promise with timeout
 */
export function withTimeout<T>(p: Promise<T>, ms = 60000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Get HTTP dispatcher (handles TLS bypass for self-signed certs)
 */
export function getDispatcher(allowInsecureTls: boolean) {
  if (!allowInsecureTls) return undefined;

  try {
    return new UndiciAgent({
      connect: {
        rejectUnauthorized: false,
      },
    });
  } catch (e) {
    console.warn('Failed to create custom dispatcher:', e);
    return undefined;
  }
}

/**
 * Authenticate with Proxmox API using username/password
 * Returns ticket and CSRF token
 */
export async function proxmoxAuth(
  host: ProxmoxHost,
  dispatcher?: any
): Promise<ProxmoxAuth> {
  // Normalize host URL (remove trailing slash)
  const apiBase = host.host_url.replace(/\/$/, '');

  // Username/password authentication only
  if (!host.username || !host.password) {
    throw new Error('Proxmox username and password required');
  }

  const pveUsername = host.username.includes('@') ? host.username : `${host.username}@pam`;
  const formData = new URLSearchParams();
  formData.append('username', pveUsername);
  formData.append('password', host.password);

  const res = await withTimeout(
    fetch(`${apiBase}/api2/json/access/ticket`, {
      method: 'POST',
      body: formData,
      dispatcher,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    } as any)
  );

  if (!res.ok) {
    throw new Error(`Proxmox auth failed: ${res.status}`);
  }

  const json = (await res.json()) as any;
  const data = json.data || {};

  if (!data.ticket || !data.CSRFPreventionToken) {
    throw new Error('Missing ticket or CSRF token in auth response');
  }

  return {
    headers: {
      Cookie: `PVEAuthCookie=${data.ticket}`,
      CSRFPreventionToken: data.CSRFPreventionToken,
    } as HeadersInit,
  };
}

/**
 * Make authenticated GET request to Proxmox API
 */
export async function fetchJson(
  host: ProxmoxHost,
  endpoint: string,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<any> {
  const apiBase = host.host_url.replace(/\/$/, '');
  const url = `${apiBase}${endpoint}`;

  const res = await withTimeout(
    fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      headers: auth.headers as any,
      dispatcher,
    } as any)
  );

  if (!res.ok) {
    throw new Error(`Proxmox API error: ${res.status}`);
  }

  const json = (await res.json()) as any;
  return json.data || json;
}

/**
 * Make authenticated POST request to Proxmox API
 */
export async function postForm(
  host: ProxmoxHost,
  endpoint: string,
  data: Record<string, any>,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<any> {
  const apiBase = host.host_url.replace(/\/$/, '');
  const url = `${apiBase}${endpoint}`;
  const formData = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, String(value));
    }
  });

  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      body: formData,
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(auth.headers as any),
      },
      dispatcher,
    } as any)
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Proxmox API error: ${res.status} ${text}`);
  }

  const json = (await res.json()) as any;
  return json.data || json;
}

/**
 * Poll Proxmox task until completion
 */
export async function waitTask(
  host: ProxmoxHost,
  taskId: string,
  auth: ProxmoxAuth,
  dispatcher?: any,
  maxWaitMs = 180000,
  pollIntervalMs = 2000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const taskJson = await fetchJson(
        host,
        `/api2/json/cluster/tasks/${encodeURIComponent(taskId)}`,
        auth,
        dispatcher
      );

      const taskData = taskJson?.data || taskJson;
      const status = taskData?.status;

      if (status === 'stopped') {
        const exitStatus = taskData?.exitstatus;
        if (exitStatus === 'OK') {
          return taskData;
        } else {
          throw new Error(`Proxmox task failed: ${exitStatus}`);
        }
      }

      // Still running, wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (err: any) {
      // If task query itself fails, might be complete but query failed
      if (err.message?.includes('404')) {
        return { status: 'completed' };
      }
      throw err;
    }
  }

  throw new Error(`Task polling timeout after ${maxWaitMs}ms`);
}

/**
 * List VMs on a node
 */
export async function listVMs(
  host: ProxmoxHost,
  node: string,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<any[]> {
  const json = await fetchJson(
    host,
    `/api2/json/nodes/${encodeURIComponent(node)}/qemu`,
    auth,
    dispatcher
  );
  return Array.isArray(json) ? json : (json as any)?.data || [];
}

/**
 * Get next available VMID from cluster
 */
export async function getNextVMID(
  host: ProxmoxHost,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<number> {
  const json = await fetchJson(
    host,
    '/api2/json/cluster/nextid',
    auth,
    dispatcher
  );
  const nextId = json?.data || json;
  const vmid = Number(nextId);
  if (isNaN(vmid)) {
    throw new Error('Invalid VMID response: ' + String(nextId));
  }
  return vmid;
}

/**
 * Execute a command on the Proxmox host via SSH.
 * Uses the same credentials as the Proxmox API (root user).
 */
function sshExec(sshHost: string, username: string, password: string, command: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH command timed out"));
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
        let out = "";
        stream.on("data", (d: Buffer) => out += d.toString());
        stream.stderr.on("data", (d: Buffer) => out += d.toString());
        stream.on("close", () => { clearTimeout(timer); conn.end(); resolve(out.trim()); });
      });
    });
    conn.on("error", (err: any) => { clearTimeout(timer); reject(err); });
    conn.connect({ host: sshHost, port: 22, username, password });
  });
}

/**
 * Extract the SSH hostname from a Proxmox host_url.
 * e.g. "https://ns5028607.ip-148-113-49.net:8006/" -> "ns5028607.ip-148-113-49.net"
 */
function sshHostFromUrl(hostUrl: string): string {
  try {
    const u = new URL(hostUrl);
    return u.hostname;
  } catch {
    return hostUrl.replace(/^https?:\/\//, "").replace(/:\d+.*$/, "").replace(/\/+$/, "");
  }
}

/** Validate an IPv4 address strictly (no injection possible) */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

/** Validate bridge name (alphanumeric + limited chars only) */
function isValidBridgeName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/.test(name);
}

function isSafeSnippetFilename(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.ya?ml$/.test(name);
}

/**
 * Write a cloud-init snippet to Proxmox local snippet storage.
 * The app stores cicustom references as <storage>:snippets/<filename>, while
 * the default Proxmox "local" file storage maps snippets to /var/lib/vz/snippets.
 */
export async function writeCloudInitSnippet(host: ProxmoxHost, filename: string, content: string): Promise<void> {
  if (!host.username || !host.password) {
    throw new Error("SSH credentials are required to write cloud-init snippets");
  }
  if (!isSafeSnippetFilename(filename)) {
    throw new Error("Invalid cloud-init snippet filename");
  }

  const sshHost = sshHostFromUrl(host.host_url);
  const username = host.username.includes("@") ? host.username.split("@")[0] : host.username;
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const command = `mkdir -p /var/lib/vz/snippets && printf '%s' '${encoded}' | base64 -d > /var/lib/vz/snippets/${filename}`;

  await sshExec(sshHost, username, host.password, command, 20000);
}

/**
 * Add a host route for a VM's IP on the Proxmox host.
 * Required for OVH routed IP model: the host must know to send
 * traffic for a failover IP into the bridge where the VM lives.
 *
 * Also ensures ip_forward and proxy_arp are enabled (idempotent).
 */
export async function addHostRoute(host: ProxmoxHost, vmIp: string, bridge = "vmbr0"): Promise<void> {
  if (!host.username || !host.password) {
    console.warn("[Host Route] No SSH credentials — skipping route injection");
    return;
  }
  if (!isValidIPv4(vmIp)) {
    console.error(`[Host Route] Invalid IP address rejected: ${vmIp}`);
    return;
  }
  if (!isValidBridgeName(bridge)) {
    console.error(`[Host Route] Invalid bridge name rejected: ${bridge}`);
    return;
  }
  const sshHost = sshHostFromUrl(host.host_url);
  const username = host.username.includes("@") ? host.username.split("@")[0] : host.username;

  const commands = [
    `echo 1 > /proc/sys/net/ipv4/ip_forward`,
    `echo 1 > /proc/sys/net/ipv4/conf/${bridge}/proxy_arp`,
    `ip route add ${vmIp}/32 dev ${bridge} 2>/dev/null || true`,
  ].join(" && ");

  try {
    await sshExec(sshHost, username, host.password, commands);
  } catch (e) {
    console.error(`[Host Route] Failed to add route for ${vmIp}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Remove a host route for a VM's IP on the Proxmox host.
 * Called when a VM is deleted so the route table stays clean.
 */
export async function removeHostRoute(host: ProxmoxHost, vmIp: string, bridge = "vmbr0"): Promise<void> {
  if (!host.username || !host.password) {
    console.warn("[Host Route] No SSH credentials — skipping route removal");
    return;
  }
  if (!isValidIPv4(vmIp)) {
    console.error(`[Host Route] Invalid IP address rejected: ${vmIp}`);
    return;
  }
  if (!isValidBridgeName(bridge)) {
    console.error(`[Host Route] Invalid bridge name rejected: ${bridge}`);
    return;
  }
  const sshHost = sshHostFromUrl(host.host_url);
  const username = host.username.includes("@") ? host.username.split("@")[0] : host.username;

  try {
    await sshExec(sshHost, username, host.password, `ip route del ${vmIp}/32 dev ${bridge} 2>/dev/null || true`);
  } catch (e) {
    console.error(`[Host Route] Failed to remove route for ${vmIp}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Clone a template VM
 */
export async function cloneTemplate(
  host: ProxmoxHost,
  templateVmid: number,
  newVmid: number,
  hostname: string,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<string> {
  const taskId = await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${templateVmid}/clone`,
    {
      newid: newVmid,
      name: hostname,
      full: 1,
    },
    auth,
    dispatcher
  );
  return taskId;
}

/**
 * Configure VM after cloning
 */
export async function configureVM(
  host: ProxmoxHost,
  vmid: number,
  config: {
    cores?: number;
    sockets?: number;
    memory?: number;
    net0?: string;
    ipconfig0?: string;
    searchdomain?: string;
    nameserver?: string;
  },
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<void> {
  await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/config`,
    config,
    auth,
    dispatcher
  );
}

/**
 * Start a VM
 */
export async function startVM(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<string> {
  const taskId = await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/status/start`,
    {},
    auth,
    dispatcher
  );
  return taskId;
}

/**
 * Stop a VM
 */
export async function stopVM(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<string> {
  const taskId = await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/status/stop`,
    {},
    auth,
    dispatcher
  );
  return taskId;
}

/**
 * Reboot a VM
 */
export async function rebootVM(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<string> {
  const taskId = await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/status/reboot`,
    {},
    auth,
    dispatcher
  );
  return taskId;
}

/**
 * Delete a VM
 */
export async function deleteVM(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<string> {
  const taskId = await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}`,
    { purge: 1 },
    auth,
    dispatcher
  );
  return taskId;
}

/**
 * Get VM status
 */
export async function getVMStatus(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<any> {
  const json = await fetchJson(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/status/current`,
    auth,
    dispatcher
  );
  return json?.data || json;
}

/**
 * Get VM config
 */
export async function getVMConfig(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<any> {
  const json = await fetchJson(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/config`,
    auth,
    dispatcher
  );
  return json?.data || json;
}

/**
 * Identify the VM's primary OS/boot disk from a config object and parse its
 * current size in GB. Skips cdrom + cloudinit drives. Prefers the configured
 * `bootdisk`, then the usual bus order.
 */
export function findVMBootDisk(
  config: Record<string, any>
): { disk: string; sizeGb: number } | null {
  const candidates = ['scsi0', 'virtio0', 'sata0', 'ide0', 'scsi1', 'virtio1'];
  const bootdisk = typeof config.bootdisk === 'string' ? config.bootdisk : null;
  const order = bootdisk
    ? [bootdisk, ...candidates.filter((c) => c !== bootdisk)]
    : candidates;

  for (const key of order) {
    const val = config[key];
    if (typeof val !== 'string') continue;
    if (/media=cdrom/i.test(val) || /cloudinit/i.test(val)) continue;
    const m = val.match(/size=(\d+(?:\.\d+)?)([KMGT])/i);
    if (!m) continue;
    let sizeGb = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    if (unit === 'T') sizeGb *= 1024;
    else if (unit === 'M') sizeGb /= 1024;
    else if (unit === 'K') sizeGb /= 1024 * 1024;
    return { disk: key, sizeGb };
  }
  return null;
}

/**
 * Grow a VM disk to an absolute size (in GB). Proxmox can only ever GROW a
 * disk — passing a size smaller than the current size errors out — so callers
 * must validate target >= current first. Uses PUT (the resize endpoint is not
 * a POST). The guest filesystem still has to be expanded inside the VM; cloud
 * images do this automatically via cloud-init growpart on the next boot.
 */
export async function resizeDisk(
  host: ProxmoxHost,
  vmid: number,
  disk: string,
  sizeGb: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<void> {
  const apiBase = host.host_url.replace(/\/$/, '');
  const url = `${apiBase}/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/resize`;
  const formData = new URLSearchParams();
  formData.append('disk', disk);
  formData.append('size', `${Math.round(sizeGb)}G`);

  const res = await withTimeout(
    fetch(url, {
      method: 'PUT',
      body: formData,
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(auth.headers as any),
      },
      dispatcher,
    } as any)
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Proxmox resize error: ${res.status} ${text}`);
  }
}

/**
 * Get VM RRD (time-series) metrics data.
 * Proxmox stores RRD data at various timeframes.
 * @param timeframe - "hour" | "day" | "week" | "month" | "year"
 * @param cf - consolidation function: "AVERAGE" | "MAX"
 */
export async function getVMRRDData(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' = 'hour',
  cf: 'AVERAGE' | 'MAX' = 'AVERAGE',
  dispatcher?: any
): Promise<any[]> {
  const json = await fetchJson(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/rrddata?timeframe=${encodeURIComponent(timeframe)}&cf=${encodeURIComponent(cf)}`,
    auth,
    dispatcher
  );
  return Array.isArray(json) ? json : json?.data || [];
}

/**
 * Build a Proxmox VM template from a downloadable cloud image (qcow2/raw) for
 * the custom‑OS‑images feature. Runs entirely against ONE host: downloads the
 * image over SSH, imports the disk, attaches a cloud‑init drive + guest agent +
 * serial console, and converts the VM to a template. Returns the new template
 * vmid + the source image size in bytes (for storage billing).
 *
 * The resulting template behaves exactly like a built‑in OS template, so the
 * normal clone + cloud‑init networking path works unchanged. Best‑effort cleanup
 * (destroy the half‑built VM + remove the temp file) on failure.
 *
 * SECURITY: `sourceUrl` is validated to be a clean https URL (no shell
 * metacharacters) and single‑quoted in the SSH command.
 */
export async function buildCustomImageTemplate(
  host: ProxmoxHost,
  opts: { sourceUrl: string; name: string; osType?: string },
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<{ vmid: number; sizeBytes: number }> {
  if (!host.username || !host.password) {
    throw new Error("SSH credentials are required to build a custom image template");
  }
  // Validate the source URL: https only, and reject anything that could break
  // out of the single‑quoted shell argument.
  let parsed: URL;
  try {
    parsed = new URL(opts.sourceUrl);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (parsed.protocol !== "https:") throw new Error("Image URL must be https");
  if (/['"`$\\\n\r;|&<>(){}]/.test(opts.sourceUrl)) {
    throw new Error("Image URL contains unsafe characters");
  }

  const node = host.node;
  const storage = host.storage || "local";
  const bridge = isValidBridgeName(host.bridge) ? host.bridge : "vmbr0";
  const ostype = opts.osType || "l26";
  const sshHost = sshHostFromUrl(host.host_url);
  const username = host.username.includes("@") ? host.username.split("@")[0] : host.username;
  const ssh = (cmd: string, timeoutMs: number) => sshExec(sshHost, username, host.password as string, cmd, timeoutMs);

  const vmid = await getNextVMID(host, auth, dispatcher);
  const tmpFile = `/var/tmp/ci-${vmid}.img`;
  let created = false;

  try {
    // 1. Download the image to a temp file (up to 30 min for large images).
    await ssh(
      `curl -fSL --connect-timeout 30 -o '${tmpFile}' '${opts.sourceUrl}' || wget -q -O '${tmpFile}' '${opts.sourceUrl}'`,
      30 * 60_000
    );
    const sizeStr = await ssh(`stat -c %s '${tmpFile}' 2>/dev/null || echo 0`, 30_000);
    const sizeBytes = Number(String(sizeStr).trim()) || 0;
    if (sizeBytes <= 0) throw new Error("Downloaded image is empty or unreadable");

    // 2. Create the VM shell via the API.
    await postForm(
      host,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu`,
      {
        vmid,
        name: opts.name.slice(0, 60).replace(/[^a-zA-Z0-9-]/g, "-") || `custom-${vmid}`,
        memory: 1024,
        cores: 1,
        ostype,
        scsihw: "virtio-scsi-pci",
        net0: `virtio,bridge=${bridge}`,
        serial0: "socket",
        vga: "serial0",
        agent: "enabled=1",
      },
      auth,
      dispatcher
    );
    created = true;

    // 3. Import the downloaded disk (CLI only — no API equivalent). Shows up as unusedN.
    await ssh(`qm importdisk ${vmid} '${tmpFile}' ${storage}`, 20 * 60_000);

    // 4. Find the imported disk in the config and attach it as the boot disk.
    const cfg = await getVMConfig(host, vmid, auth, dispatcher);
    const unusedKey = Object.keys(cfg).find((k) => /^unused\d+$/.test(k));
    const importedDisk = unusedKey ? String(cfg[unusedKey]) : `${storage}:vm-${vmid}-disk-0`;
    await postForm(
      host,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/config`,
      { scsi0: `${importedDisk},discard=on`, boot: "order=scsi0", ide2: `${storage}:cloudinit` },
      auth,
      dispatcher
    );

    // 5. Convert to a template.
    await postForm(
      host,
      `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${vmid}/template`,
      {},
      auth,
      dispatcher
    );

    // 6. Clean up the temp file (best effort).
    await ssh(`rm -f '${tmpFile}'`, 30_000).catch(() => {});

    return { vmid, sizeBytes };
  } catch (err) {
    // Best‑effort cleanup so a failed build doesn't leave an orphan VM/file.
    await ssh(`rm -f '${tmpFile}'`, 30_000).catch(() => {});
    if (created) {
      await deleteVM(host, vmid, auth, dispatcher).catch(() => {});
    }
    throw err;
  }
}

/**
 * Create a VNC proxy connection for web console access.
 * Returns a ticket and port for noVNC WebSocket connection.
 */
export async function createVNCProxy(
  host: ProxmoxHost,
  vmid: number,
  auth: ProxmoxAuth,
  dispatcher?: any
): Promise<{ ticket: string; port: number; upid: string; cert: string }> {
  const result = await postForm(
    host,
    `/api2/json/nodes/${encodeURIComponent(host.node)}/qemu/${vmid}/vncproxy`,
    { websocket: 1 },
    auth,
    dispatcher
  );
  return result;
}
