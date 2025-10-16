import { Agent as UndiciAgent } from "undici";

const DEBUG = process.env.NODE_ENV === 'development';

export interface ProxmoxAuth {
  ticket: string;
  csrf: string;
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
 * Authenticate with Proxmox API
 * Returns ticket and CSRF token
 */
export async function proxmoxAuth(
  host: ProxmoxHost,
  dispatcher?: any
): Promise<ProxmoxAuth> {
  const authData = host.token_id && host.token_secret
    ? {
        tokenid: host.token_id,
        token: host.token_secret,
      }
    : {
        username: host.username || 'root@pam',
        password: host.password || '',
        realm: 'pam',
      };

  const url = new URL('/api2/json/access/ticket', host.host_url);
  const formData = new URLSearchParams();

  Object.entries(authData).forEach(([key, value]) => {
    if (value) formData.append(key, String(value));
  });

  const res = await withTimeout(
    fetch(url.toString(), {
      method: 'POST',
      body: formData,
      dispatcher,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
  );

  if (!res.ok) {
    throw new Error(`Proxmox auth failed: ${res.statusText}`);
  }

  const json = (await res.json()) as any;
  const data = json.data || {};

  return {
    ticket: data.ticket || '',
    csrf: data.CSRFPreventionToken || '',
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
  const url = new URL(endpoint, host.host_url);
  const headers: Record<string, string> = {
    Cookie: `PVEAuthCookie=${auth.ticket}`,
    CSRFPreventionToken: auth.csrf,
  };

  const res = await withTimeout(
    fetch(url.toString(), {
      method: 'GET',
      headers,
      dispatcher,
    })
  );

  if (!res.ok) {
    throw new Error(
      `Proxmox API error: ${res.status} ${res.statusText}`
    );
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
  const url = new URL(endpoint, host.host_url);
  const formData = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, String(value));
    }
  });

  const headers: Record<string, string> = {
    Cookie: `PVEAuthCookie=${auth.ticket}`,
    CSRFPreventionToken: auth.csrf,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const res = await withTimeout(
    fetch(url.toString(), {
      method: 'POST',
      body: formData,
      headers,
      dispatcher,
    })
  );

  if (!res.ok) {
    const text = await res.text();
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
