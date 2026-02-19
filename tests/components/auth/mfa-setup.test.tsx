import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnableTotp from '@/components/dashboard/2fa/page';

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      className,
      ...rest
    }: React.PropsWithChildren<{ className?: string }>) => (
      <div className={className} {...rest}>
        {children}
      </div>
    ),
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    ...rest
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }>) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({
    children,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...rest}>{children}</label>
  ),
}));

// Mock Dialog
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open,
  }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({
    children,
  }: React.PropsWithChildren) => <div data-testid="dialog-content">{children}</div>,
  DialogDescription: ({
    children,
  }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({
    children,
  }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({
    children,
  }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({
    children,
  }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

// Mock AlertDialog
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick,
    ...rest
  }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
  AlertDialogCancel: ({
    children,
  }: React.PropsWithChildren) => <button>{children}</button>,
  AlertDialogContent: ({
    children,
  }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogDescription: ({
    children,
  }: React.PropsWithChildren) => <p>{children}</p>,
  AlertDialogFooter: ({
    children,
  }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogHeader: ({
    children,
  }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogTitle: ({
    children,
  }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

// Mock MFA API
const mockGetMFAStatus = vi.fn();
const mockEnrollMFA = vi.fn();
const mockVerifyMFA = vi.fn();
const mockUnenrollMFA = vi.fn();
const mockUpdate2FAStatus = vi.fn();

vi.mock('@/lib/api/mfa', () => ({
  getMFAStatus: (...args: unknown[]) => mockGetMFAStatus(...args),
  enrollMFA: (...args: unknown[]) => mockEnrollMFA(...args),
  verifyMFA: (...args: unknown[]) => mockVerifyMFA(...args),
  unenrollMFA: (...args: unknown[]) => mockUnenrollMFA(...args),
  update2FAStatus: (...args: unknown[]) => mockUpdate2FAStatus(...args),
}));

describe('EnableTotp Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TC-MFA-C040: Loading State', () => {
    it('should show loading message initially', () => {
      // Don't resolve getMFAStatus so loading remains
      mockGetMFAStatus.mockReturnValue(new Promise(() => {}));

      render(<EnableTotp />);

      expect(screen.getByText('Loading 2FA settings...')).toBeInTheDocument();
    });
  });

  describe('TC-MFA-C041: 2FA Not Enabled', () => {
    it('should show enable button when 2FA is not active', async () => {
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });
    });

    it('should show description text when 2FA is disabled', async () => {
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText(/Two-factor authentication adds an extra layer/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('TC-MFA-C042: Enrollment Flow', () => {
    it('should show QR code after clicking enable', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'ABCDEF123456',
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByAltText('TOTP QR Code')).toBeInTheDocument();
      });
    });

    it('should display secret key for manual entry', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'MYSECRETKEY123',
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByText('MYSECRETKEY123')).toBeInTheDocument();
        expect(
          screen.getByText('Secret Key (for manual entry):')
        ).toBeInTheDocument();
      });
    });

    it('should show code input field during enrollment', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'SECRET',
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByText('Enter the 6-digit code')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
      });
    });

    it('should show error toast when enrollment fails', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockRejectedValueOnce(
        new Error('Enrollment service unavailable')
      );

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Enrollment service unavailable'
        );
      });
    });
  });

  describe('TC-MFA-C043: Verification', () => {
    it('should verify code and show success dialog', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'SECRET',
      });
      mockVerifyMFA.mockResolvedValueOnce({
        success: true,
        message: 'Verified',
      });
      mockUpdate2FAStatus.mockResolvedValueOnce(undefined);

      render(<EnableTotp />);

      // Wait for initial load
      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      // Start enrollment
      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
      });

      // Type 6-digit code
      const codeInput = screen.getByPlaceholderText('123456');
      await user.type(codeInput, '123456');

      // Click Enable 2FA
      await user.click(screen.getByText('Enable 2FA'));

      // Verify API calls
      await waitFor(() => {
        expect(mockVerifyMFA).toHaveBeenCalledWith('factor-123', '123456');
        expect(mockUpdate2FAStatus).toHaveBeenCalledWith(true);
      });

      // Success dialog should appear
      await waitFor(() => {
        expect(
          screen.getByText('2FA Enabled Successfully')
        ).toBeInTheDocument();
      });
    });

    it('should disable Enable 2FA button when code is less than 6 digits', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'SECRET',
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
      });

      // Type only 3 digits
      await user.type(screen.getByPlaceholderText('123456'), '123');

      // Enable 2FA button should be disabled
      expect(screen.getByText('Enable 2FA')).toBeDisabled();
    });

    it('should show error toast when verification fails', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'SECRET',
      });
      mockVerifyMFA.mockRejectedValueOnce(new Error('Invalid code'));

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('123456'), '999999');
      await user.click(screen.getByText('Enable 2FA'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid code');
      });
    });
  });

  describe('TC-MFA-C044: 2FA Already Enabled', () => {
    it('should show enabled status when 2FA is active', async () => {
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: true,
        factorId: 'existing-factor',
        factors: [],
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });
    });

    it('should show info text about code requirement', async () => {
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: true,
        factorId: 'existing-factor',
        factors: [],
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText(
            /You'll be asked for a code each time you sign in/
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe('TC-MFA-C045: Disable 2FA Flow', () => {
    it('should show confirmation dialog when clicking Disable 2FA', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: true,
        factorId: 'existing-factor',
        factors: [],
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Disable 2FA'));

      await waitFor(() => {
        expect(
          screen.getByText('Are you sure you want to disable 2FA?')
        ).toBeInTheDocument();
      });
    });

    it('should disable 2FA after confirming', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: true,
        factorId: 'existing-factor',
        factors: [],
      });
      mockUnenrollMFA.mockResolvedValueOnce({ success: true });
      mockUpdate2FAStatus.mockResolvedValueOnce(undefined);

      render(<EnableTotp />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });

      // Click Disable 2FA button
      await user.click(screen.getByText('Disable 2FA'));

      await waitFor(() => {
        expect(
          screen.getByText('Are you sure you want to disable 2FA?')
        ).toBeInTheDocument();
      });

      // Find and click the confirm "Disable 2FA" in the alert dialog
      // The alert dialog has a button with the same text "Disable 2FA"
      const disableButtons = screen.getAllByText('Disable 2FA');
      // The second one is in the alert dialog
      await user.click(disableButtons[disableButtons.length - 1]);

      await waitFor(() => {
        expect(mockUnenrollMFA).toHaveBeenCalled();
        expect(mockUpdate2FAStatus).toHaveBeenCalledWith(false);
      });

      // Success dialog
      await waitFor(() => {
        expect(
          screen.getByText('2FA Disabled Successfully')
        ).toBeInTheDocument();
      });
    });

    it('should show error toast when disable fails', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: true,
        factorId: 'existing-factor',
        factors: [],
      });
      mockUnenrollMFA.mockRejectedValueOnce(new Error('Cannot disable'));

      render(<EnableTotp />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Disable 2FA'));

      await waitFor(() => {
        expect(
          screen.getByText('Are you sure you want to disable 2FA?')
        ).toBeInTheDocument();
      });

      const disableButtons = screen.getAllByText('Disable 2FA');
      await user.click(disableButtons[disableButtons.length - 1]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Cannot disable');
      });
    });
  });

  describe('TC-MFA-C046: Error Handling', () => {
    it('should show error toast when status check fails', async () => {
      const { toast } = await import('sonner');
      mockGetMFAStatus.mockRejectedValueOnce(
        new Error('Network error')
      );

      render(<EnableTotp />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error');
      });
    });

    it('should only allow numeric input for code', async () => {
      const user = userEvent.setup();
      mockGetMFAStatus.mockResolvedValueOnce({
        hasVerifiedFactor: false,
        factorId: null,
        factors: [],
      });
      mockEnrollMFA.mockResolvedValueOnce({
        factorId: 'factor-123',
        qrCode: 'data:image/svg+xml;base64,test',
        secret: 'SECRET',
      });

      render(<EnableTotp />);

      await waitFor(() => {
        expect(
          screen.getByText('Enable Two-Factor Authentication')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText('Enable Two-Factor Authentication'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('123456');
      await user.type(codeInput, 'abc123def456');

      // Only digits should be kept, max 6 chars
      expect(codeInput).toHaveValue('123456');
    });
  });
});
