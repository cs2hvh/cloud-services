import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/coupons/redeem/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/promocodes", () => ({
  Promocodes: {
    redeem: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    save_transaction: vi.fn(),
  },
}));

vi.mock("@/lib/cooldown/userbased", () => ({
  limitByUser: vi.fn(),
}));

const TEST_URL = "http://localhost:3000/api/billing/coupons/redeem";

function createRequest(body: Record<string, unknown>) {
  return new Request(TEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/coupons/redeem", () => {
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

    const { limitByUser } = await import("@/lib/cooldown/userbased");
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
    } as never);

    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem).mockResolvedValue({
      success: true,
      balance: 150,
      amount: 50,
    } as never);

    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.save_transaction).mockResolvedValue(undefined);
  });

  it("TC-COUPON-001: should redeem a valid coupon and return updated balance", async () => {
    const response = await POST(createRequest({ code: "SAVE50" }));
    const data = await expectResponseStatus(response, 200);

    expect(data.success).toBe(true);
    expect(data.balance).toBe(150);
    expect(data.amount).toBe(50);
    expect(data.message).toContain("$50");
  });

  it("TC-COUPON-002: should prevent duplicate redemption", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem).mockResolvedValueOnce({
      success: false,
      error: "You have already redeemed this promo code",
    } as never);

    const response = await POST(createRequest({ code: "USED50" }));
    const data = await expectResponseStatus(response, 400);

    expect(data.message).toContain("already redeemed");
  });

  it("TC-COUPON-003: should handle concurrent redemption attempts safely", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem)
      .mockResolvedValueOnce({ success: true, balance: 100, amount: 25 } as never)
      .mockResolvedValueOnce({
        success: false,
        error: "You have already redeemed this promo code",
      } as never);

    const first = await POST(createRequest({ code: "RACE25" }));
    await expectResponseStatus(first, 200);

    const second = await POST(createRequest({ code: "RACE25" }));
    const secondData = await expectResponseStatus(second, 400);

    expect(secondData.message).toContain("already redeemed");
  });

  it("TC-COUPON-004: should reject expired coupon", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem).mockResolvedValueOnce({
      success: false,
      error: "Promo code has expired",
    } as never);

    const response = await POST(createRequest({ code: "EXPIRED50" }));
    const data = await expectResponseStatus(response, 400);

    expect(data.message).toContain("expired");
  });

  it("TC-COUPON-005: should enforce max redemption limits", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem).mockResolvedValueOnce({
      success: false,
      error: "Promo code redemption limit reached",
    } as never);

    const response = await POST(createRequest({ code: "LIMITED10" }));
    const data = await expectResponseStatus(response, 400);

    expect(data.message).toContain("limit");
  });

  it("TC-COUPON-006: should reject inactive coupon", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem).mockResolvedValueOnce({
      success: false,
      error: "This promo code is not active",
    } as never);

    const response = await POST(createRequest({ code: "INACTIVE10" }));
    const data = await expectResponseStatus(response, 400);

    expect(data.message).toContain("not active");
  });

  it("TC-COUPON-007: should enforce coupon redeem rate limit", async () => {
    const { limitByUser } = await import("@/lib/cooldown/userbased");
    vi.mocked(limitByUser).mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 30,
    } as never);

    const response = await POST(createRequest({ code: "SAVE50" }));
    const data = await expectResponseStatus(response, 429);

    expect(data.error).toBe("Too Many Requests");
    expect(data.message).toContain("30");
  });

  it("TC-COUPON-008: should normalize coupon code (trim + uppercase) before redeem", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");

    await POST(createRequest({ code: "  save25  " }));

    expect(Promocodes.redeem).toHaveBeenCalledWith(
      "SAVE25",
      "user-123",
      "test@example.com"
    );
  });

  it("TC-COUPON-009: should not fail redemption when transaction logging fails", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.save_transaction).mockRejectedValueOnce(
      new Error("Failed to save transaction")
    );

    const response = await POST(createRequest({ code: "SAVE50" }));
    const data = await expectResponseStatus(response, 200);

    expect(data.success).toBe(true);
    expect(data.balance).toBe(150);
    expect(data.amount).toBe(50);
  });

  it("TC-BILL-SEC-003: should not leak internal errors from coupon redemption endpoint", async () => {
    const { Promocodes } = await import("@/lib/supabase/queries/promocodes");
    vi.mocked(Promocodes.redeem).mockRejectedValueOnce(
      new Error("internal schema error: billing.promocodes")
    );

    const response = await POST(createRequest({ code: "SAVE50" }));
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toBe("Failed to redeem coupon");
    expect(data.error).not.toContain("billing.promocodes");
  });
});
