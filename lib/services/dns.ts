/**
 * DNS Service - Handles Cloudflare DNS operations
 */
import cloudflare from "@/lib/cloudflare";

export class DNSService {
  /**
   * Create a DNS A record for an app
   */
  static async createRecord(appName: string, ipAddress: string): Promise<void> {
    if (!process.env.CLOUDFLARE_ZONE_ID) {
      throw new Error("CLOUDFLARE_ZONE_ID not configured");
    }

    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error("CLOUDFLARE_API_TOKEN not configured");
    }

    console.log(`[DNSService] Creating DNS: ${appName}.uizb210.xyz -> ${ipAddress}`);

    try {
      await cloudflare.dns.records.create({
        type: "A",
        name: appName,
        proxied: false, // Direct connection to K8s NodePort (no Cloudflare proxy)
        content: ipAddress,
        ttl: 300, // 5 minutes for faster propagation
        zone_id: process.env.CLOUDFLARE_ZONE_ID
      });

      console.log(`[DNSService] ✅ Created DNS record for ${appName}`);
      console.log(`[DNSService] Record will be accessible at: https://${appName}.uizb210.xyz`);
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

    console.log(`[DNSService] Deleting DNS for ${appName}`);

    const records = await cloudflare.dns.records.list({
      zone_id: process.env.CLOUDFLARE_ZONE_ID,
    });

    const matchingRecords = records.result?.filter((record: any) =>
      record.name === `${appName}.uizb210.xyz`
    ) || [];

    for (const record of matchingRecords) {
      await cloudflare.dns.records.delete(record.id, {
        zone_id: process.env.CLOUDFLARE_ZONE_ID,
      });
    }

    console.log(`[DNSService] ✅ Deleted DNS for ${appName}`);
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

    const exists = records.result?.some((record: any) =>
      record.name === `${appName}.uizb210.xyz`
    ) || false;

    return exists;
  }
}
