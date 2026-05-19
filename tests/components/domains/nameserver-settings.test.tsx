/**
 * NameserverSettings component — end-to-end UI flow tests
 *
 * Covers: managed/custom panel rendering, badge state, mode-switch dialogs,
 * input validation, no-op detection, save confirmation, optimistic rollback,
 * ManagedPanel loading state.
 *
 * Radix UI's Select uses Pointer Events APIs unavailable in jsdom.
 * We mock @/components/ui/select with a native <select> so we can call
 * fireEvent.change to trigger mode switches without patching jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { NameserverSettings } from '@/components/dashboard/domains/nameserver-settings';
import type { RegistrarSettings } from '@/components/dashboard/domains/domain-detail-types';

// ─── Mock Radix UI Select with a native <select> ──────────────────────────────

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      role="combobox"
      value={value}
      disabled={disabled ?? false}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value }: any) => <option value={value}>{value}</option>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANAGED_SETTINGS: RegistrarSettings = {
  domain: 'example.com',
  managed: true,
  zone: 'example.com',
  host: null,
  autorenew_enabled: true,
  locked: false,
  privacy_enabled: false,
  expires_at: null,
  nameservers: ['ns1.name.com', 'ns2.name.com'],
  nameserver_mode: 'managed',
};

const CUSTOM_SETTINGS: RegistrarSettings = {
  ...MANAGED_SETTINGS,
  nameservers: ['rosemary.ns.cloudflare.com', 'braden.ns.cloudflare.com'],
  nameserver_mode: 'custom',
};

function makeProps(overrides: Partial<React.ComponentProps<typeof NameserverSettings>> = {}) {
  return {
    settings: MANAGED_SETTINGS,
    saving: false,
    onSetNameservers: vi.fn().mockResolvedValue(true),
    onUseManagedNameservers: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function switchMode(select: HTMLElement, value: 'managed' | 'custom') {
  fireEvent.change(select, { target: { value } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NameserverSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Panel rendering ────────────────────────────────────────────────────────

  describe('initial rendering', () => {
    it('shows ManagedPanel when nameserver_mode is managed', () => {
      render(<NameserverSettings {...makeProps()} />);
      expect(screen.getByText('Managed by Ahura')).toBeInTheDocument();
    });

    it('shows CustomPanel when nameserver_mode is custom', () => {
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);
      expect(screen.getByText('rosemary.ns.cloudflare.com')).toBeInTheDocument();
    });

    it('badge says "Ahura managed" for managed mode', () => {
      render(<NameserverSettings {...makeProps()} />);
      expect(screen.getByText(/Ahura managed/)).toBeInTheDocument();
    });

    it('badge says "Custom active" for custom mode', () => {
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);
      expect(screen.getByText(/Custom active/)).toBeInTheDocument();
    });

    it('shows active nameservers block with copy button in custom mode', () => {
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);
      expect(screen.getByText('Active nameservers')).toBeInTheDocument();
      expect(screen.getByTitle('Copy all')).toBeInTheDocument();
    });

    it('does not show active nameservers block in managed mode', () => {
      render(<NameserverSettings {...makeProps()} />);
      expect(screen.queryByText('Active nameservers')).not.toBeInTheDocument();
    });
  });

  // ── Mode dropdown (managed → custom dialog) ────────────────────────────────

  describe('switching managed → custom', () => {
    it('opens confirmation dialog when switching to "custom" from managed state', async () => {
      render(<NameserverSettings {...makeProps()} />);
      switchMode(screen.getByRole('combobox'), 'custom');
      expect(await screen.findByText('Switch to Custom Nameservers?')).toBeInTheDocument();
    });

    it('closes dialog and shows CustomPanel when confirmed', async () => {
      const user = userEvent.setup();
      render(<NameserverSettings {...makeProps()} />);
      switchMode(screen.getByRole('combobox'), 'custom');
      await user.click(await screen.findByRole('button', { name: 'Switch to Custom' }));

      await waitFor(() => {
        expect(screen.queryByText('Switch to Custom Nameservers?')).not.toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('ns1.provider.com')).toBeInTheDocument();
    });

    it('closes dialog and stays on ManagedPanel when cancelled', async () => {
      const user = userEvent.setup();
      render(<NameserverSettings {...makeProps()} />);
      switchMode(screen.getByRole('combobox'), 'custom');
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByText('Switch to Custom Nameservers?')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Managed by Ahura')).toBeInTheDocument();
    });

    it('badge shows "(unsaved)" after confirming the managed→custom switch', async () => {
      const user = userEvent.setup();
      render(<NameserverSettings {...makeProps()} />);
      switchMode(screen.getByRole('combobox'), 'custom');
      await user.click(await screen.findByRole('button', { name: 'Switch to Custom' }));

      expect(screen.getByText(/unsaved/)).toBeInTheDocument();
    });
  });

  // ── Mode dropdown (custom → managed dialog) ────────────────────────────────

  describe('switching custom → managed', () => {
    it('opens confirmation dialog when switching to "managed" from custom state', async () => {
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);
      switchMode(screen.getByRole('combobox'), 'managed');
      expect(await screen.findByText('Switch to Ahura Managed?')).toBeInTheDocument();
    });

    it('ManagedPanel shows spinner and "Switching to managed…" text when saving=true', () => {
      // The saving prop is set by the parent hook (savingNameservers=true).
      // Test the prop-driven rendering directly without simulating the async flow.
      render(<NameserverSettings {...makeProps({ saving: true })} />);
      expect(screen.getByText('Switching to managed…')).toBeInTheDocument();
    });

    it('shows final "Managed by Ahura" text once API resolves successfully', async () => {
      const user = userEvent.setup();
      const onUseManagedNameservers = vi.fn().mockResolvedValue(true);
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, onUseManagedNameservers })} />);
      switchMode(screen.getByRole('combobox'), 'managed');
      await user.click(await screen.findByRole('button', { name: 'Switch to Managed' }));

      await waitFor(() => {
        expect(screen.getByText('Managed by Ahura')).toBeInTheDocument();
      });
    });

    it('rolls back to CustomPanel when onUseManagedNameservers returns false', async () => {
      const user = userEvent.setup();
      const onUseManagedNameservers = vi.fn().mockResolvedValue(false);
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, onUseManagedNameservers })} />);
      switchMode(screen.getByRole('combobox'), 'managed');
      await user.click(await screen.findByRole('button', { name: 'Switch to Managed' }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('ns1.provider.com')).toBeInTheDocument();
      });
    });
  });

  // ── Input validation ───────────────────────────────────────────────────────

  describe('nameserver input validation', () => {
    async function openCustomPanel() {
      const user = userEvent.setup();
      const props = makeProps();
      render(<NameserverSettings {...props} />);
      switchMode(screen.getByRole('combobox'), 'custom');
      await user.click(await screen.findByRole('button', { name: 'Switch to Custom' }));
      return { user, props };
    }

    it('Save button is disabled with fewer than 2 filled entries', async () => {
      const { user } = await openCustomPanel();
      await user.type(screen.getAllByPlaceholderText(/ns\d+\.provider\.com/)[0], 'ns1.example.com');
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('shows hint to enter at least two nameservers initially', async () => {
      await openCustomPanel();
      expect(screen.getByText(/Enter at least two valid nameservers/)).toBeInTheDocument();
    });

    it('Save button is enabled when 2 valid unique nameservers are entered', async () => {
      const { user } = await openCustomPanel();
      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.example.com');
      await user.type(inputs[1], 'ns2.example.com');
      expect(screen.getByRole('button', { name: /save|update/i })).not.toBeDisabled();
    });

    it('shows duplicate warning and disables Save when both inputs are identical', async () => {
      const { user } = await openCustomPanel();
      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.example.com');
      await user.type(inputs[1], 'ns1.example.com');
      expect(screen.getByText(/Remove duplicate/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save|update/i })).toBeDisabled();
    });

    it('Add button appends a new input field', async () => {
      const { user } = await openCustomPanel();
      const before = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/).length;
      await user.click(screen.getByRole('button', { name: /Add/i }));
      expect(screen.getAllByPlaceholderText(/ns\d+\.provider\.com/).length).toBe(before + 1);
    });

    it('shows "N nameservers ready" info text when canSave is true', async () => {
      const { user } = await openCustomPanel();
      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.example.com');
      await user.type(inputs[1], 'ns2.example.com');
      expect(screen.getByText('2 nameservers ready')).toBeInTheDocument();
    });

    it('Add button becomes disabled when 13 nameservers are already present', async () => {
      const user = userEvent.setup();
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);
      // CUSTOM_SETTINGS starts with 2 inputs; add 11 more to reach the limit of 13
      for (let i = 2; i < 13; i++) {
        await user.click(screen.getByRole('button', { name: /Add/i }));
      }
      expect(screen.getAllByPlaceholderText(/ns\d+\.provider\.com/).length).toBe(13);
      // Button must be disabled at the limit so the user can't exceed it
      expect(screen.getByRole('button', { name: /Add/i })).toBeDisabled();
    });
  });

  // ── No-op detection ────────────────────────────────────────────────────────

  describe('no-op detection', () => {
    it('shows "No changes" info and disables Save when inputs match the current custom set', async () => {
      const user = userEvent.setup();
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'rosemary.ns.cloudflare.com');
      await user.type(inputs[1], 'braden.ns.cloudflare.com');

      expect(screen.getByText(/No changes/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save|update/i })).toBeDisabled();
    });
  });

  // ── Save flows ─────────────────────────────────────────────────────────────

  describe('saving custom nameservers', () => {
    it('calls onSetNameservers directly (no dialog) when adding nameservers for the first time', async () => {
      // Start from managed, switch to custom (no existing custom set), enter names, save
      const user = userEvent.setup();
      const onSetNameservers = vi.fn().mockResolvedValue(true);
      render(<NameserverSettings {...makeProps({ onSetNameservers })} />);

      switchMode(screen.getByRole('combobox'), 'custom');
      await user.click(await screen.findByRole('button', { name: 'Switch to Custom' }));

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.new.com');
      await user.type(inputs[1], 'ns2.new.com');
      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(onSetNameservers).toHaveBeenCalledWith(['ns1.new.com', 'ns2.new.com']);
      });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('shows replace-confirmation dialog when overwriting an existing custom set', async () => {
      const user = userEvent.setup();
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.new.com');
      await user.type(inputs[1], 'ns2.new.com');
      await user.click(screen.getByRole('button', { name: /update/i }));

      expect(await screen.findByText('Replace Nameservers?')).toBeInTheDocument();
    });

    it('calls onSetNameservers after replace-confirmation is accepted', async () => {
      const user = userEvent.setup();
      const onSetNameservers = vi.fn().mockResolvedValue(true);
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, onSetNameservers })} />);

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.replace.com');
      await user.type(inputs[1], 'ns2.replace.com');
      await user.click(screen.getByRole('button', { name: /update/i }));
      await user.click(await screen.findByRole('button', { name: 'Replace Nameservers' }));

      await waitFor(() => {
        expect(onSetNameservers).toHaveBeenCalledWith(['ns1.replace.com', 'ns2.replace.com']);
      });
    });

    it('does not call onSetNameservers when replace-confirmation is cancelled', async () => {
      const user = userEvent.setup();
      const onSetNameservers = vi.fn();
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, onSetNameservers })} />);

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.new.com');
      await user.type(inputs[1], 'ns2.new.com');
      await user.click(screen.getByRole('button', { name: /update/i }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByText('Replace Nameservers?')).not.toBeInTheDocument();
      });
      expect(onSetNameservers).not.toHaveBeenCalled();
    });

    it('CustomPanel shows "Saving…" and disables inputs when saving=true', () => {
      // saving=true is set by the parent hook (savingNameservers=true).
      // Test prop-driven rendering directly.
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, saving: true })} />);
      expect(screen.getByText('Saving…')).toBeInTheDocument();
      screen.getAllByPlaceholderText(/ns\d+\.provider\.com/).forEach((input) => {
        expect(input).toBeDisabled();
      });
    });

    it('clears inputs after onSetNameservers returns true', async () => {
      const user = userEvent.setup();
      const onSetNameservers = vi.fn().mockResolvedValue(true);
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, onSetNameservers })} />);

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.replace.com');
      await user.type(inputs[1], 'ns2.replace.com');
      await user.click(screen.getByRole('button', { name: /update/i }));
      await user.click(await screen.findByRole('button', { name: 'Replace Nameservers' }));

      await waitFor(() => {
        // All inputs should reset to empty after success
        screen.getAllByPlaceholderText(/ns\d+\.provider\.com/).forEach((input) => {
          expect((input as HTMLInputElement).value).toBe('');
        });
      });
    });

    it('does NOT clear inputs after onSetNameservers returns false', async () => {
      const user = userEvent.setup();
      const onSetNameservers = vi.fn().mockResolvedValue(false);
      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS, onSetNameservers })} />);

      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.fail.com');
      await user.type(inputs[1], 'ns2.fail.com');
      await user.click(screen.getByRole('button', { name: /update/i }));
      await user.click(await screen.findByRole('button', { name: 'Replace Nameservers' }));

      await waitFor(() => {
        // Inputs should remain so user can correct and retry
        const updatedInputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
        expect((updatedInputs[0] as HTMLInputElement).value).toBe('ns1.fail.com');
      });
    });
  });

  // ── Copy to clipboard ──────────────────────────────────────────────────────

  describe('copy to clipboard', () => {
    it('calls navigator.clipboard.writeText with all nameservers joined by newline', () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      // navigator.clipboard is a getter-only in jsdom — spy on the getter.
      // Use fireEvent (not userEvent) so userEvent's internal clipboard interception doesn't shadow our spy.
      vi.spyOn(global.navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard);

      render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);
      fireEvent.click(screen.getByTitle('Copy all'));

      expect(writeText).toHaveBeenCalledWith('rosemary.ns.cloudflare.com\nbraden.ns.cloudflare.com');
      expect(toast.success).toHaveBeenCalledWith('Copied to clipboard.');
    });
  });

  // ── Settings prop re-sync ──────────────────────────────────────────────────

  describe('settings prop re-sync (useEffect)', () => {
    it('resets local mode to managed and clears inputs when settings change from custom to managed', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);

      // Type into inputs
      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      await user.type(inputs[0], 'ns1.typed.com');

      // Parent receives updated settings (server now says managed after a successful switch)
      rerender(<NameserverSettings {...makeProps({ settings: MANAGED_SETTINGS })} />);

      await waitFor(() => {
        expect(screen.getByText('Managed by Ahura')).toBeInTheDocument();
      });
      // Inputs should be gone (ManagedPanel shown, CustomPanel unmounted)
      expect(screen.queryByPlaceholderText('ns1.provider.com')).not.toBeInTheDocument();
    });

    it('resets local mode to custom and clears inputs when settings change from managed to custom', async () => {
      const { rerender } = render(<NameserverSettings {...makeProps({ settings: MANAGED_SETTINGS })} />);

      // Parent receives updated settings (server now says custom after a successful nameserver save)
      rerender(<NameserverSettings {...makeProps({ settings: CUSTOM_SETTINGS })} />);

      await waitFor(() => {
        expect(screen.getByText(/Custom active/)).toBeInTheDocument();
      });
      // Inputs should be empty (reset by useEffect)
      const inputs = screen.getAllByPlaceholderText(/ns\d+\.provider\.com/);
      inputs.forEach((input) => expect((input as HTMLInputElement).value).toBe(''));
    });
  });

  // ── Select disabled during save ────────────────────────────────────────────

  it('mode select is disabled when saving=true', () => {
    render(<NameserverSettings {...makeProps({ saving: true })} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
