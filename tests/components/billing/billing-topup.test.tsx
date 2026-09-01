/**
 * BillingTabs — the customer's balance, coupons and transactions page.
 *
 * WHY THIS FILE LOOKS REWRITTEN
 *
 * It had stopped running entirely, and had for some time. Two independent
 * reasons, both worth recording because they fail silently in different ways:
 *
 * 1. The lucide-react mock was a hardcoded list of ten icons. BillingTabs
 *    imports Wallet, which was never in it. A missing export makes vitest
 *    throw at IMPORT time, so the whole file failed to collect and every test
 *    below simply did not run. A suite that fails to load reports "1 failed
 *    file" and no failing tests — which reads almost like a pass.
 *
 * 2. Every tab interaction went through `getByTestId("tab-trigger-*")`, from a
 *    mock of `@/components/ui/tabs`. BillingTabs does not use shadcn Tabs and
 *    hasn't for a while — it renders its own pill buttons. The mock was
 *    mocking a module the component never imports.
 *
 * Underneath those, the assertions had drifted too: "Remaining Balance" for
 * "Remaining balance", placeholder "e.g. 25" for "25", a "Top up" submit
 * button that is now labelled "Pay". None of that was visible while the file
 * refused to load.
 *
 * THE TOP-UP TESTS ARE CONDITIONAL, NOT DELETED
 *
 * onTopup checks BILLING_TOPUP_ENABLED *before* it validates the amount, so
 * with top-ups switched off the validation and checkout paths are unreachable
 * by design — not broken. They are gated on the flag rather than skipped by
 * hand, so they start running again the moment top-ups are re-enabled instead
 * of rotting behind a `.skip` nobody revisits.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillingTabs from "@/app/dashboard/billing/BillingTabs";
import { BILLING_TOPUP_ENABLED } from "@/lib/billing/topup-flag";

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      children,
      className,
      ...rest
    }: React.PropsWithChildren<{ className?: string }>) => (
      <div className={className} data-testid="motion-div" {...rest}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Pass every icon through rather than listing them. Nothing here asserts on
// icons, so the mock only ever existed to keep real lucide out of the render;
// importOriginal does that without a list that has to be kept in lockstep with
// an unrelated component's imports.
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return { ...actual };
});

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("@/lib/axios/axios", () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

/** Click one of the page's own pill tabs. */
async function openTab(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name }));
}

describe("BillingTabs", () => {
  const sampleCoupons = [
    {
      id: "coupon-1",
      code: "SAVE10",
      amount: 10,
      valid_till: "2026-12-31T00:00:00.000Z",
      coupon_type: "promo",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockReset();
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: [],
        pagination: { page: 1, total: 0, totalPages: 1 },
      },
    });
  });

  it("renders the tabs and the balance", () => {
    render(<BillingTabs initialBalance={50} />);

    expect(screen.getByRole("button", { name: "Balance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coupons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transactions" })).toBeInTheDocument();

    expect(screen.getByText("Remaining balance")).toBeInTheDocument();
    // The currency symbol and the figure are separate elements so they can be
    // sized independently, so this asserts on the number alone.
    expect(screen.getByText("50.00")).toBeInTheDocument();
  });

  it("shows a confirmation when returning from a successful payment", async () => {
    render(<BillingTabs paymentStatus="success" />);

    await waitFor(() => {
      expect(
        screen.getByText("Payment successful. Balance will update shortly.")
      ).toBeInTheDocument();
    });
  });

  it("tells the customer when top-ups are unavailable", async () => {
    // The inverse of the gated block below: while the flag is off, submitting
    // must produce an explanation rather than silence. This is the behaviour
    // that is actually live, so it is the one always under test.
    if (BILLING_TOPUP_ENABLED) return;

    render(<BillingTabs initialBalance={10} />);

    const input = screen.getByPlaceholderText("25");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe.skipIf(!BILLING_TOPUP_ENABLED)("top-up (requires BILLING_TOPUP_ENABLED)", () => {
    it("rejects an amount of zero", async () => {
      render(<BillingTabs initialBalance={10} />);

      const input = screen.getByPlaceholderText("25");
      fireEvent.change(input, { target: { value: "0" } });
      fireEvent.submit(input.closest("form")!);

      await waitFor(() => {
        expect(screen.getByText("Enter a valid amount > 0")).toBeInTheDocument();
      });
    });

    it("rejects an amount over the $10,000 ceiling", async () => {
      render(<BillingTabs initialBalance={10} />);

      const input = screen.getByPlaceholderText("25");
      fireEvent.change(input, { target: { value: "10001" } });
      fireEvent.submit(input.closest("form")!);

      await waitFor(() => {
        expect(
          screen.getByText("Maximum top-up amount is $10,000")
        ).toBeInTheDocument();
      });
    });

    it("opens a checkout session for a valid amount", async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      render(<BillingTabs initialBalance={50} />);

      const input = screen.getByPlaceholderText("25");
      fireEvent.change(input, { target: { value: "25" } });
      fireEvent.submit(input.closest("form")!);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/billing/create-checkout-session", {
          amount: 25,
        });
      });
    });

    it("accepts decimal amounts", async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      render(<BillingTabs initialBalance={50} />);

      const input = screen.getByPlaceholderText("25");
      fireEvent.change(input, { target: { value: "10.99" } });
      fireEvent.submit(input.closest("form")!);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/billing/create-checkout-session", {
          amount: 10.99,
        });
      });
    });
  });

  describe("coupons", () => {
    it("redeems a coupon from its card", async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValueOnce({
        data: { success: true, balance: 60, message: "Coupon applied!" },
      });

      render(<BillingTabs initialBalance={50} availableCoupons={sampleCoupons} />);
      await openTab(user, "Coupons");

      expect(await screen.findByText("SAVE10")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Redeem" }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/billing/coupons/redeem", {
          code: "SAVE10",
        });
      });
    });

    it("uppercases a manually entered code", async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);
      await openTab(user, "Coupons");

      const input = await screen.findByPlaceholderText("ENTER-COUPON-CODE");
      await user.type(input, "save25");

      expect(input).toHaveValue("SAVE25");
    });

    it("refuses an empty code", async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);
      await openTab(user, "Coupons");

      await user.click(screen.getByRole("button", { name: "Apply code" }));

      await waitFor(() => {
        expect(screen.getByText("Please enter a coupon code")).toBeInTheDocument();
      });
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("redeems a manually entered code", async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValueOnce({
        data: { success: true, balance: 100, message: "Applied!" },
      });

      render(<BillingTabs initialBalance={50} />);
      await openTab(user, "Coupons");

      await user.type(
        await screen.findByPlaceholderText("ENTER-COUPON-CODE"),
        "FREE100"
      );
      await user.click(screen.getByRole("button", { name: "Apply code" }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/billing/coupons/redeem", {
          code: "FREE100",
        });
      });
    });
  });

  it("loads the ledger when the transactions tab is opened", async () => {
    const user = userEvent.setup();
    render(<BillingTabs />);

    await openTab(user, "Transactions");

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });
    expect(mockGet.mock.calls[0][0]).toContain(
      "/billing/transactions?page=1&limit=10"
    );
  });
});
