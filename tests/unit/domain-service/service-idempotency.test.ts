import { describe, it, expect, vi } from "vitest";
import { DomainService } from "@/lib/domain-service/application/domain-service";
import { DOMAIN_ERROR_CODES } from "@/lib/domain-service/core/errors";

function createService() {
  return new DomainService({
    appRead: {
      getOwnedApp: vi.fn().mockResolvedValue({
        id: "app-1",
        user_id: "user-1",
        name: "demo-app",
        slug: "demo-app",
        status: "running",
      }),
    },
    domains: {
      listByApp: vi.fn().mockResolvedValue([]),
      findByIdForUser: vi.fn(),
      findActiveByDomain: vi.fn().mockResolvedValue(null),
      createPending: vi.fn().mockResolvedValue({
        id: "domain-1",
        app_id: "app-1",
        user_id: "user-1",
        domain: "api.example.com",
        status: "pending",
        verification_token: "verify_token",
        verification_method: "txt",
        verified_at: null,
        activated_at: null,
        ssl_status: "pending",
        is_primary: false,
        redirect_to_primary: false,
        last_error: null,
        last_check_at: null,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      }),
      markVerified: vi.fn(),
      markActive: vi.fn(),
      markRemoved: vi.fn(),
      setPrimary: vi.fn(),
      updateLastError: vi.fn(),
    },
    operations: {
      create: vi.fn(),
      findByIdForUser: vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue({
        id: "op-1",
        user_id: "user-1",
        action: "domain.add",
        status: "succeeded",
        domain_id: "domain-1",
        idempotency_key: "idem-1",
        request_data: {},
        response_data: {
          domain: {
            id: "domain-1",
          },
          verification_required: true,
          managed_zone_detected: false,
          ownership_source: "external",
          verification_instructions: {
            record_type: "TXT",
            record_name: "galaxyhvh-verify.api.example.com",
            record_value: "verify_token",
            ttl: 300,
          },
        },
        provider_request_id: null,
        error_code: null,
        error_message: null,
        retryable: false,
        started_at: null,
        finished_at: "2026-03-16T00:00:00Z",
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      }),
      markRunning: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    },
    registrar: {
      getDomainSummary: vi.fn().mockResolvedValue(null),
    },
    dns: {
      listTxtRecords: vi.fn().mockResolvedValue([]),
      ensureRoutingRecord: vi.fn(),
      removeRoutingRecord: vi.fn(),
      ensureCnameRecord: vi.fn(),
      removeCnameRecord: vi.fn(),
    },
    ingress: {
      addDomainToAppIngress: vi.fn(),
      removeDomainFromAppIngress: vi.fn(),
    },
  });
}

describe("DomainService idempotency", () => {
  it("returns cached response for addDomain idempotency key", async () => {
    const service = createService();

    const result = await service.addDomain({
      actor: { userId: "user-1" },
      appId: "550e8400-e29b-41d4-a716-446655440000",
      domain: "api.example.com",
      idempotencyKey: "idem-1",
    });

    expect(result.verification_instructions?.record_type).toBe("TXT");
    expect(result.verification_required).toBe(true);
    expect((result.domain as { id: string }).id).toBe("domain-1");
  });

  it("rejects malformed domain", async () => {
    const service = createService();

    await expect(
      service.addDomain({
        actor: { userId: "user-1" },
        appId: "550e8400-e29b-41d4-a716-446655440000",
        domain: "not a domain",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
    });
  });
});
