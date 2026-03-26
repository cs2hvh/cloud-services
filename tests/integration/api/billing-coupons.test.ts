import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/billing/coupons/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/promocodes", () => ({
  Promocodes: {
    get_available_for_user: vi.fn(),
  },
}));

describe("GET /api/billing/coupons", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-123",
              email: "test@example.com",
            },
          },
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.get_available_for_user).mockResolvedValue([
      {
        id: "coupon-1",
        code: "SAVE10",
        amount: 10,
        valid_till: "2026-12-31T00:00:00.000Z",
        coupon_type: "promo",
      },
    ] as never);
  });

  it("TC-COUPON-010: should return available coupons for authenticated user", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    const response = await GET();
    const data = await expectResponseStatus(response, 200);

    expect(Promocodes.get_available_for_user).toHaveBeenCalledWith(
      "user-123",
      "test@example.com"
    );
    expect(data.success).toBe(true);
    expect(data.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SAVE10",
          amount: 10,
        }),
      ])
    );
  });

  it("TC-BILL-SEC-003: should not leak internal errors from coupons endpoint", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.get_available_for_user).mockRejectedValueOnce(
      new Error("permission denied for schema billing")
    );

    const response = await GET();
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toBe("Failed to fetch coupons");
    expect(data.error).not.toContain("permission denied");
  });
});
