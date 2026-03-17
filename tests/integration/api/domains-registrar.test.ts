import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "@/app/api/domains/registrar/route";

const mockGetDomain = vi.fn();
const mockUpdateDomain = vi.fn();
const mockSetNameservers = vi.fn();

vi.mock("@/lib/auth/server-auth");
vi.mock("@/lib/cooldown/userbased");
vi.mock("@/lib/supabase/server");
vi.mock("@/lib/domain-service/http/domain-access");
vi.mock("@/lib/domain-service/integrations/namecom-registrar.adapter", () => ({
  NameComRegistrarAdapter: vi.fn().mockImplementation(function NameComRegistrarAdapterMock() {
    return {
      getDomain: mockGetDomain,
      updateDomain: mockUpdateDomain,
      setNameservers: mockSetNameservers,
    };
  }),
}));

describe("Domains registrar route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticateUser } = await import("@/lib/auth/server-auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      authenticated: true,
      user: { id: "user-1", email: "user@example.com" },
    } as never);

    const { limitByUser } = await import("@/lib/cooldown/userbased");
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 } as never);

    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockResolvedValue({} as never);

    const { userOwnsDomain, resolveManagedZone, normalizeDomain, isValidDomain } = await import(
      "@/lib/domain-service/http/domain-access"
    );
    vi.mocked(normalizeDomain).mockImplementation((value: string) =>
      value.trim().toLowerCase().replace(/\.$/, "")
    );
    vi.mocked(isValidDomain).mockImplementation((value: string) => value.includes("."));
    vi.mocked(userOwnsDomain).mockResolvedValue({
      owned: true,
      viaConnection: true,
      viaPurchase: false,
    });
    vi.mocked(resolveManagedZone).mockResolvedValue({
      zone: "mybrandwork.com",
      host: "@",
    });

    mockGetDomain.mockResolvedValue({
      domainName: "mybrandwork.com",
      autorenewEnabled: false,
      locked: true,
      privacyEnabled: true,
      expireDate: "2027-03-16T10:40:10Z",
      nameservers: ["ns1.example.net", "ns2.example.net"],
    });
    mockUpdateDomain.mockResolvedValue({});
    mockSetNameservers.mockResolvedValue({});
  });

  it("GET returns registrar settings for managed domain", async () => {
    const req = new Request("http://localhost:3000/api/domains/registrar?domain=mybrandwork.com");
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.managed).toBe(true);
    expect(body.data.zone).toBe("mybrandwork.com");
    expect(Array.isArray(body.data.nameservers)).toBe(true);
  });

  it("PATCH validates update payload", async () => {
    const req = new Request("http://localhost:3000/api/domains/registrar", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "mybrandwork.com" }),
    });

    const res = await PATCH(req as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH updates auto-renew and nameservers", async () => {
    const req = new Request("http://localhost:3000/api/domains/registrar", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain: "mybrandwork.com",
        autorenew_enabled: true,
        nameservers: ["ns1.example.net", "ns2.example.net"],
      }),
    });

    const res = await PATCH(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdateDomain).toHaveBeenCalled();
    expect(mockSetNameservers).toHaveBeenCalled();
  });
});
