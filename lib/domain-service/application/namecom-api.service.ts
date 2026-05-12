import {
  type NameComCreateDomainResponse,
  NameComRegistrarAdapter,
  type NameComCreateDomainInput,
  type NameComCreateRecordInput,
  type NameComDomainResponse,
  type NameComListDomainsResponse,
  type NameComListRecordsResponse,
  type NameComRecord,
  type NameComSearchResponse,
  type NameComUpdateRecordInput,
} from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import type { DomainMarketplaceRegistrarPort } from "@/lib/domain-service/core/ports";

const REQUIRED_CONTACT_ENVS = [
  "PLATFORM_CONTACT_PHONE",
  "PLATFORM_CONTACT_ADDRESS",
  "PLATFORM_CONTACT_CITY",
  "PLATFORM_CONTACT_STATE",
  "PLATFORM_CONTACT_ZIP",
  "PLATFORM_CONTACT_COUNTRY",
] as const;

export class NameComApiService implements DomainMarketplaceRegistrarPort {
  constructor(private readonly client: NameComRegistrarAdapter) {
    const missing = REQUIRED_CONTACT_ENVS.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      console.warn(
        `[NameComApiService] Missing required env vars: ${missing.join(", ")}. ` +
        "setRegistrantContact will throw at runtime — ICANN verification emails will not be routed to users."
      );
    }
  }

  async hello() {
    return this.client.hello();
  }

  async checkBalance() {
    return this.client.checkAccountBalance();
  }

  async listDomains(params?: { page?: number; perPage?: number }): Promise<NameComListDomainsResponse> {
    return this.client.listDomains(params);
  }

  async getDomain(domainName: string): Promise<NameComDomainResponse> {
    return this.client.getDomain(domainName);
  }

  async checkAvailability(domainNames: string[]): Promise<NameComSearchResponse> {
    return this.client.checkAvailability(domainNames);
  }

  async searchDomains(params: {
    keyword: string;
    timeout?: number;
    tldFilter?: string[];
  }): Promise<NameComSearchResponse> {
    return this.client.searchDomains(params);
  }

  async purchaseDomain(
    input: NameComCreateDomainInput,
    options?: { idempotencyKey?: string }
  ): Promise<NameComCreateDomainResponse> {
    const result = await this.client.createDomain(input, options);
    // Enable auto-renew immediately after purchase so the domain never silently
    // expires. Name.com handles the actual renewal — no cron job needed for this.
    // Fire-and-forget: a failure here is non-fatal (domain is already purchased).
    this.client.updateDomain(input.domainName, { autorenewEnabled: true }).catch((err: unknown) => {
      console.warn("[NameComApiService] Failed to enable auto-renew after purchase:", {
        domain: input.domainName,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return result;
  }

  async setRegistrantContact(
    domainName: string,
    contact: {
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      companyName?: string;
      address1?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    }
  ): Promise<void> {
    await this.client.setRegistrantContact(domainName, contact);
  }

  async listDnsRecords(domainName: string, params?: { page?: number; perPage?: number }): Promise<NameComListRecordsResponse> {
    return this.client.listRecords(domainName, params);
  }

  async createDnsRecord(domainName: string, input: NameComCreateRecordInput): Promise<NameComRecord> {
    return this.client.createRecord(domainName, input);
  }

  async updateDnsRecord(domainName: string, recordId: number, input: NameComUpdateRecordInput): Promise<NameComRecord> {
    return this.client.updateRecord(domainName, recordId, input);
  }

  async deleteDnsRecord(domainName: string, recordId: number): Promise<void> {
    await this.client.deleteRecord(domainName, recordId);
  }
}

export function createNameComApiService() {
  return new NameComApiService(new NameComRegistrarAdapter());
}
