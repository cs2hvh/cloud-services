import { describe, it, expect, vi } from "vitest";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import { NameComDnsProviderAdapter } from "@/lib/domain-service/integrations/dns-provider.adapter";

function createNameComMock() {
  return {
    getDomainSummary: vi.fn(),
    listRecords: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
  };
}

describe("NameComDnsProviderAdapter", () => {
  it("creates CNAME using discovered managed zone", async () => {
    const nameCom = createNameComMock();
    nameCom.getDomainSummary.mockImplementation(async (domain: string) => {
      if (domain === "example.co.uk") {
        return { domainName: "example.co.uk" };
      }
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND,
        message: "not found",
      });
    });
    nameCom.listRecords.mockResolvedValue({ records: [] });
    nameCom.createRecord.mockResolvedValue({ id: 1 });

    const adapter = new NameComDnsProviderAdapter(nameCom as never);
    await adapter.ensureCnameRecord({
      fqdn: "api.prod.example.co.uk",
      target: "app.apps.hostguardian.net",
      ttl: 120,
    });

    expect(nameCom.createRecord).toHaveBeenCalledWith("example.co.uk", {
      host: "api.prod",
      type: "CNAME",
      answer: "app.apps.hostguardian.net",
      ttl: 300,
    });
  });

  it("updates existing CNAME when target differs", async () => {
    const nameCom = createNameComMock();
    nameCom.getDomainSummary.mockImplementation(async (domain: string) => {
      if (domain === "example.com") {
        return { domainName: "example.com" };
      }
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND,
        message: "not found",
      });
    });
    nameCom.listRecords.mockResolvedValue({
      records: [
        {
          id: 44,
          host: "api",
          type: "CNAME",
          answer: "old-target.example.com",
          ttl: 300,
        },
      ],
    });

    const adapter = new NameComDnsProviderAdapter(nameCom as never);
    await adapter.ensureCnameRecord({
      fqdn: "api.example.com",
      target: "new-target.example.com",
      ttl: 300,
    });

    expect(nameCom.updateRecord).toHaveBeenCalledWith("example.com", 44, {
      host: "api",
      type: "CNAME",
      answer: "new-target.example.com",
      ttl: 300,
    });
  });
});
