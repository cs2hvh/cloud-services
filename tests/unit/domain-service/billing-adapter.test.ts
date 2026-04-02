import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDomainBillingAdapter } from "@/lib/domain-service/integrations/billing.adapter";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    get_balance: vi.fn(),
    deduct: vi.fn(),
    topup: vi.fn(),
  },
}));

describe("Domain billing adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-DOM-BILL-001: should check balance and charge domain purchase", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValue(50);
    vi.mocked(Billing.deduct).mockResolvedValue(37.01 as never);

    const adapter = createDomainBillingAdapter();
    await adapter.chargeDomainPurchase({
      userId: "user-123",
      purchaseRequestId: "req-1",
      domain: "example.com",
      amount: 12.99,
      currency: "USD",
    });

    expect(Billing.get_balance).toHaveBeenCalledWith("user-123");
    expect(Billing.deduct).toHaveBeenCalledWith("user-123", 12.99);
  });

  it("TC-DOM-BILL-001: should throw insufficient credits error when balance is too low", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValue(3);

    const adapter = createDomainBillingAdapter();

    await expect(
      adapter.chargeDomainPurchase({
        userId: "user-123",
        purchaseRequestId: "req-1",
        domain: "example.com",
        amount: 12.99,
        currency: "USD",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.INSUFFICIENT_CREDITS,
    });
  });

  it("TC-DOM-BILL-002: should refund domain purchase by topping up balance", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 100 } as never);

    const adapter = createDomainBillingAdapter();
    await adapter.refundDomainPurchase({
      userId: "user-123",
      purchaseRequestId: "req-1",
      domain: "example.com",
      amount: 12.99,
      currency: "USD",
      reason: "purchase_failed",
    });

    expect(Billing.topup).toHaveBeenCalledWith("user-123", 12.99);
  });

  it("TC-DOM-BILL-003: should prevent negative purchase amounts", async () => {
    const adapter = createDomainBillingAdapter();

    await expect(
      adapter.chargeDomainPurchase({
        userId: "user-123",
        purchaseRequestId: "req-1",
        domain: "example.com",
        amount: -1,
        currency: "USD",
      })
    ).rejects.toBeInstanceOf(DomainServiceError);

    await expect(
      adapter.chargeDomainPurchase({
        userId: "user-123",
        purchaseRequestId: "req-1",
        domain: "example.com",
        amount: -1,
        currency: "USD",
      })
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
    });
  });

  it("TC-DOM-BILL-003: should skip zero-value purchase charges and refunds", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValue(100);

    const adapter = createDomainBillingAdapter();

    await adapter.chargeDomainPurchase({
      userId: "user-123",
      purchaseRequestId: "req-1",
      domain: "example.com",
      amount: 0,
      currency: "USD",
    });

    await adapter.refundDomainPurchase({
      userId: "user-123",
      purchaseRequestId: "req-1",
      domain: "example.com",
      amount: 0,
      currency: "USD",
      reason: "noop",
    });

    expect(Billing.get_balance).not.toHaveBeenCalled();
    expect(Billing.deduct).not.toHaveBeenCalled();
    expect(Billing.topup).not.toHaveBeenCalled();
  });
});
