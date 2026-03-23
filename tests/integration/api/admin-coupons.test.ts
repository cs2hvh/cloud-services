import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/coupons/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/promocodes", () => ({
  Promocodes: {
    create: vi.fn(),
  },
}));

const TEST_URL = "http://localhost:3000/api/admin/coupons";

function createRequest(body: Record<string, unknown>) {
  return new Request(TEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseAuthMock(user: { id: string; email?: string } | null, roles: string[] = []) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: user ? { roles } : null,
          }),
        }),
      }),
    }),
  };
}

describe("POST /api/admin/coupons", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(
      createSupabaseAuthMock({ id: "admin-123", email: "admin@example.com" }, ["admin"]) as never
    );

    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.create).mockResolvedValue({
      success: true,
      data: {
        id: "coupon-1",
        code: "SAVE50",
        amount: 50,
      },
    } as never);
  });

  it("TC-ADMIN-COUPON-001: should allow admin to create coupon", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    const response = await POST(
      createRequest({
        code: " save50 ",
        amount: 50,
        valid_till: "2026-12-31T00:00:00.000Z",
        coupon_type: "promo",
      })
    );
    const data = await expectResponseStatus(response, 200);

    expect(Promocodes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "SAVE50",
        amount: 50,
        coupon_type: "promo",
        created_by: "admin-123",
      })
    );
    expect(data.success).toBe(true);
  });

  it("TC-ADMIN-COUPON-001: should reject non-admin users", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(
      createSupabaseAuthMock({ id: "user-123", email: "user@example.com" }, ["user"]) as never
    );

    const response = await POST(
      createRequest({
        code: "SAVE10",
        amount: 10,
        valid_till: "2026-12-31T00:00:00.000Z",
        coupon_type: "promo",
      })
    );
    const data = await expectResponseStatus(response, 403);

    expect(data.error).toContain("Admin access required");
  });

  it("TC-ADMIN-COUPON-002: should reject duplicate coupon codes", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.create).mockResolvedValueOnce({
      success: false,
      error: "Promo code already exists",
    } as never);

    const response = await POST(
      createRequest({
        code: "SAVE50",
        amount: 50,
        valid_till: "2026-12-31T00:00:00.000Z",
        coupon_type: "promo",
      })
    );
    const data = await expectResponseStatus(response, 400);

    expect(data.error).toContain("already exists");
  });
});
