import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getDomains, POST as postDomains } from "@/app/api/v1/domains/route";
import { POST as postActivateDomain } from "@/app/api/v1/domains/[id]/activate/route";
import { GET as getOperation } from "@/app/api/v1/domain-operations/[operationId]/route";
import { authenticateApiRequest, getRateLimitConfig } from "@/lib/api-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

vi.mock("@/lib/api-auth", () => ({
  authenticateApiRequest: vi.fn(),
  getRateLimitConfig: vi.fn(),
}));
vi.mock("@/lib/cooldown/userbased", () => ({
  limitByUser: vi.fn(),
}));
vi.mock("@/lib/domain-service", () => ({
  getDomainService: vi.fn(),
}));

const mockAuth = {
  authenticated: true as const,
  kind: "pat" as const,
  userId: "ccf391ef-271b-45e7-9799-3b1be3422363",
  tokenId: "token-1",
  plan: "free" as const,
};

function createContext(paramName: string, value: string) {
  return {
    params: Promise.resolve({ [paramName]: value }),
  };
}

describe("v1 domains routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(authenticateApiRequest).mockResolvedValue(mockAuth);
    vi.mocked(getRateLimitConfig).mockReturnValue({ limit: 30, windowMs: 60_000 });
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true } as never);

    const { getDomainService } = await import("@/lib/domain-service");
    vi.mocked(getDomainService).mockReturnValue({
      listDomains: vi.fn().mockResolvedValue([
        {
          id: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d",
          app_id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: mockAuth.userId,
          domain: "api.example.com",
          status: "pending",
          verification_token: "verify_abc",
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
        },
      ]),
      addDomain: vi.fn().mockResolvedValue({
        domain: {
          id: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d",
          app_id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: mockAuth.userId,
          domain: "api.example.com",
          status: "pending",
          verification_token: "verify_abc",
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
        },
        verification_instructions: {
          record_type: "TXT",
          record_name: "galaxyhvh-verify.api.example.com",
          record_value: "verify_abc",
          ttl: 300,
        },
      }),
      activateDomain: vi.fn().mockResolvedValue({
        id: "f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0",
        status: "pending",
      }),
      getOperation: vi.fn().mockResolvedValue({
        id: "f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0",
        action: "domain.activate",
        status: "running",
        domain_id: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d",
        error_code: null,
        error_message: null,
        retryable: false,
        started_at: "2026-03-16T00:00:00Z",
        finished_at: null,
        created_at: "2026-03-16T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
      }),
      verifyDomain: vi.fn(),
      setPrimaryDomain: vi.fn(),
      removeDomain: vi.fn(),
    } as never);
  });

  it("lists domains", async () => {
    const req = new Request("http://localhost:3000/api/v1/domains?app_id=550e8400-e29b-41d4-a716-446655440000", {
      method: "GET",
      headers: { authorization: "Bearer sk_live_test" },
    });

    const res = await getDomains(req as never, { params: Promise.resolve({}) } as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.meta.total).toBe(1);
  });

  it("adds domain and returns 201", async () => {
    const req = new Request("http://localhost:3000/api/v1/domains", {
      method: "POST",
      headers: {
        authorization: "Bearer sk_live_test",
        "content-type": "application/json",
        "idempotency-key": "idem-add-1",
      },
      body: JSON.stringify({
        app_id: "550e8400-e29b-41d4-a716-446655440000",
        domain: "api.example.com",
      }),
    });

    const res = await postDomains(req as never, { params: Promise.resolve({}) } as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.verification_instructions.record_type).toBe("TXT");
  });

  it("queues activation and returns 202", async () => {
    const req = new Request("http://localhost:3000/api/v1/domains/0bc8b49e-4107-4c8a-95ed-a3d86d08753d/activate", {
      method: "POST",
      headers: { authorization: "Bearer sk_live_test" },
    });

    const res = await postActivateDomain(
      req as never,
      createContext("id", "0bc8b49e-4107-4c8a-95ed-a3d86d08753d") as never
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.data.operation_id).toBe("f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0");
  });

  it("returns operation status", async () => {
    const req = new Request("http://localhost:3000/api/v1/domain-operations/f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0", {
      method: "GET",
      headers: { authorization: "Bearer sk_live_test" },
    });

    const res = await getOperation(
      req as never,
      createContext("operationId", "f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0") as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("running");
  });
});
