import { describe, it, expect, vi } from "vitest";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import { NameComDnsProviderAdapter } from "@/lib/domain-service/integrations/dns-provider.adapter";

function createNameComMock() {
  return {
    getDomainSummary: vi.fn(),
    listRecords: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
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

  it("creates A record for apex routing records when KUBE_IP is set", async () => {
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
    nameCom.listRecords.mockResolvedValue({ records: [] });

    const originalKubeIp = process.env.KUBE_IP;
    process.env.KUBE_IP = "139.59.1.6";
    try {
      const adapter = new NameComDnsProviderAdapter(nameCom as never);
      await adapter.ensureRoutingRecord({
        fqdn: "example.com",
        target: "app.apps.hostguardian.net",
        ttl: 300,
      });

      expect(nameCom.createRecord).toHaveBeenCalledWith("example.com", {
        host: "",
        type: "A",
        answer: "139.59.1.6",
        ttl: 300,
      });
    } finally {
      process.env.KUBE_IP = originalKubeIp;
    }
  });

  it("throws when KUBE_IP is not set for apex routing records", async () => {
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
    nameCom.listRecords.mockResolvedValue({ records: [] });

    const originalKubeIp = process.env.KUBE_IP;
    delete process.env.KUBE_IP;
    try {
      const adapter = new NameComDnsProviderAdapter(nameCom as never);
      await expect(
        adapter.ensureRoutingRecord({
          fqdn: "example.com",
          target: "app.apps.hostguardian.net",
          ttl: 300,
        })
      ).rejects.toThrow("KUBE_IP env var is not set");
    } finally {
      process.env.KUBE_IP = originalKubeIp;
    }
  });

  it("removes conflicting CNAME before writing A record for apex", async () => {
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
          id: 12,
          host: "",
          type: "CNAME",
          answer: "legacy.target.example",
          ttl: 300,
        },
      ],
    });

    const originalKubeIp = process.env.KUBE_IP;
    process.env.KUBE_IP = "139.59.1.6";
    try {
      const adapter = new NameComDnsProviderAdapter(nameCom as never);
      await adapter.ensureRoutingRecord({
        fqdn: "example.com",
        target: "app.apps.hostguardian.net",
        ttl: 300,
      });

      expect(nameCom.deleteRecord).toHaveBeenCalledWith("example.com", 12);
      expect(nameCom.createRecord).toHaveBeenCalledWith("example.com", {
        host: "",
        type: "A",
        answer: "139.59.1.6",
        ttl: 300,
      });
    } finally {
      process.env.KUBE_IP = originalKubeIp;
    }
  });

  it("removes matching CNAME records on cleanup", async () => {
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
          id: 101,
          host: "api",
          type: "CNAME",
          answer: "app.example.net",
          ttl: 300,
        },
      ],
    });

    const adapter = new NameComDnsProviderAdapter(nameCom as never);
    await adapter.removeCnameRecord({
      fqdn: "api.example.com",
      target: "app.example.net",
    });

    expect(nameCom.deleteRecord).toHaveBeenCalledWith("example.com", 101);
  });

  it("removes matching apex ANAME records on cleanup", async () => {
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
          id: 305,
          host: "",
          type: "ANAME",
          answer: "app.example.net",
          ttl: 300,
        },
      ],
    });

    const adapter = new NameComDnsProviderAdapter(nameCom as never);
    await adapter.removeRoutingRecord({
      fqdn: "example.com",
      target: "app.example.net",
    });

    expect(nameCom.deleteRecord).toHaveBeenCalledWith("example.com", 305);
  });
});
