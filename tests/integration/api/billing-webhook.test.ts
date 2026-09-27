//@ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/webhook/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    get_transaction_by_session: vi.fn(),
    topup: vi.fn(),
    save_transaction: vi.fn(),
  },
}));

const TEST_URL = "http://localhost:3000/api/billing/webhook";
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function createWebhookRequest(body = '{"id":"evt_test"}', signature = "sig_test") {
  return new Request(TEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });
}

function createCheckoutCompletedEvent(overrides?: Partial<Record<string, unknown>>) {
  const session = {
    id: "cs_test_123",
    metadata: {
      user_id: "user-123",
      amount: "50",
    },
    amount_total: 5000,
    payment_intent: "pi_123",
    invoice: null,
    ...(overrides ?? {}),
  };

  return {
    id: "evt_test_123",
    type: "checkout.session.completed",
    data: { object: session },
  };
}

describe("POST /api/billing/webhook", () => {
  const mockStripe = {
    webhooks: {
      constructEvent: vi.fn(),
    },
    paymentIntents: {
      retrieve: vi.fn(),
    },
    charges: {
      retrieve: vi.fn(),
    },
    invoices: {
      retrieve: vi.fn(),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

    const { getStripeClient } = await import("@/lib/stripe");
    vi.mocked(getStripeClient).mockReturnValue(mockStripe as never);

    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_transaction_by_session).mockResolvedValue(null);
    vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 150 } as never);
    vi.mocked(Billing.save_transaction).mockResolvedValue(undefined);

    mockStripe.webhooks.constructEvent.mockReturnValue(createCheckoutCompletedEvent());
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      latest_charge: "ch_123",
    });
    mockStripe.charges.retrieve.mockResolvedValue({
      receipt_url: "https://stripe.com/receipts/ch_123",
    });
    mockStripe.invoices.retrieve.mockResolvedValue({
      hosted_invoice_url: "https://stripe.com/invoices/in_123",
    });
    // The webhook re-reads every session from Stripe. By default Stripe
    // returns the session the event named, paid, in payment mode.
    mockStripe.checkout.sessions.retrieve.mockImplementation(async () => {
      const event = mockStripe.webhooks.constructEvent.mock.results.at(-1)?.value;
      return { payment_status: "paid", mode: "payment", ...(event?.data?.object ?? {}) };
    });
  });

  it("TC-WEBHOOK-001: should reject missing stripe-signature header", async () => {
    const request = createWebhookRequest('{"id":"evt_missing_sig"}', "");
    const response = await POST(request);
    const data = await expectResponseStatus(response, 400);

    expect(data.error).toContain("Missing stripe-signature");
  });

  it("TC-WEBHOOK-001: should reject webhook when secret is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const response = await POST(createWebhookRequest());
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toContain("Webhook not configured");
  });

  it("TC-WEBHOOK-001: should reject invalid webhook signature", async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const response = await POST(createWebhookRequest('{"id":"evt_invalid_sig"}'));
    const data = await expectResponseStatus(response, 400);

    expect(data.error).toBe("Invalid signature");
  });

  it("TC-WEBHOOK-002: should credit user balance on checkout.session.completed", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");

    const response = await POST(createWebhookRequest());
    const data = await expectResponseStatus(response, 200);

    expect(data.received).toBe(true);
    expect(Billing.topup).toHaveBeenCalledWith("user-123", 50);
    expect(Billing.save_transaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        stripeSessionId: "cs_test_123",
        stripePaymentIntent: "pi_123",
        amount: 50,
        status: "completed",
        type: "topup",
        balanceAfter: 150,
        receiptUrl: "https://stripe.com/receipts/ch_123",
      })
    );
  });

  it("TC-WEBHOOK-003: should use Stripe amount_total instead of metadata amount", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    mockStripe.webhooks.constructEvent.mockReturnValue(
      createCheckoutCompletedEvent({
        metadata: { user_id: "user-123", amount: "1" },
        amount_total: 10000,
      })
    );

    const response = await POST(createWebhookRequest());
    await expectResponseStatus(response, 200);

    expect(Billing.topup).toHaveBeenCalledWith("user-123", 100);
  });

  it("TC-WEBHOOK-004: should prevent double-crediting with idempotency check", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_transaction_by_session).mockResolvedValueOnce({
      id: "txn_123",
      status: "completed",
    } as never);

    const response = await POST(createWebhookRequest());
    const data = await expectResponseStatus(response, 200);

    expect(data.received).toBe(true);
    expect(Billing.topup).not.toHaveBeenCalled();
    expect(Billing.save_transaction).not.toHaveBeenCalled();
  });

  it("TC-WEBHOOK-005: should acknowledge unknown event types gracefully", async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: "evt_unknown_123",
      type: "payment_intent.succeeded",
      data: { object: {} },
    });

    const response = await POST(createWebhookRequest('{"id":"evt_unknown_123"}'));
    const data = await expectResponseStatus(response, 200);

    expect(data.received).toBe(true);
  });

  it("TC-WEBHOOK-006: should handle missing metadata without crediting", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    mockStripe.webhooks.constructEvent.mockReturnValue(
      createCheckoutCompletedEvent({
        metadata: { amount: "50" },
      })
    );

    const response = await POST(createWebhookRequest());
    const data = await expectResponseStatus(response, 200);

    expect(data.received).toBe(true);
    expect(Billing.topup).not.toHaveBeenCalled();
    expect(Billing.save_transaction).not.toHaveBeenCalled();
  });

  it("TC-WEBHOOK-007: should continue when receipt retrieval fails", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    mockStripe.paymentIntents.retrieve.mockRejectedValueOnce(
      new Error("Failed to retrieve payment intent")
    );

    const response = await POST(createWebhookRequest());
    await expectResponseStatus(response, 200);

    expect(Billing.topup).toHaveBeenCalled();
    expect(Billing.save_transaction).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptUrl: undefined,
      })
    );
  });

  it("TC-WEBHOOK-008: should avoid duplicate credit during repeated deliveries", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_transaction_by_session)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "txn_456", status: "completed" } as never);

    const first = await POST(createWebhookRequest('{"id":"evt_concurrent_1"}'));
    await expectResponseStatus(first, 200);

    const second = await POST(createWebhookRequest('{"id":"evt_concurrent_2"}'));
    await expectResponseStatus(second, 200);

    expect(Billing.topup).toHaveBeenCalledTimes(1);
    expect(Billing.save_transaction).toHaveBeenCalledTimes(1);
  });

  it("TC-WEBHOOK-009: should return 500 when Billing.topup fails so Stripe retries", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.topup).mockRejectedValueOnce(new Error("Topup RPC failed"));

    const response = await POST(createWebhookRequest());
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toBe("Processing failed");
  });

  it("TC-WEBHOOK-010: does not credit a session Stripe reports as unpaid", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      ...createCheckoutCompletedEvent().data.object,
      mode: "payment",
      payment_status: "unpaid",
    });

    const response = await POST(createWebhookRequest());
    await expectResponseStatus(response, 200);

    expect(Billing.topup).not.toHaveBeenCalled();
  });

  it("TC-WEBHOOK-011: credits from Stripe's copy of the session, not the event body", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    // A forged event claims $5,000; Stripe's own session says $50.
    mockStripe.webhooks.constructEvent.mockReturnValue(
      createCheckoutCompletedEvent({ amount_total: 500000, metadata: { user_id: "attacker", amount: "5000" } })
    );
    mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      ...createCheckoutCompletedEvent().data.object,
      mode: "payment",
      payment_status: "paid",
    });

    const response = await POST(createWebhookRequest());
    await expectResponseStatus(response, 200);

    expect(Billing.topup).toHaveBeenCalledWith("user-123", 50);
  });

  it("TC-WEBHOOK-012: refuses an event naming a session the account does not have", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    mockStripe.checkout.sessions.retrieve.mockRejectedValueOnce(
      Object.assign(new Error("No such checkout.session"), { code: "resource_missing" })
    );

    const response = await POST(createWebhookRequest());
    await expectResponseStatus(response, 400);

    expect(Billing.topup).not.toHaveBeenCalled();
  });

  it("TC-WEBHOOK-013: ignores a live-mode event on a test-mode deployment", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    mockStripe.webhooks.constructEvent.mockReturnValue({ ...createCheckoutCompletedEvent(), livemode: true });

    const response = await POST(createWebhookRequest());
    await expectResponseStatus(response, 200);

    expect(mockStripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(Billing.topup).not.toHaveBeenCalled();
  });

  afterAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  });
});
