import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";

const originalFetch = global.fetch;

describe("NameComRegistrarAdapter", () => {
  beforeEach(() => {
    process.env.NAMECOM_USERNAME = "test-user";
    process.env.NAMECOM_API_TOKEN = "test-token";
    process.env.NAMECOM_API_BASE_URL = "https://api.name.com/core/v1";
    delete process.env.NAMECOM_BASIC_AUTH;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.NAMECOM_USERNAME;
    delete process.env.NAMECOM_API_TOKEN;
    delete process.env.NAMECOM_API_BASE_URL;
    delete process.env.NAMECOM_BASIC_AUTH;
  });

  it("maps 429 responses to provider rate-limited error", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();

    await expect(adapter.getDomainSummary("example.com")).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
    });
  });

  it("maps 400 responses to provider validation error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Bad Request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();

    await expect(adapter.createDomain({ domainName: "bad-domain.com" })).rejects.toMatchObject({
      code: "PROVIDER_VALIDATION_FAILED",
    });
  });

  it("returns parsed hello payload", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          motd: "Hello",
          serverName: "api-1",
          serverTime: "2026-03-16T10:00:00Z",
          username: "test-user",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.hello();

    expect(result.username).toBe("test-user");
    expect(result.serverName).toBe("api-1");
  });

  it("returns parsed domain summary on success", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          domainName: "example.com",
          createDate: "2026-01-01T00:00:00Z",
          expireDate: "2027-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.getDomainSummary("example.com");

    expect(result).toEqual({
      domainName: "example.com",
      createdAt: "2026-01-01T00:00:00Z",
      expiresAt: "2027-01-01T00:00:00Z",
    });
  });

  it("lists DNS records", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            {
              id: 123,
              host: "api",
              type: "CNAME",
              answer: "target.example.com",
              ttl: 300,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.listRecords("example.com");

    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toBe(123);
  });

  it("lists domains", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          domains: [{ domainName: "example.com" }],
          totalCount: 1,
          from: 1,
          to: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.listDomains({ page: 1, perPage: 10 });

    expect(result.totalCount).toBe(1);
    expect(result.domains[0].domainName).toBe("example.com");
  });

  it("checks account balance", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ balance: 42.15 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.checkAccountBalance();

    expect(result.balance).toBe(42.15);
  });

  it("checks domain availability via /domains:checkAvailability", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ domainName: "hello.com", purchasable: true }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.checkAvailability(["hello.com"]);

    expect(result.results[0].domainName).toBe("hello.com");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.name.com/core/v1/domains:checkAvailability",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("searches domains via /domains:search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ domainName: "mybrand.com", purchasable: true }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.searchDomains({ keyword: "mybrand", tldFilter: ["com"] });

    expect(result.results[0].domainName).toBe("mybrand.com");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.name.com/core/v1/domains:search",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("creates a domain via /domains with idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          domain: { domainName: "hello.com" },
          order: 12,
          totalPaid: 12.99,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    const result = await adapter.createDomain(
      { domainName: "hello.com", purchasePrice: 12.99, purchaseType: "registration" },
      { idempotencyKey: "idem-key-1" }
    );

    expect(result.order).toBe(12);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.name.com/core/v1/domains",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      })
    );
    const call = fetchMock.mock.calls[0];
    const headers = call[1].headers as Headers;
    expect(headers.get("X-Idempotency-Key")).toBe("idem-key-1");
  });

  it("handles 204 response on delete", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    await expect(adapter.deleteRecord("example.com", 123)).resolves.toBeUndefined();
  });

  it("throws config error when only token is set", async () => {
    delete process.env.NAMECOM_USERNAME;

    const adapter = new NameComRegistrarAdapter();

    await expect(adapter.hello()).rejects.toMatchObject({
      code: "INTEGRATION_CONFIG_ERROR",
    });
  });

  it("accepts host-only base URL and appends /core/v1", async () => {
    process.env.NAMECOM_API_BASE_URL = "https://api.dev.name.com";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          motd: "Hello",
          serverName: "nameapiserver",
          serverTime: "2026-03-16T10:00:00Z",
          username: "test-user",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new NameComRegistrarAdapter();
    await adapter.hello();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dev.name.com/core/v1/hello",
      expect.any(Object)
    );
  });
});
