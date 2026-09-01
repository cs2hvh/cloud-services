import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillingTabs from "@/app/dashboard/billing/BillingTabs";

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

vi.mock("lucide-react", () => ({
  CreditCard: () => <span data-testid="icon-credit-card" />,
  Ticket: () => <span data-testid="icon-ticket" />,
  Shield: () => <span data-testid="icon-shield" />,
  ExternalLink: () => <span data-testid="icon-external-link" />,
  Receipt: () => <span data-testid="icon-receipt" />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Search: () => <span data-testid="icon-search" />,
  X: () => <span data-testid="icon-x" />,
  Download: () => <span data-testid="icon-download" />,
}));

let tabChangeCallback: ((v: string) => void) | null = null;
let currentTabValue = "balance";

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => {
    tabChangeCallback = onValueChange;
    currentTabValue = value;
    return (
      <div data-testid="tabs" data-value={value}>
        {children}
      </div>
    );
  },
  TabsList: ({ children }: React.PropsWithChildren) => (
    <div data-testid="tabs-list">{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
    ...rest
  }: React.PropsWithChildren<{ value: string }>) => (
    <button
      data-testid={`tab-trigger-${value}`}
      onClick={() => {
        if (tabChangeCallback) tabChangeCallback(value);
      }}
      {...rest}
    >
      {children}
    </button>
  ),
  TabsContent: ({
    children,
    value,
  }: React.PropsWithChildren<{ value: string }>) => {
    if (currentTabValue !== value) return null;
    return <div data-testid={`tab-content-${value}`}>{children}</div>;
  },
}));

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("@/lib/axios/axios", () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

describe("BillingTabs Component", () => {
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
    tabChangeCallback = null;
    currentTabValue = "balance";
    mockPost.mockReset();
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: [],
        pagination: { page: 1, total: 0, totalPages: 1 },
      },
    });
  });

  it("should render current billing tabs and default balance state", () => {
    render(<BillingTabs initialBalance={50} />);

    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getByText("Coupons")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Remaining Balance")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
  });

  it("should show success toast when paymentStatus is success", async () => {
    render(<BillingTabs paymentStatus="success" />);

    await waitFor(() => {
      expect(
        screen.getByText("Payment successful! Your balance will update shortly.")
      ).toBeInTheDocument();
    });
  });

  it("should validate topup amount > 0", async () => {
    render(<BillingTabs initialBalance={10} />);

    const input = screen.getByPlaceholderText("e.g. 25");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.submit(screen.getByText("Top up").closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Enter a valid amount > 0")).toBeInTheDocument();
    });
  });

  it("should validate topup max amount", async () => {
    render(<BillingTabs initialBalance={10} />);

    const input = screen.getByPlaceholderText("e.g. 25");
    fireEvent.change(input, { target: { value: "10001" } });
    fireEvent.submit(screen.getByText("Top up").closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText("Maximum top-up amount is $10,000")
      ).toBeInTheDocument();
    });
  });

  it("should call checkout-session endpoint for topup", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({ data: {} });

    render(<BillingTabs initialBalance={50} />);

    await user.type(screen.getByPlaceholderText("e.g. 25"), "25");
    await user.click(screen.getByText("Top up"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/billing/create-checkout-session", {
        amount: 25,
      });
    });
  });

  it("should allow decimal topup amounts like 10.99", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({ data: {} });

    render(<BillingTabs initialBalance={50} />);

    await user.type(screen.getByPlaceholderText("e.g. 25"), "10.99");
    await user.click(screen.getByText("Top up"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/billing/create-checkout-session", {
        amount: 10.99,
      });
    });
  });

  it("should redeem coupon from coupon card", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({
      data: { success: true, balance: 60, message: "Coupon applied!" },
    });

    render(<BillingTabs initialBalance={50} availableCoupons={sampleCoupons} />);

    await user.click(screen.getByTestId("tab-trigger-coupons"));
    await waitFor(() => {
      expect(screen.getByText("SAVE10")).toBeInTheDocument();
    });

    const applyButtons = screen.getAllByText("Apply");
    await user.click(applyButtons[1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/billing/coupons/redeem", {
        code: "SAVE10",
      });
    });
  });

  it("should uppercase manual coupon input", async () => {
    const user = userEvent.setup();
    render(<BillingTabs />);

    await user.click(screen.getByTestId("tab-trigger-coupons"));
    const input = await screen.findByPlaceholderText("Enter coupon code");
    await user.type(input, "save25");

    expect(input).toHaveValue("SAVE25");
  });

  it("should validate manual coupon input before submit", async () => {
    const user = userEvent.setup();
    render(<BillingTabs />);

    await user.click(screen.getByTestId("tab-trigger-coupons"));
    await user.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a coupon code")).toBeInTheDocument();
    });
  });

  it("should call coupon redeem endpoint for manual code", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({
      data: { success: true, balance: 100, message: "Applied!" },
    });

    render(<BillingTabs initialBalance={50} />);

    await user.click(screen.getByTestId("tab-trigger-coupons"));
    await user.type(await screen.findByPlaceholderText("Enter coupon code"), "FREE100");
    await user.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/billing/coupons/redeem", {
        code: "FREE100",
      });
    });
  });

  it("should fetch transactions when transactions tab is opened", async () => {
    const user = userEvent.setup();
    render(<BillingTabs />);

    await user.click(screen.getByTestId("tab-trigger-transactions"));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    expect(mockGet.mock.calls[0][0]).toContain("/billing/transactions?page=1&limit=10");
  });
});
