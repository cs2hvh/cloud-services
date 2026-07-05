import { describe, expect, it, vi } from "vitest";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import { DomainMarketplaceService } from "@/lib/domain-service/application/domain-marketplace.service";

function createService(overrides?: {
  purchasable?: boolean;
  latestStatus?: "requested" | "processing" | "completed" | "failed" | "cancelled" | null;
  latestCreatedAt?: string;
  getDomain?: ReturnType<typeof vi.fn>;
  billing?: {
    chargeDomainPurchase: ReturnType<typeof vi.fn>;
    refundDomainPurchase: ReturnType<typeof vi.fn>;
    findDomainPurchaseSettlement?: ReturnType<typeof vi.fn>;
  };
}) {
  const nameCom = {
    checkAvailability: vi.fn().mockResolvedValue({
      results: [
        {
          domainName: "hello.com",
          purchasable: overrides?.purchasable ?? true,
          purchasePrice: 12.99,
          renewalPrice: 19.99,
          purchaseType: "registration",
        },
      ],
    }),
    searchDomains: vi.fn().mockResolvedValue({
      results: [
        {
          domainName: "hello.com",
          purchasable: true,
          purchasePrice: 12.99,
          renewalPrice: 19.99,
        },
      ],
    }),
    purchaseDomain: vi.fn().mockResolvedValue({
      domain: { domainName: "hello.com" },
      order: 1001,
      totalPaid: 12.99,
    }),
    ...(overrides?.getDomain ? { getDomain: overrides.getDomain } : {}),
  };

  const appRead = {
    getOwnedApp: vi.fn().mockResolvedValue({ id: "app-1", user_id: "user-1", name: "demo", slug: "demo" }),
  };

  const purchaseRequests = {
    create: vi.fn().mockResolvedValue({
      id: "req-1",
      user_id: "user-1",
      app_id: "app-1",
      domain: "hello.com",
      status: "processing",
      purchase_price: 12.99,
      renewal_price: 19.99,
      currency: "USD",
      provider: "namecom",
      idempotency_key: null,
      provider_request_id: null,
      last_error: null,
      metadata: {},
      created_at: "2026-03-16T00:00:00Z",
      updated_at: "2026-03-16T00:00:00Z",
    }),
    findByIdForUser: vi.fn(),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findLatestByDomain: vi.fn().mockResolvedValue(
      overrides?.latestStatus
        ? {
            id: "req-existing",
            user_id: "user-1",
            app_id: "app-1",
            domain: "hello.com",
            status: overrides.latestStatus,
            purchase_price: 12.99,
            renewal_price: 19.99,
            currency: "USD",
            provider: "namecom",
            idempotency_key: null,
            provider_request_id: null,
            last_error: null,
            metadata: {},
            created_at: overrides.latestCreatedAt ?? "2026-03-16T00:00:00Z",
            updated_at: overrides.latestCreatedAt ?? "2026-03-16T00:00:00Z",
          }
        : null
    ),
    listByUser: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
  };

  const service = new DomainMarketplaceService(
    nameCom as never,
    appRead as never,
    purchaseRequests as never,
    {
      billing: overrides?.billing as never,
    }
  );
  return { service, nameCom, appRead, purchaseRequests };
}

describe("DomainMarketplaceService", () => {
  it("returns reseller summary", () => {
    process.env.NAMECOM_USERNAME = "tester";
    process.env.NAMECOM_API_TOKEN = "token";

    const { service } = createService();
    const summary = service.getSummary();

    expect(summary.channel).toBe("ahuracloud");
    expect(summary.configured).toBe(true);
    expect(summary.capabilities.auto_fulfillment).toBe(true);
  });

  it("searches domains through registrar backend", async () => {
    const { service, nameCom } = createService();
    const result = await service.search({ query: "hello.com" });

    expect(nameCom.checkAvailability).toHaveBeenCalledWith(["hello.com"]);
    expect(result.results[0].domainName).toBe("hello.com");
    expect(result.results[0].fulfillment).toBe("ahuracloud");
  });

  it("creates purchase request for available domain", async () => {
    const billing = {
      chargeDomainPurchase: vi.fn().mockResolvedValue(undefined),
      refundDomainPurchase: vi.fn().mockResolvedValue(undefined),
    };
    const { service, purchaseRequests, nameCom } = createService({ billing });

    const request = await service.createPurchaseRequest({
      actor: { userId: "user-1" },
      appId: "app-1",
      domain: "hello.com",
    });

    expect(purchaseRequests.create).toHaveBeenCalled();
    expect(billing.chargeDomainPurchase).toHaveBeenCalledWith({
      userId: "user-1",
      purchaseRequestId: "req-1",
      domain: "hello.com",
      amount: 12.99,
      currency: "USD",
    });
    expect(nameCom.purchaseDomain).toHaveBeenCalled();
    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith({
      requestId: "req-1",
      status: "completed",
      providerRequestId: "1001",
      lastError: null,
    });
    expect(request.status).toBe("completed");
  });

  it("creates global purchase request without app assignment", async () => {
    const { service, appRead, purchaseRequests } = createService();

    await service.createPurchaseRequest({
      actor: { userId: "user-1" },
      domain: "hello.com",
    });

    expect(appRead.getOwnedApp).not.toHaveBeenCalled();
    expect(purchaseRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: null,
        domain: "hello.com",
      })
    );
  });

  it("blocks new purchase when a completed request exists for the domain", async () => {
    const { service, purchaseRequests, nameCom } = createService({ latestStatus: "completed" });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
    });

    expect(nameCom.checkAvailability).not.toHaveBeenCalled();
    expect(purchaseRequests.create).not.toHaveBeenCalled();
  });

  it("blocks new purchase when a fresh in-flight request exists", async () => {
    const getDomain = vi.fn();
    const { service, purchaseRequests } = createService({
      latestStatus: "processing",
      latestCreatedAt: new Date().toISOString(),
      getDomain,
    });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
    });

    expect(getDomain).not.toHaveBeenCalled();
    expect(purchaseRequests.create).not.toHaveBeenCalled();
  });

  it("blocks stale in-flight request when registrar state cannot be verified", async () => {
    // nameCom mock has no getDomain — the service must stay conservative
    const { service, purchaseRequests } = createService({ latestStatus: "requested" });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
    });

    expect(purchaseRequests.create).not.toHaveBeenCalled();
  });

  it("auto-fails stale in-flight request, refunds proven charge, and proceeds", async () => {
    const getDomain = vi.fn().mockRejectedValue(
      new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND,
        message: "Registrar resource not found",
      })
    );
    const billing = {
      chargeDomainPurchase: vi.fn().mockResolvedValue(undefined),
      refundDomainPurchase: vi.fn().mockResolvedValue(undefined),
      findDomainPurchaseSettlement: vi.fn().mockResolvedValue({ charged: true, refunded: false }),
    };
    const { service, purchaseRequests } = createService({
      latestStatus: "processing",
      getDomain,
      billing,
    });

    const request = await service.createPurchaseRequest({
      actor: { userId: "user-1" },
      appId: "app-1",
      domain: "hello.com",
    });

    // Stale request refunded and closed out
    expect(billing.refundDomainPurchase).toHaveBeenCalledWith({
      userId: "user-1",
      purchaseRequestId: "req-existing",
      domain: "hello.com",
      amount: 12.99,
      currency: "USD",
      reason: "stale_purchase_auto_failed",
    });
    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-existing",
        status: "failed",
        metadata: expect.objectContaining({
          stale_auto_failed: true,
          refund_status: "completed",
        }),
      })
    );

    // New purchase proceeded normally
    expect(purchaseRequests.create).toHaveBeenCalled();
    expect(request.status).toBe("completed");
  });

  it("flags stale in-flight request for review when registrar already has the domain", async () => {
    const getDomain = vi.fn().mockResolvedValue({ domainName: "hello.com" });
    const { service, purchaseRequests } = createService({
      latestStatus: "processing",
      getDomain,
    });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
      details: expect.objectContaining({ stale_review: true }),
    });

    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-existing",
        metadata: expect.objectContaining({ stale_review: true }),
      })
    );
    expect(purchaseRequests.create).not.toHaveBeenCalled();
  });

  it("fails when domain is not available", async () => {
    const { service } = createService({ purchasable: false });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_NOT_AVAILABLE,
    });

  });

  it("maps registrar validation availability race to DOMAIN_NOT_AVAILABLE", async () => {
    const billing = {
      chargeDomainPurchase: vi.fn().mockResolvedValue(undefined),
      refundDomainPurchase: vi.fn().mockResolvedValue(undefined),
    };
    const { service, nameCom, purchaseRequests } = createService({ billing });
    nameCom.purchaseDomain.mockRejectedValue(
      new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
        message: "Name.com request validation failed: domain already registered",
      })
    );

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_NOT_AVAILABLE,
    });

    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        status: "failed",
        lastError: "Domain hello.com is no longer available for registration",
      })
    );
    expect(billing.refundDomainPurchase).toHaveBeenCalledWith({
      userId: "user-1",
      purchaseRequestId: "req-1",
      domain: "hello.com",
      amount: 12.99,
      currency: "USD",
      reason: "purchase_failed",
    });
    // Refund outcome is durably recorded on the request row
    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        status: "failed",
        metadata: expect.objectContaining({ refund_status: "completed", refund_amount: 12.99 }),
      })
    );
  });

  it("records failed refund durably and surfaces it when refund fails after purchase failure", async () => {
    const billing = {
      chargeDomainPurchase: vi.fn().mockResolvedValue(undefined),
      refundDomainPurchase: vi.fn().mockRejectedValue(new Error("billing backend down")),
    };
    const { service, nameCom, purchaseRequests } = createService({ billing });
    nameCom.purchaseDomain.mockRejectedValue(new Error("registrar timeout"));

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      details: expect.objectContaining({ refund_status: "failed" }),
    });

    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        status: "failed",
        metadata: expect.objectContaining({
          refund_status: "failed",
          refund_amount: 12.99,
          refund_review: true,
        }),
      })
    );
  });

  it("fails fast when billing charge fails", async () => {
    const billing = {
      chargeDomainPurchase: vi.fn().mockRejectedValue(
        new DomainServiceError({
          code: DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS,
          message: "Insufficient credits",
        })
      ),
      refundDomainPurchase: vi.fn().mockResolvedValue(undefined),
    };
    const { service, nameCom, purchaseRequests } = createService({ billing });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS,
    });

    expect(nameCom.purchaseDomain).not.toHaveBeenCalled();
    expect(purchaseRequests.updateStatus).toHaveBeenCalledWith({
      requestId: "req-1",
      status: "failed",
      lastError: "Insufficient credits",
    });
  });

  it("rejects idempotency key reuse for different payload", async () => {
    const { service, purchaseRequests } = createService();
    purchaseRequests.findByIdempotencyKey.mockResolvedValue({
      id: "req-other",
      user_id: "user-1",
      app_id: "app-other",
      domain: "other.com",
      status: "requested",
      purchase_price: 10,
      renewal_price: 10,
      currency: "USD",
      provider: "namecom",
      idempotency_key: "key-12345678",
      provider_request_id: null,
      last_error: null,
      metadata: {},
      created_at: "2026-03-16T00:00:00Z",
      updated_at: "2026-03-16T00:00:00Z",
    });

    await expect(
      service.createPurchaseRequest({
        actor: { userId: "user-1" },
        appId: "app-1",
        domain: "hello.com",
        idempotencyKey: "key-12345678",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
    });
  });
});
