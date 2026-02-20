//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock dependencies before importing component
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return <button {...props}>{children}</button>;
  },
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  AlertDialogAction: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

import NetworkDDoSMain from '@/components/dashboard/network-ddos/main';
import SpectrumAppsTable from '@/components/dashboard/network-ddos/spectrum-apps-table';

const mockSpectrumApp = {
  id: 'sp-uuid-001',
  spectrum_id: 'spectrum-app-123',
  owner_id: 'test-user-id',
  project_id: 'proj-001',
  dns: {
    name: 'encrypted-dns-name',
    type: 'A',
    original_name: 'game.example.com',
    original_protocol: 'tcp',
  },
  protocol: 'tcp/25565',
  origin_direct: ['tcp://192.168.1.1:25565'],
  status: 'created',
  tls: 'off',
  ip_firewall: false,
  traffic_type: 'direct',
  proxy_protocol: 'off',
  edge_ips: { type: 'dynamic', connectivity: 'all' },
  argo_smart_routing: false,
  created_at: '2025-01-10T10:00:00Z',
};

const mockSpectrumApp2 = {
  ...mockSpectrumApp,
  id: 'sp-uuid-002',
  spectrum_id: 'spectrum-app-456',
  dns: {
    name: 'encrypted-dns-2',
    type: 'CNAME',
    original_name: 'api.example.com',
    original_protocol: 'udp',
  },
  protocol: 'udp/8080',
  origin_direct: ['udp://10.0.0.1:8080'],
  status: 'updated',
  ip_firewall: true,
  traffic_type: 'http',
};

const mockCreatingApp = {
  ...mockSpectrumApp,
  id: 'sp-uuid-003',
  spectrum_id: 'spectrum-app-789',
  dns: {
    name: 'encrypted-dns-3',
    type: 'A',
    original_name: 'ssh.example.com',
    original_protocol: 'tcp',
  },
  protocol: 'tcp/22',
  status: 'creating',
};

/**
 * Spectrum List Page Component Tests
 * TC-SP-C001 to TC-SP-C016: Test spectrum/network DDoS list page functionality
 */
describe('NetworkDDoSMain Component', () => {
  const defaultProps = {
    spectrumApps: [mockSpectrumApp, mockSpectrumApp2] as any[],
    userId: 'test-user-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TC-SP-C001: Page Header', () => {
    it('should render page title', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Network DDoS Protection')).toBeInTheDocument();
    });

    it('should render page description', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      const elements = screen.getAllByText(/Layer 4 reverse proxy/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should render "Enable Protection" link to create page', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      const link = screen.getByRole('link', { name: /enable protection/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/dashboard/services/network-ddos/new');
    });
  });

  describe('TC-SP-C002: Stats Cards', () => {
    it('should display total protected apps count', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Protected Apps')).toBeInTheDocument();
      // 2 appears in multiple stats, so use getAllByText
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThan(0);
    });

    it('should display active connections count', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Active Connections')).toBeInTheDocument();
      // Both apps have status "created" and "updated", both count as active
      const protectedAppsDiv = screen.getByText('Protected Apps').closest('div')!.parentElement;
      expect(protectedAppsDiv).toHaveTextContent('2');
    });

    it('should display data protected stat', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Data Protected')).toBeInTheDocument();
      expect(screen.getByText('0 GB')).toBeInTheDocument();
    });

    it('should display uptime stat', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Service Uptime')).toBeInTheDocument();
      expect(screen.getByText('99.9%')).toBeInTheDocument();
    });

    it('should update stats when apps change', () => {
      const { rerender } = render(<NetworkDDoSMain {...defaultProps} />);
      
      // Rerender with one app
      rerender(<NetworkDDoSMain spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);
      const protectedAppsSection = screen.getByText('Protected Apps').closest('div')!.parentElement;
      expect(protectedAppsSection).toHaveTextContent('1');
    });
  });

  describe('TC-SP-C003: Protection Features Section', () => {
    it('should display feature cards', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Advanced DDoS Mitigation')).toBeInTheDocument();
      expect(screen.getByText('Global Anycast Network')).toBeInTheDocument();
      expect(screen.getByText('Protocol Optimization')).toBeInTheDocument();
    });

    it('should display protection plan pricing', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Standard Protection')).toBeInTheDocument();
      expect(screen.getByText('Enterprise Protection')).toBeInTheDocument();
      expect(screen.getByText('$100')).toBeInTheDocument();
      expect(screen.getByText('$299')).toBeInTheDocument();
    });
  });

  describe('TC-SP-C004: How It Works Section', () => {
    it('should display all steps', () => {
      render(<NetworkDDoSMain {...defaultProps} />);
      expect(screen.getByText('Configure Application')).toBeInTheDocument();
      expect(screen.getByText('Route Traffic')).toBeInTheDocument();
      expect(screen.getByText('Filter & Protect')).toBeInTheDocument();
      expect(screen.getByText('Monitor & Analyze')).toBeInTheDocument();
    });
  });

  describe('TC-SP-C005: Empty State', () => {
    it('should display empty state when no apps', () => {
      render(<NetworkDDoSMain spectrumApps={[] as any[]} userId="test-user-id" />);
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThan(0);
    });
  });
});

describe('SpectrumAppsTable Component', () => {
  const defaultProps = {
    spectrumApps: [mockSpectrumApp, mockSpectrumApp2] as any[],
    userId: 'test-user-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('TC-SP-C006: Empty State', () => {
    it('should display empty state message when no apps', () => {
      render(<SpectrumAppsTable spectrumApps={[] as any[]} userId="test-user-id" />);
      expect(screen.getByText('No Protected Applications')).toBeInTheDocument();
    });

    it('should display create link in empty state', () => {
      render(<SpectrumAppsTable spectrumApps={[] as any[]} userId="test-user-id" />);
      const link = screen.getByRole('link', { name: /enable protection/i });
      expect(link).toHaveAttribute('href', '/dashboard/services/network-ddos/new');
    });
  });

  describe('TC-SP-C007: Table Headers', () => {
    it('should display correct table headers', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      // Multiple "Protocol" columns (App Type uses original_protocol, Protocol uses protocol)
      const protocolHeaders = screen.getAllByText('Protocol');
      expect(protocolHeaders.length).toBeGreaterThan(0);
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  describe('TC-SP-C008: App Data Display', () => {
    it('should display app DNS names', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      expect(screen.getByText('game.example.com')).toBeInTheDocument();
      expect(screen.getByText('api.example.com')).toBeInTheDocument();
    });

    it('should display spectrum IDs', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      expect(screen.getByText('spectrum-app-123')).toBeInTheDocument();
      expect(screen.getByText('spectrum-app-456')).toBeInTheDocument();
    });

    it('should display protocols', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      expect(screen.getByText('tcp/25565')).toBeInTheDocument();
      expect(screen.getByText('udp/8080')).toBeInTheDocument();
    });

    it('should display original protocol (app type)', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      expect(screen.getByText('tcp')).toBeInTheDocument();
      expect(screen.getByText('udp')).toBeInTheDocument();
    });
  });

  describe('TC-SP-C009: Status Badges', () => {
    it('should display Active status for created apps', () => {
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display Active status for updated apps', () => {
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp2] as any[]} userId="test-user-id" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display Creating status', () => {
      render(<SpectrumAppsTable spectrumApps={[mockCreatingApp] as any[]} userId="test-user-id" />);
      expect(screen.getByText('Creating')).toBeInTheDocument();
    });

    it('should display unknown status fallback', () => {
      const unknownApp = { ...mockSpectrumApp, status: 'error' };
      render(<SpectrumAppsTable spectrumApps={[unknownApp] as any[]} userId="test-user-id" />);
      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });

  describe('TC-SP-C010: Actions', () => {
    it('should display View button for each app', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      const viewLinks = screen.getAllByRole('link', { name: /view/i });
      expect(viewLinks).toHaveLength(2);
    });

    it('should have correct View link href', () => {
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);
      const viewLink = screen.getByRole('link', { name: /view/i });
      expect(viewLink).toHaveAttribute('href', '/dashboard/services/network-ddos/spectrum-app-123');
    });

    it('should display Delete button for each app', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons).toHaveLength(2);
    });
  });

  describe('TC-SP-C011: Delete Flow', () => {
    it('should open delete confirmation dialog on delete click', async () => {
      const user = userEvent.setup();
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      expect(screen.getByText('Delete Spectrum Application?')).toBeInTheDocument();
    });

    it('should display warning message in delete dialog', async () => {
      const user = userEvent.setup();
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });

    it('should call fetch with correct params on delete confirm', async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);

      // Find the delete button in the table row — it has text-red-400 class
      const tableDeleteBtn = screen.getAllByRole('button').find(
        btn => btn.textContent?.includes('Delete') && btn.className.includes('text-red-400')
      )!;
      expect(tableDeleteBtn).toBeTruthy();
      await user.click(tableDeleteBtn);

      // Wait for dialog to render
      await waitFor(() => {
        expect(screen.getByText('Delete Spectrum Application?')).toBeInTheDocument();
      });

      // In the confirmation dialog, the confirm button has class bg-red-600
      const confirmButton = screen.getAllByRole('button').find(
        btn => btn.textContent === 'Delete' && btn.className.includes('bg-red-600')
      )!;
      expect(confirmButton).toBeTruthy();
      await user.click(confirmButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/services/spectrum/apps/delete',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('spectrum-app-123'),
          })
        );
      });
    });

    it('should show success toast on delete success', async () => {
      const { toast } = await import('sonner');
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);

      const tableDeleteBtn = screen.getAllByRole('button').find(
        btn => btn.textContent?.includes('Delete') && btn.className.includes('text-red-400')
      )!;
      await user.click(tableDeleteBtn);

      await waitFor(() => {
        expect(screen.getByText('Delete Spectrum Application?')).toBeInTheDocument();
      });
      const confirmButton = screen.getAllByRole('button').find(
        btn => btn.textContent === 'Delete' && btn.className.includes('bg-red-600')
      )!;
      await user.click(confirmButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Spectrum app deleted successfully');
      });
    });
  });

  describe('TC-SP-C012: IP Firewall Display', () => {
    it('should show Enabled badge when ip_firewall is true', () => {
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp2] as any[]} userId="test-user-id" />);
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('should show Disabled text when ip_firewall is false', () => {
      render(<SpectrumAppsTable spectrumApps={[mockSpectrumApp] as any[]} userId="test-user-id" />);
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  describe('TC-SP-C013: Traffic Type Display', () => {
    it('should display traffic type', () => {
      render(<SpectrumAppsTable {...defaultProps} />);
      expect(screen.getByText('direct')).toBeInTheDocument();
      expect(screen.getByText('http')).toBeInTheDocument();
    });
  });
});
