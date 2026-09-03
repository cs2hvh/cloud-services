import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDomainBillingAdapter } from "@/lib/domain-service/integrations/billing.adapter";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    get_balance: vi.fn(),
    // move_credit replaced deduct-then-save_transaction. The two-step version
    // could leave a domain charged with no ledger row when the second step
    // failed, so the adapter now moves the money and records it in one call.
    move_credit: vi.fn(),
  },
}));

describe("Domain billing adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-DOM-BILL-001: should check balance and charge domain purchase", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValue(50);
    vi.mocked(Billing.move_credit).mockResolvedValue({
      balance: 37.01,
      transactionId: "txn-1",
    });

    const adapter = createDomainBillingAdapter();
    await adapter.chargeDomainPurchase({
      userId: "user-123",
      purchaseRequestId: "req-1",
      domain: "example.com",
      amount: 12.99,
      currency: "USD",
    });

    expect(Billing.get_balance).toHaveBeenCalledWith("user-123");
    // The charge carries its own ledger detail — that is the point of the
    // change. Asserting the type and service keeps a future refactor from
    // quietly dropping the row back out of the money movement.
    expect(Billing.move_credit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        amount: 12.99,
        direction: "debit",
        type: "purchase",
        serviceType: "domain",
      })
    );
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

  it("TC-DOM-BILL-002: should refund domain purchase by crediting the balance", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.move_credit).mockResolvedValue({
      balance: 100,
      transactionId: "txn-2",
    });

    const adapter = createDomainBillingAdapter();
    await adapter.refundDomainPurchase({
      userId: "user-123",
      purchaseRequestId: "req-1",
      domain: "example.com",
      amount: 12.99,
      currency: "USD",
      reason: "purchase_failed",
    });

    expect(Billing.move_credit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        amount: 12.99,
        direction: "credit",
        type: "refund",
        serviceType: "domain",
      })
    );
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
    // A zero-value domain must not move money OR write a ledger row — both are
    // now the same call, so one assertion covers what previously took two.
    expect(Billing.move_credit).not.toHaveBeenCalled();
  });
});
