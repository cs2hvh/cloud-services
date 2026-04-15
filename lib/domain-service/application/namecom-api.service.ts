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

export class NameComApiService implements DomainMarketplaceRegistrarPort {
  constructor(private readonly client: NameComRegistrarAdapter) {}

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
    return this.client.createDomain(input, options);
  }

  async setRegistrantContact(
    domainName: string,
    contact: { email: string; firstName?: string; lastName?: string }
  ): Promise<void> {
    // name.com requires a complete contact object — partial objects fail with a
    // validation error. Use platform-registered address as the defaults so the
    // address sub-fields always satisfy the API, while only the email is
    // overridden to route ICANN verification to the correct user inbox.
    const phone = process.env.PLATFORM_CONTACT_PHONE;
    const address1 = process.env.PLATFORM_CONTACT_ADDRESS;
    const city = process.env.PLATFORM_CONTACT_CITY;
    const state = process.env.PLATFORM_CONTACT_STATE;
    const zip = process.env.PLATFORM_CONTACT_ZIP;
    const country = process.env.PLATFORM_CONTACT_COUNTRY;

    if (!phone || !address1 || !city || !state || !zip || !country) {
      throw new Error(
        "setRegistrantContact: one or more PLATFORM_CONTACT_* environment variables are not set. " +
        "Required: PLATFORM_CONTACT_PHONE, PLATFORM_CONTACT_ADDRESS, PLATFORM_CONTACT_CITY, " +
        "PLATFORM_CONTACT_STATE, PLATFORM_CONTACT_ZIP, PLATFORM_CONTACT_COUNTRY. " +
        "Set these to the platform's registered name.com contact address."
      );
    }

    await this.client.setContacts(domainName, {
      registrant: {
        email: contact.email,
        ...(contact.firstName ? { firstName: contact.firstName } : {}),
        ...(contact.lastName ? { lastName: contact.lastName } : {}),
        phone,
        address1,
        city,
        state,
        zip,
        country,
      },
    });
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
