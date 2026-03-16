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
