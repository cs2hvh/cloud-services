/**
 * DomainSettingsTab component — unit tests
 *
 * Covers: loading skeleton, error state (no "External domain" bleed-through),
 * external domain display, managed domain settings, auto-renew toggle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DomainSettingsTab } from '@/components/dashboard/domains/domain-settings-tab';
import type { RegistrarSettings } from '@/components/dashboard/domains/domain-detail-types';

// Mock NameserverSettings so these tests focus on DomainSettingsTab logic only
vi.mock('@/components/dashboard/domains/nameserver-settings', () => ({
  NameserverSettings: () => <div data-testid="nameserver-settings" />,
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
  expires_at: '2027-06-15T00:00:00Z',
  nameservers: ['ns1.name.com', 'ns2.name.com'],
  nameserver_mode: 'managed',
};

function makeProps(overrides: Partial<React.ComponentProps<typeof DomainSettingsTab>> = {}) {
  return {
    registrarLoading: false,
    registrarError: null,
    registrarSettings: MANAGED_SETTINGS,
    savingAutorenew: false,
    savingNameservers: false,
    onToggleAutorenew: vi.fn(),
    onSetNameservers: vi.fn().mockResolvedValue(true),
    onUseManagedNameservers: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DomainSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('renders a loading skeleton while registrarLoading=true', () => {
    const { container } = render(<DomainSettingsTab {...makeProps({ registrarLoading: true })} />);
    // Skeleton uses animate-pulse divs; verify settings content is hidden
    expect(screen.queryByText('Auto-renew')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows the error banner when registrarError is set', () => {
    render(
      <DomainSettingsTab
        {...makeProps({ registrarError: 'Unable to load domain settings. Refresh to try again.', registrarSettings: null })}
      />
    );
    expect(screen.getByText(/Unable to load domain settings/)).toBeInTheDocument();
  });

  it('does NOT show "External domain" text when there is an error (BUG-1 regression)', () => {
    render(
      <DomainSettingsTab
        {...makeProps({ registrarError: 'Some error', registrarSettings: null })}
      />
    );
    expect(screen.queryByText('External domain')).not.toBeInTheDocument();
  });

  it('sanitises internal error messages (shows generic text for stack-trace-like errors)', () => {
    render(
      <DomainSettingsTab
        {...makeProps({
          registrarError: 'supabase postgres connection refused at node_modules/pg',
          registrarSettings: null,
        })}
      />
    );
    expect(screen.getByText(/Unable to load domain settings/)).toBeInTheDocument();
    expect(screen.queryByText(/supabase/i)).not.toBeInTheDocument();
  });

  // ── External domain (unmanaged) ────────────────────────────────────────────

  it('shows "External domain" when managed=false and no error', () => {
    const externalSettings: RegistrarSettings = {
      ...MANAGED_SETTINGS,
      managed: false,
      zone: null,
      nameservers: [],
      nameserver_mode: 'custom',
    };
    render(<DomainSettingsTab {...makeProps({ registrarSettings: externalSettings })} />);
    expect(screen.getByText('External domain')).toBeInTheDocument();
  });

  it('shows "External domain" when registrarSettings is null and no error', () => {
    render(<DomainSettingsTab {...makeProps({ registrarSettings: null })} />);
    expect(screen.getByText('External domain')).toBeInTheDocument();
  });

  // ── Managed domain settings ────────────────────────────────────────────────

  it('displays the expiry date formatted as "Month Day, Year"', () => {
    render(<DomainSettingsTab {...makeProps()} />);
    expect(screen.getByText('June 15, 2027')).toBeInTheDocument();
  });

  it('shows the managed zone when present', () => {
    render(<DomainSettingsTab {...makeProps()} />);
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('renders NameserverSettings for managed domains', () => {
    render(<DomainSettingsTab {...makeProps()} />);
    expect(screen.getByTestId('nameserver-settings')).toBeInTheDocument();
  });

  it('does not render NameserverSettings for unmanaged domains', () => {
    const externalSettings: RegistrarSettings = { ...MANAGED_SETTINGS, managed: false };
    render(<DomainSettingsTab {...makeProps({ registrarSettings: externalSettings })} />);
    expect(screen.queryByTestId('nameserver-settings')).not.toBeInTheDocument();
  });

  // ── Auto-renew toggle ──────────────────────────────────────────────────────

  describe('auto-renew', () => {
    it('shows "Enabled" status and "Disable" button when autorenew_enabled=true', () => {
      render(<DomainSettingsTab {...makeProps()} />);
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    });

    it('shows "Disabled" status and "Enable" button when autorenew_enabled=false', () => {
      render(
        <DomainSettingsTab
          {...makeProps({ registrarSettings: { ...MANAGED_SETTINGS, autorenew_enabled: false } })}
        />
      );
      expect(screen.getByText('Disabled')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    });

    it('calls onToggleAutorenew when button is clicked', async () => {
      const onToggleAutorenew = vi.fn();
      const user = userEvent.setup();
      render(<DomainSettingsTab {...makeProps({ onToggleAutorenew })} />);
      await user.click(screen.getByRole('button', { name: 'Disable' }));
      expect(onToggleAutorenew).toHaveBeenCalledOnce();
    });

    it('shows spinner and disables button when savingAutorenew=true', () => {
      render(<DomainSettingsTab {...makeProps({ savingAutorenew: true })} />);
      const btn = screen.getByRole('button', { name: '' }); // spinner replaces label
      expect(btn).toBeDisabled();
    });

    it('disables toggle button when autorenew_enabled is null (unknown state)', () => {
      render(
        <DomainSettingsTab
          {...makeProps({ registrarSettings: { ...MANAGED_SETTINGS, autorenew_enabled: null } })}
        />
      );
      // With null, the status falls through to "Disabled" and the button shows "Enable",
      // but the button must be disabled because autorenew_enabled is not a boolean.
      const btn = screen.getByRole('button', { name: 'Enable' });
      expect(btn).toBeDisabled();
    });
  });

  // ── Quick links ────────────────────────────────────────────────────────────

  it('renders "Register Another Domain" link pointing to marketplace', () => {
    render(<DomainSettingsTab {...makeProps()} />);
    const link = screen.getByRole('link', { name: /Register Another Domain/i });
    expect(link).toHaveAttribute('href', '/dashboard/domains/marketplace');
  });

  it('renders "Back to Domains" link', () => {
    render(<DomainSettingsTab {...makeProps()} />);
    const link = screen.getByRole('link', { name: /Back to Domains/i });
    expect(link).toHaveAttribute('href', '/dashboard/domains');
  });
});
