//@ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/create-checkout-session/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    get_stripe_customer_id: vi.fn(),
    save_stripe_customer_id: vi.fn(),
  },
}));

const TEST_URL = "http://localhost:3000/api/billing/create-checkout-session";
const TEST_DOMAIN = "https://yourdomain.com";

function createMockRequest(
  body: Record<string, unknown>,
  origin?: string
): Request {
  return new Request(TEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

function createCustomJsonRequest(
  body: Record<string, unknown>,
  origin?: string
): Request {
  return {
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "origin" ? (origin ?? null) : null,
    },
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

describe("POST /api/billing/create-checkout-session", () => {
  const originalDomain = process.env.DOMAIN;

  const mockStripe = {
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DOMAIN = TEST_DOMAIN;

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

    const { getStripeClient } = await import("@/lib/stripe");
    vi.mocked(getStripeClient).mockReturnValue(mockStripe as never);

    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_stripe_customer_id).mockResolvedValue("cus_existing");
    vi.mocked(Billing.save_stripe_customer_id).mockResolvedValue(undefined);

    mockStripe.customers.create.mockResolvedValue({ id: "cus_new" });
    mockStripe.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay_test_123",
    });
  });

  it("TC-STRIPE-001: should create Stripe checkout session for a valid amount", async () => {
    const request = createMockRequest({ amount: 50 }, TEST_DOMAIN);
    const response = await POST(request);
    const data = await expectResponseStatus(response, 200);

    expect(data.url).toBe("https://checkout.stripe.com/c/pay_test_123");
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        mode: "payment",
        metadata: expect.objectContaining({
          user_id: "user-123",
          amount: "50",
        }),
        success_url: `${TEST_DOMAIN}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${TEST_DOMAIN}/dashboard/billing?status=cancelled`,
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "usd",
              unit_amount: 5000,
            }),
          }),
        ],
      })
    );
  });

  it.each([
    { label: "amount 0", body: { amount: 0 }, status: 400 },
    { label: "amount 0.99", body: { amount: 0.99 }, status: 400 },
    { label: "amount 1", body: { amount: 1 }, status: 200 },
    { label: "amount 10000", body: { amount: 10000 }, status: 200 },
    { label: "amount 10001", body: { amount: 10001 }, status: 400 },
    { label: "amount -50", body: { amount: -50 }, status: 400 },
    { label: "amount abc", body: { amount: "abc" }, status: 400 },
    { label: "amount null", body: { amount: null }, status: 400 },
  ])("TC-STRIPE-002: boundary validation - $label", async ({ body, status }) => {
    const request = createMockRequest(body);
    const response = await POST(request);
    await expectResponseStatus(response, status);
  });

  it.each([
    { label: "amount Infinity", body: { amount: Infinity } },
    { label: "amount NaN", body: { amount: NaN } },
  ])("TC-STRIPE-002: boundary validation - $label", async ({ body }) => {
    const request = createCustomJsonRequest(body);
    const response = await POST(request);
    await expectResponseStatus(response, 400);
  });

  it("TC-STRIPE-003: should reject unauthenticated requests", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const request = createMockRequest({ amount: 50 });
    const response = await POST(request);
    const data = await expectResponseStatus(response, 401);

    expect(data.error).toBe("Unauthorized");
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("TC-STRIPE-004: should create customer once and reuse it on subsequent requests", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_stripe_customer_id)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("cus_new");
    mockStripe.customers.create.mockResolvedValueOnce({ id: "cus_new" });

    const first = await POST(createMockRequest({ amount: 20 }, TEST_DOMAIN));
    await expectResponseStatus(first, 200);

    const second = await POST(createMockRequest({ amount: 30 }, TEST_DOMAIN));
    await expectResponseStatus(second, 200);

    expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        metadata: { supabase_user_id: "user-123" },
      })
    );
    expect(Billing.save_stripe_customer_id).toHaveBeenCalledTimes(1);
    expect(Billing.save_stripe_customer_id).toHaveBeenCalledWith(
      "user-123",
      "cus_new"
    );
    expect(mockStripe.checkout.sessions.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ customer: "cus_new" })
    );
    expect(mockStripe.checkout.sessions.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ customer: "cus_new" })
    );
  });

  it.each([
    { origin: TEST_DOMAIN, expectedBase: TEST_DOMAIN },
    { origin: "https://evil.com", expectedBase: TEST_DOMAIN },
    { origin: undefined, expectedBase: TEST_DOMAIN },
    { origin: "https://yourdomain.com.evil.com", expectedBase: TEST_DOMAIN },
  ])(
    "TC-STRIPE-005: should prevent open redirects for origin=$origin",
    async ({ origin, expectedBase }) => {
      const request = createMockRequest({ amount: 10 }, origin);
      const response = await POST(request);
      await expectResponseStatus(response, 200);

      const args = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(args.success_url).toBe(
        `${expectedBase}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`
      );
      expect(args.cancel_url).toBe(
        `${expectedBase}/dashboard/billing?status=cancelled`
      );
      expect(args.success_url).toContain("{CHECKOUT_SESSION_ID}");
    }
  );

  it.each([
    { amount: 1, cents: 100 },
    { amount: 1.01, cents: 101 },
    { amount: 10.99, cents: 1099 },
    { amount: 10.999, cents: 1100 },
  ])(
    "TC-STRIPE-006: should convert $amount to $cents cents accurately",
    async ({ amount, cents }) => {
      const request = createMockRequest({ amount }, TEST_DOMAIN);
      const response = await POST(request);
      await expectResponseStatus(response, 200);

      const args = mockStripe.checkout.sessions.create.mock.calls[0][0];
      expect(args.line_items?.[0]?.price_data?.unit_amount).toBe(cents);
    }
  );

  it("TC-STRIPE-007: should return 500 when Stripe secret key is missing", async () => {
    const { getStripeClient } = await import("@/lib/stripe");
    vi.mocked(getStripeClient).mockImplementation(() => {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    });

    const response = await POST(createMockRequest({ amount: 10 }, TEST_DOMAIN));
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toBe("Failed to create checkout session");
    expect(data.error).not.toContain("STRIPE_SECRET_KEY");
  });

  afterAll(() => {
    process.env.DOMAIN = originalDomain;
  });
});
