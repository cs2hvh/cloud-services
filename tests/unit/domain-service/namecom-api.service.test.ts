import { describe, expect, it, vi } from "vitest";
import { NameComApiService } from "@/lib/domain-service/application/namecom-api.service";

describe("NameComApiService", () => {
  it("delegates hello and balance", async () => {
    const client = {
      hello: vi.fn().mockResolvedValue({ username: "u", motd: "m", serverName: "s", serverTime: "t" }),
      checkAccountBalance: vi.fn().mockResolvedValue({ balance: 10 }),
      listDomains: vi.fn(),
      getDomain: vi.fn(),
      checkAvailability: vi.fn().mockResolvedValue({ results: [{ domainName: "example.com", purchasable: true }] }),
      searchDomains: vi.fn().mockResolvedValue({ results: [{ domainName: "hello.com", purchasable: false }] }),
      createDomain: vi.fn().mockResolvedValue({ domain: { domainName: "hello.com" }, order: 123 }),
      listRecords: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
    };

    const service = new NameComApiService(client as never);
    const hello = await service.hello();
    const balance = await service.checkBalance();
    const availability = await service.checkAvailability(["example.com"]);
    const search = await service.searchDomains({ keyword: "hello" });
    const purchase = await service.purchaseDomain({ domainName: "hello.com", purchasePrice: 12.99 });

    expect(hello.username).toBe("u");
    expect(balance.balance).toBe(10);
    expect(availability.results[0].domainName).toBe("example.com");
    expect(search.results[0].domainName).toBe("hello.com");
    expect(purchase.order).toBe(123);
  });
});
