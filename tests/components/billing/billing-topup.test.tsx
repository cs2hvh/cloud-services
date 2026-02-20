import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingTabs from '@/app/dashboard/nav/billing/BillingTabs';

// Mock motion/react
vi.mock('motion/react', () => ({
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

// Mock lucide-react
vi.mock('lucide-react', () => ({
  CreditCard: () => <span data-testid="icon-credit-card" />,
  Wallet: () => <span data-testid="icon-wallet" />,
  X: () => <span data-testid="icon-x" />,
  Ticket: () => <span data-testid="icon-ticket" />,
}));

// Store onValueChange callback for tab switching
let tabChangeCallback: ((v: string) => void) | null = null;
let currentTabValue = 'balance';

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
    className?: string;
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

// Mock axios
const mockPost = vi.fn();
vi.mock('@/lib/axios/axios', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// Mock fetch for payment method
const mockFetch = vi.fn();

describe('BillingTabs Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabChangeCallback = null;
    currentTabValue = 'balance';
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  const sampleCoupons = [
    {
      id: 'c1',
      code: 'SAVE10',
      amount: 10,
      valid_till: '2025-12-31T00:00:00Z',
      coupon_type: 'promo',
    },
    {
      id: 'c2',
      code: 'BONUS20',
      amount: 20,
      valid_till: '2025-06-30T00:00:00Z',
      coupon_type: 'referral',
    },
  ];

  describe('TC-BT-C030: Balance Tab', () => {
    it('should render balance tab by default', () => {
      render(<BillingTabs initialBalance={50} />);
      expect(screen.getByText('Balance')).toBeInTheDocument();
      expect(screen.getByText('Remaining Balance')).toBeInTheDocument();
      expect(screen.getByText('$50')).toBeInTheDocument();
    });

    it('should show default balance of 0 when no props provided', () => {
      render(<BillingTabs />);
      expect(screen.getByText('$0')).toBeInTheDocument();
    });

    it('should render top-up form', () => {
      render(<BillingTabs />);
      expect(
        screen.getByText('Enter amount to top up($)')
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. 25')).toBeInTheDocument();
      expect(screen.getByText('Top up')).toBeInTheDocument();
    });
  });

  describe('TC-BT-C031: Top-up Form', () => {
    it('should show error toast for invalid amount (0)', async () => {
      render(<BillingTabs initialBalance={10} />);

      const input = screen.getByPlaceholderText('e.g. 25');
      fireEvent.change(input, { target: { value: '0' } });

      // Use fireEvent.submit to bypass HTML5 constraint validation (min="1")
      const form = screen.getByText('Top up').closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Enter a valid amount > 0')).toBeInTheDocument();
      });
    });

    it('should show error toast for empty amount', async () => {
      const user = userEvent.setup();
      render(<BillingTabs initialBalance={10} />);

      const topupButton = screen.getByText('Top up');
      await user.click(topupButton);

      await waitFor(() => {
        expect(screen.getByText('Enter a valid amount > 0')).toBeInTheDocument();
      });
    });

    it('should call API and update balance on successful top-up', async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValueOnce({
        status: 200,
        data: { balance: 75 },
      });

      render(<BillingTabs initialBalance={50} />);

      const input = screen.getByPlaceholderText('e.g. 25');
      await user.type(input, '25');

      const topupButton = screen.getByText('Top up');
      await user.click(topupButton);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/billing/topup', { amount: 25 });
      });

      await waitFor(() => {
        expect(screen.getByText('Top-up successful')).toBeInTheDocument();
        expect(screen.getByText('$75')).toBeInTheDocument();
      });
    });

    it('should show Processing... while loading', async () => {
      const user = userEvent.setup();
      let resolvePost: (v: unknown) => void;
      mockPost.mockReturnValueOnce(
        new Promise((r) => {
          resolvePost = r;
        })
      );

      render(<BillingTabs initialBalance={50} />);

      const input = screen.getByPlaceholderText('e.g. 25');
      await user.type(input, '10');
      await user.click(screen.getByText('Top up'));

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });

      // Resolve the promise
      resolvePost!({ status: 200, data: { balance: 60 } });

      await waitFor(() => {
        expect(screen.getByText('Top up')).toBeInTheDocument();
      });
    });

    it('should show error toast on API failure', async () => {
      const user = userEvent.setup();
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      render(<BillingTabs initialBalance={50} />);

      const input = screen.getByPlaceholderText('e.g. 25');
      await user.type(input, '10');
      await user.click(screen.getByText('Top up'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should throw when non-200 status returned', async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValueOnce({
        status: 500,
        data: {},
      });

      render(<BillingTabs initialBalance={50} />);

      const input = screen.getByPlaceholderText('e.g. 25');
      await user.type(input, '10');
      await user.click(screen.getByText('Top up'));

      await waitFor(() => {
        expect(screen.getByText('Top-up failed')).toBeInTheDocument();
      });
    });
  });

  describe('TC-BT-C032: Coupons Tab', () => {
    it('should show empty state when no coupons', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByText('No coupons available at the moment')).toBeInTheDocument();
      });
    });

    it('should display available coupons', async () => {
      const user = userEvent.setup();
      render(<BillingTabs availableCoupons={sampleCoupons} />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByText('SAVE10')).toBeInTheDocument();
        expect(screen.getByText('BONUS20')).toBeInTheDocument();
        expect(screen.getByText('$10')).toBeInTheDocument();
        expect(screen.getByText('$20')).toBeInTheDocument();
      });
    });

    it('should show coupon types', async () => {
      const user = userEvent.setup();
      render(<BillingTabs availableCoupons={sampleCoupons} />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByText('promo')).toBeInTheDocument();
        expect(screen.getByText('referral')).toBeInTheDocument();
      });
    });

    it('should redeem coupon on Apply click', async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValueOnce({
        data: { success: true, balance: 60, message: 'Coupon applied!' },
      });

      render(<BillingTabs initialBalance={50} availableCoupons={sampleCoupons} />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByText('SAVE10')).toBeInTheDocument();
      });

      // applyButtons[0] is the manual coupon form Apply, [1]+ are coupon card Apply buttons
      const applyButtons = screen.getAllByText('Apply');
      await user.click(applyButtons[1]);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/billing/coupons/redeem', {
          code: 'SAVE10',
        });
      });
    });

    it('should show manual coupon code input', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByText('Have a Coupon Code?')).toBeInTheDocument();
        expect(
          screen.getByPlaceholderText('Enter coupon code')
        ).toBeInTheDocument();
      });
    });
  });

  describe('TC-BT-C033: Manual Coupon Redemption', () => {
    it('should show error when submitting empty coupon code', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter coupon code')).toBeInTheDocument();
      });

      // Click Apply without entering code
      const applyButton = screen.getByText('Apply');
      await user.click(applyButton);

      await waitFor(() => {
        expect(
          screen.getByText('Please enter a coupon code')
        ).toBeInTheDocument();
      });
    });

    it('should uppercase the coupon code input', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter coupon code')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Enter coupon code');
      await user.type(input, 'testcode');

      expect(input).toHaveValue('TESTCODE');
    });

    it('should call API with manual coupon code', async () => {
      const user = userEvent.setup();
      mockPost.mockResolvedValueOnce({
        data: { success: true, balance: 100, message: 'Applied!' },
      });

      render(<BillingTabs initialBalance={50} />);

      await user.click(screen.getByTestId('tab-trigger-coupons'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter coupon code')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Enter coupon code');
      await user.type(input, 'FREEBIE');

      const applyButton = screen.getByText('Apply');
      await user.click(applyButton);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/billing/coupons/redeem', {
          code: 'FREEBIE',
        });
      });
    });
  });

  describe('TC-BT-C034: Payment Method Tab', () => {
    it('should show existing payment method', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-payment'));

      await waitFor(() => {
        expect(screen.getByText('Visa •••• 4242')).toBeInTheDocument();
        expect(screen.getByText('Expires 12/29')).toBeInTheDocument();
      });
    });

    it('should open payment method dialog', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-payment'));

      await waitFor(() => {
        expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
      });

      // The "Add Payment Method" text appears both as button and dialog header
      // Click the button (first one)
      const addButtons = screen.getAllByText('Add Payment Method');
      await user.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('1234123412341234')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('MM/YY')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('123')).toBeInTheDocument();
      });
    });

    it('should validate card number format', async () => {
      const user = userEvent.setup();
      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-payment'));

      await waitFor(() => {
        expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText('Add Payment Method');
      await user.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('1234123412341234')).toBeInTheDocument();
      });

      const cardInput = screen.getByPlaceholderText('1234123412341234');
      await user.type(cardInput, 'abc');

      const expiryInput = screen.getByPlaceholderText('MM/YY');
      await user.type(expiryInput, '12/29');

      const cvvInput = screen.getByPlaceholderText('123');
      await user.type(cvvInput, '123');

      await user.click(screen.getByText('Save Payment Method'));

      // Zod checks min(12) before regex, so 3-char "abc" triggers min error first
      await waitFor(() => {
        expect(screen.getByText('Card number is too short')).toBeInTheDocument();
      });
    });

    it('should save payment method successfully', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: true });

      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-payment'));

      await waitFor(() => {
        expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText('Add Payment Method');
      await user.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('1234123412341234')).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText('1234123412341234'),
        '4111111111111111'
      );
      await user.type(screen.getByPlaceholderText('MM/YY'), '12/29');
      await user.type(screen.getByPlaceholderText('123'), '123');

      await user.click(screen.getByText('Save Payment Method'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/billing/payment-method',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Payment method saved')).toBeInTheDocument();
      });
    });

    it('should show error on failed payment method save', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({ ok: false });

      render(<BillingTabs />);

      await user.click(screen.getByTestId('tab-trigger-payment'));

      await waitFor(() => {
        expect(screen.getByText('Add Payment Method')).toBeInTheDocument();
      });

      const addButtons = screen.getAllByText('Add Payment Method');
      await user.click(addButtons[0]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('1234123412341234')).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText('1234123412341234'),
        '4111111111111111'
      );
      await user.type(screen.getByPlaceholderText('MM/YY'), '12/29');
      await user.type(screen.getByPlaceholderText('123'), '123');

      await user.click(screen.getByText('Save Payment Method'));

      await waitFor(() => {
        expect(
          screen.getByText('Failed to save payment method')
        ).toBeInTheDocument();
      });
    });
  });

  describe('TC-BT-C035: Tab Navigation', () => {
    it('should render all three tab triggers', () => {
      render(<BillingTabs />);

      expect(screen.getByText('Balance')).toBeInTheDocument();
      expect(screen.getByText('Payment Method')).toBeInTheDocument();
      expect(screen.getByText('Coupons')).toBeInTheDocument();
    });
  });
});
