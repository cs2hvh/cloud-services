/**
 * DNS Service - Handles Cloudflare DNS operations
 */
import cloudflare from "@/lib/cloudflare";
import { getAppDomain } from "@/config/domain";

export class DNSService {
  /**
   * Create a DNS A record for an app
   * Throws error if record already exists (prevents overwriting other users' records)
   */
  static async createRecord(appName: string, ipAddress: string): Promise<void> {
    if (!process.env.CLOUDFLARE_ZONE_ID) {
      throw new Error("CLOUDFLARE_ZONE_ID not configured");
    }

    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error("CLOUDFLARE_API_TOKEN not configured");
    }

    const fullDomain = getAppDomain(appName);
    console.log(`[DNSService] Creating DNS: ${fullDomain} -> ${ipAddress}`);

    // Check if record already exists - fail safely to prevent overwriting
    const exists = await this.recordExists(appName);
    if (exists) {
      throw new Error(`DNS record for ${fullDomain} already exists. Delete the existing app first.`);
    }

    try {
      await cloudflare.dns.records.create({
        type: "A",
        name: appName,
        proxied: false, // Direct connection to K8s (no Cloudflare proxy)
        content: ipAddress,
        ttl: 300, // 5 minutes for faster propagation
        zone_id: process.env.CLOUDFLARE_ZONE_ID
      });

      console.log(`[DNSService] ✅ Created DNS record for ${appName}`);
      console.log(`[DNSService] Record will be accessible at: https://${fullDomain}`);
    } catch (error: any) {
      console.error(`[DNSService] Cloudflare API error:`, error?.message);
      throw new Error(`Failed to create DNS record: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Delete DNS record for an app
   */
  static async deleteRecord(appName: string): Promise<void> {
    if (!process.env.CLOUDFLARE_ZONE_ID) {
      throw new Error("CLOUDFLARE_ZONE_ID not configured");
    }

    const fullDomain = getAppDomain(appName);
    console.log(`[DNSService] Deleting DNS for ${appName} (${fullDomain})`);

    const records = await cloudflare.dns.records.list({
      zone_id: process.env.CLOUDFLARE_ZONE_ID,
    });

    const matchingRecords = records.result?.filter((record: any) =>
      record.name === fullDomain
    ) || [];

    console.log(`[DNSService] Found ${matchingRecords.length} matching DNS records for ${fullDomain}`);

    if (matchingRecords.length === 0) {
      console.log(`[DNSService] No DNS records to delete for ${appName}`);
      return;
    }

    for (const record of matchingRecords) {
      console.log(`[DNSService] Deleting record ID: ${record.id} (${record.type} ${record.name})`);
      await cloudflare.dns.records.delete(record.id, {
        zone_id: process.env.CLOUDFLARE_ZONE_ID,
      });
      console.log(`[DNSService] ✅ Deleted record ID: ${record.id}`);
    }

    console.log(`[DNSService] ✅ Deleted ${matchingRecords.length} DNS record(s) for ${appName}`);
  }

  /**
   * Check if DNS record exists
   */
  static async recordExists(appName: string): Promise<boolean> {
    if (!process.env.CLOUDFLARE_ZONE_ID) {
      throw new Error("CLOUDFLARE_ZONE_ID not configured");
    }

    const records = await cloudflare.dns.records.list({
      zone_id: process.env.CLOUDFLARE_ZONE_ID,
    });

    const fullDomain = getAppDomain(appName);
    const exists = records.result?.some((record: any) =>
      record.name === fullDomain
    ) || false;

    return exists;
  }
}
