import axios from "axios";
import { Encryption } from "@/config/functions";
import { Spectrum_Apps, Projects } from "@/lib/supabase/queries";
import type {
  CreateSpectrumAppPayload,
  UpdateSpectrumAppPayload,
} from "@/lib/validation/spectrum";
import type { Json } from "@/lib/supabase/types";
import type { EncryptedData } from "@/config/functions";

/**
 * Spectrum Configuration
 * Handles all Cloudflare Spectrum API interactions and database operations
 * Keeps environment variables and internal logic separate from API routes
 */

// Type definitions
type EdgeIps = {
  type: string;
  connectivity: string;
};

type DnsRecord = {
  name: string;
  type: "A" | "CNAME";
};

type CloudflareResponse<T> = {
  success: boolean;
  result?: T;
  errors?: Array<{ message: string }>;
};

type CloudflareSpectrumApp = {
  id: string;
  dns?: DnsRecord;
  protocol: string;
  origin_direct: string[];
  tls: "off" | "full";
  edge_ips?: EdgeIps;
  ip_firewall: boolean;
  traffic_type: string;
  proxy_protocol: string;
  project_id?: string;
};

// Type for create payload with optional fields resolved
type CreateSpectrumAppInput = Omit<CreateSpectrumAppPayload, 'tls' | 'ip_firewall' | 'traffic_type' | 'proxy_protocol' | 'edge_ips'> & {
  tls?: "off" | "full";
  ip_firewall?: boolean;
  traffic_type?: string;
  proxy_protocol?: string;
  edge_ips?: EdgeIps;
};

// Environment configuration getter
function getCloudflareConfig() {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!zoneId || !token) {
    throw new Error("Cloudflare configuration missing (CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN)");
  }

  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY is missing");
  }

  return { zoneId, token, encryptionKey };
}

// Axios headers builder
function getCloudflareHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create a new Spectrum app in Cloudflare and persist to database
 */
export async function createSpectrumApp(payload: CreateSpectrumAppInput) {
  const { zoneId, token, encryptionKey } = getCloudflareConfig();

  // Normalize data with defaults (in case validation doesn't apply them)
  const tls = payload.tls ?? "off";
  const ip_firewall = payload.ip_firewall ?? false;
  const traffic_type = payload.traffic_type ?? "direct";
  const proxy_protocol = payload.proxy_protocol ?? "off";
  const edge_ips = payload.edge_ips ?? { connectivity: "all", type: "dynamic" };

  // Build Cloudflare payload
  const cfPayload: Record<string, unknown> = {
    dns: { name: `${payload.dns.name}${process.env.PARENT_DOMAIN}`, type: payload.dns.type,original_name: payload.dns.name },
    protocol: payload.protocol,
    origin_direct: payload.origin_direct,
    ip_firewall,
    tls,
    traffic_type,
    proxy_protocol,
    edge_ips,
  };

  // Create in Cloudflare
  const cfResp = await axios.post<CloudflareResponse<CloudflareSpectrumApp>>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps`,
    cfPayload,
    { headers: getCloudflareHeaders(token) }
  );

  if (!cfResp.data?.success || !cfResp.data.result) {
    throw new Error(
      cfResp.data?.errors?.[0]?.message || "Failed to create Spectrum app"
    );
  }

  const result = cfResp.data.result;

  // Encrypt DNS name for database storage
  const encryptedDnsName = Encryption.encrypt(payload.dns.name, encryptionKey);

  // Persist to database
  const persist = await Spectrum_Apps.create({
    spectrum_id: result.id,
    dns: {
      name: encryptedDnsName,
      type: result.dns?.type || payload.dns.type,
    } as unknown as Json,
    protocol: result.protocol || payload.protocol,
    origin_direct: payload.origin_direct,
    tls,
    edge_ips: edge_ips as unknown as Json,
    ip_firewall,
    traffic_type,
    proxy_protocol,
    owner_id: payload.owner_id,
    project_id: payload.project_id,
    status: "created",
    created_at: new Date().toISOString(),
  });

  if (!persist.success) {
    throw new Error(
      `Created in Cloudflare but failed to persist: ${persist.error}`
    );
  }

  // Add project log if applicable
  if (payload.project_id) {
    await Projects.add_log?.({
      project_id: payload.project_id,
      event: "SpectrumCreate",
      text: `Spectrum app '${payload.dns.name}' created`,
    });
  }

  return {
    app: persist.data,
    cloudflare: result,
  };
}

/**
 * Get a specific Spectrum app from Cloudflare
 */
export async function getSpectrumApp(appId: string) {
  const { zoneId, token, encryptionKey } = getCloudflareConfig();

  // Fetch from Cloudflare
  const cfResp = await axios.get<CloudflareResponse<CloudflareSpectrumApp>>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${appId}`,
    { headers: getCloudflareHeaders(token) }
  );

  if (!cfResp.data?.success || !cfResp.data.result) {
    throw new Error(
      cfResp.data?.errors?.[0]?.message || "Failed to fetch Spectrum app"
    );
  }

  // Fetch local metadata
  const local = await Spectrum_Apps.get(appId);
  let decryptedDnsName: string | null = null;

  if (local.success && local.data?.dns) {
    try {
      if (typeof local.data.dns === "object" && "name" in local.data.dns) {
        const encryptedData = local.data.dns.name as unknown as EncryptedData;
        console.log(encryptedData,".......................191")
        decryptedDnsName = Encryption.decrypt(encryptedData, encryptionKey);
        console.log(decryptedDnsName,".......................193")
      }
    } catch (error) {
      // Decryption failed, keep as null
      console.error("Failed to decrypt DNS name:", error);
    }
  }

  return {
    cloudflare: cfResp.data.result,
    local: local.success ? local.data : null,
    decryptedIp: decryptedDnsName,
  };
}

/**
 * List all Spectrum apps from Cloudflare
 */
export async function listSpectrumApps(ownerId?: string) {
  const { zoneId, token, encryptionKey } = getCloudflareConfig();

  // Fetch from Cloudflare
  const cfResp = await axios.get<CloudflareResponse<CloudflareSpectrumApp[]>>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps`,
    { headers: getCloudflareHeaders(token) }
  );

  if (!cfResp.data?.success || !cfResp.data.result) {
    throw new Error(
      cfResp.data?.errors?.[0]?.message || "Failed to list Spectrum apps"
    );
  }

  // Fetch local apps for owner context
  const localRaw = ownerId
    ? await Spectrum_Apps.list_by_owner(ownerId)
    : [];

  // Decrypt DNS names in local apps
  const local = localRaw.map((app) => {
    let dnsName: string | null = null;
    try {
      if (app.dns && typeof app.dns === "object" && "name" in app.dns) {
        const encryptedData = app.dns.name as unknown as EncryptedData;
        dnsName = Encryption.decrypt(encryptedData, encryptionKey);
      }
    } catch (error) {
      console.error("Failed to decrypt DNS name:", error);
    }
    return {
      ...app,
      dns: typeof app.dns === "object" && app.dns !== null 
        ? { ...(app.dns as Record<string, unknown>), name: dnsName } 
        : { name: dnsName },
    };
  });

  return {
    cloudflare: cfResp.data.result,
    local,
  };
}

/**
 * Update a Spectrum app in Cloudflare and database
 */
export async function updateSpectrumApp(data: UpdateSpectrumAppPayload) {
  const { zoneId, token, encryptionKey } = getCloudflareConfig();

  console.log(data,"........................273");

  // Get the current Cloudflare app
  const cfAppResp = await axios.get<CloudflareResponse<CloudflareSpectrumApp>>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${data.app_id}`,
    { headers: getCloudflareHeaders(token) }
  );

  if (!cfAppResp.data?.success || !cfAppResp.data.result) {
    throw new Error(
      cfAppResp.data?.errors?.[0]?.message || "Failed to fetch current Spectrum app"
    );
  }

  const currentApp = cfAppResp.data.result;

  // Merge current app with updated fields to create complete payload
  const completePayload: Record<string, unknown> = {
    dns: data.dns ?? currentApp.dns,
    protocol: data.protocol ?? currentApp.protocol,
    origin_direct: data.origin_direct ?? currentApp.origin_direct,
    ip_firewall: data.ip_firewall !== undefined ? data.ip_firewall : currentApp.ip_firewall,
    tls: data.tls ?? currentApp.tls,
    traffic_type: data.traffic_type ?? currentApp.traffic_type,
    edge_ips: data.edge_ips ?? currentApp.edge_ips,
    proxy_protocol: data.proxy_protocol ?? currentApp.proxy_protocol,
  };

  // Update in Cloudflare with complete payload
  const cfResp = await axios.put<CloudflareResponse<CloudflareSpectrumApp>>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${data.app_id}`,
    completePayload,
    { headers: getCloudflareHeaders(token) }
  );

  if (!cfResp.data?.success || !cfResp.data.result) {
    throw new Error(
      cfResp.data?.errors?.[0]?.message || "Failed to update Spectrum app"
    );
  }

  const result = cfResp.data.result;

  // Build database update payload
  const updatePayload: Record<string, unknown> = {
    status: "updated",
  };

  if (result.dns?.name) {
    const encryptedDnsName = Encryption.encrypt(result.dns.name, encryptionKey);
    updatePayload.dns = {
      name: encryptedDnsName,
      type: result.dns.type,
    } as unknown as Json;
  }
  if (result.protocol) updatePayload.protocol = result.protocol;
  if (result.origin_direct) updatePayload.origin_direct = result.origin_direct;
  if (result.tls) updatePayload.tls = result.tls;
  if (result.edge_ips) updatePayload.edge_ips = result.edge_ips as unknown as Json;
  if (result.ip_firewall !== undefined) updatePayload.ip_firewall = result.ip_firewall;
  if (result.traffic_type) updatePayload.traffic_type = result.traffic_type;
  if (result.proxy_protocol) updatePayload.proxy_protocol = result.proxy_protocol;

  // Update in database
  const dbUpdate = await Spectrum_Apps.update(data.app_id, updatePayload);

  // Decrypt DNS name for response
  let decryptedDnsName: string | null = null;
  if (dbUpdate.success && dbUpdate.data?.dns) {
    try {
      if (typeof dbUpdate.data.dns === "object" && "name" in dbUpdate.data.dns) {
        const encryptedData = dbUpdate.data.dns.name as unknown as EncryptedData;
        decryptedDnsName = Encryption.decrypt(encryptedData, encryptionKey);
      }
    } catch (error) {
      console.error("Failed to decrypt DNS name:", error);
    }
  }

  // Add project log if applicable
  if (result?.project_id) {
    await Projects.add_log?.({
      project_id: result.project_id,
      event: "SpectrumUpdate",
      text: `Spectrum app '${decryptedDnsName || result.dns?.name}' updated`,
    });
  }

  // Return complete spectrum app with decrypted DNS
  return {
    cloudflare: result,
    app: dbUpdate.success ? {
      ...dbUpdate.data,
      dns: dbUpdate.data?.dns && typeof dbUpdate.data.dns === "object" 
        ? { ...(dbUpdate.data.dns as Record<string, unknown>), name: decryptedDnsName, decrypted_name: decryptedDnsName }
        : { name: decryptedDnsName, decrypted_name: decryptedDnsName }
    } : null,
  };
}

/**
 * Delete a Spectrum app from Cloudflare and database
 */
export async function deleteSpectrumApp(appId: string) {
  const { zoneId, token } = getCloudflareConfig();

  // Get local data before deletion (for project logging)
  const localBefore = await Spectrum_Apps.get(appId);

  // Delete from Cloudflare
  const cfResp = await axios.delete<CloudflareResponse<{ id: string }>>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${appId}`,
    { headers: getCloudflareHeaders(token) }
  );

  if (!cfResp.data?.success) {
    throw new Error(
      cfResp.data?.errors?.[0]?.message || "Failed to delete Spectrum app"
    );
  }

  // Delete from database
  const del = await Spectrum_Apps.delete(appId);

  if (!del.success) {
    throw new Error(
      `Deleted in Cloudflare but failed to remove locally: ${del.error}`
    );
  }

  // Add project log if applicable
  const projectId = (localBefore.success && localBefore.data?.project_id) || null;
  if (projectId && typeof projectId === "string") {
    const dnsInfo = localBefore.success && localBefore.data?.dns;
    const appName = (dnsInfo && typeof dnsInfo === "object" && "name" in dnsInfo) 
      ? String(dnsInfo.name) 
      : appId;
    
    await Projects.add_log?.({
      project_id: projectId,
      event: "SpectrumDelete",
      text: `Spectrum app '${appName}' deleted`,
    });
  }

  return {
    id: appId,
    message: "Spectrum app deleted successfully",
  };
}
