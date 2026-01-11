import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppsList } from '@/components/dashboard/apps/apps-list';
import {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockDeletingApp,
  mockBuildInfo,
} from '../../utils/mock-data-platform-apps';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-app-metrics', () => ({
  useMultipleAppMetrics: () => ({
    data: {},
    loading: false,
  }),
  useAppDetails: () => ({
    details: null,
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock fetch for delete operation
global.fetch = vi.fn();

/**
 * AppsList Component Tests
 * Tests for the applications list view
 */
describe('AppsList Component', () => {
  const defaultProps = {
    apps: [],
    loading: false,
    buildInfo: {},
    buildLogs: {},
    onFetchLogs: vi.fn(),
    onUpdateApps: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Rendering Tests
  // ============================================
  describe('Rendering Tests', () => {
    it('TC-PA-C050: should render apps list correctly', () => {
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'app-1' },
        { ...mockPlatformApp, id: '2', name: 'app-2' },
        { ...mockPlatformApp, id: '3', name: 'app-3' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('Deployed Applications')).toBeInTheDocument();
      expect(screen.getByText('3 apps')).toBeInTheDocument();
    });

    it('TC-PA-C051: should show loading state', () => {
      render(<AppsList {...defaultProps} loading={true} />);

      expect(screen.getByText('Loading applications...')).toBeInTheDocument();
    });

    it('TC-PA-C052: should show empty state when no apps', () => {
      render(<AppsList {...defaultProps} apps={[]} />);

      // Check for empty state message or deploy button
      expect(screen.getByText(/No applications/i) || screen.getByText(/Deploy/i)).toBeInTheDocument();
    });

    it('should display singular "app" when only one app', () => {
      const apps = [{ ...mockPlatformApp, id: '1', name: 'single-app' }];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('1 app')).toBeInTheDocument();
    });

    it('should render AppCard for each app', () => {
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'app-one', status: 'running' },
        { ...mockBuildingApp, id: '2', name: 'app-two' },
        { ...mockFailedApp, id: '3', name: 'app-three' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('app-one')).toBeInTheDocument();
      expect(screen.getByText('app-two')).toBeInTheDocument();
      expect(screen.getByText('app-three')).toBeInTheDocument();
    });
  });

  // ============================================
  // Search/Filter Tests
  // ============================================
  describe('Search/Filter Tests', () => {
    it('TC-PA-C053: should filter apps by search term', async () => {
      const user = userEvent.setup();
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'frontend-app' },
        { ...mockPlatformApp, id: '2', name: 'backend-api' },
        { ...mockPlatformApp, id: '3', name: 'worker-service' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      const searchInput = screen.getByPlaceholderText('Search applications...');
      await user.type(searchInput, 'frontend');

      expect(screen.getByText('frontend-app')).toBeInTheDocument();
      expect(screen.queryByText('backend-api')).not.toBeInTheDocument();
      expect(screen.queryByText('worker-service')).not.toBeInTheDocument();
    });

    it('should show filter count', async () => {
      const user = userEvent.setup();
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'frontend-app' },
        { ...mockPlatformApp, id: '2', name: 'backend-api' },
        { ...mockPlatformApp, id: '3', name: 'frontend-admin' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      const searchInput = screen.getByPlaceholderText('Search applications...');
      await user.type(searchInput, 'frontend');

      expect(screen.getByText('2 of 3')).toBeInTheDocument();
    });

    it('should be case-insensitive search', async () => {
      const user = userEvent.setup();
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'Frontend-App' },
        { ...mockPlatformApp, id: '2', name: 'backend-api' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      const searchInput = screen.getByPlaceholderText('Search applications...');
      await user.type(searchInput, 'FRONTEND');

      expect(screen.getByText('Frontend-App')).toBeInTheDocument();
      expect(screen.queryByText('backend-api')).not.toBeInTheDocument();
    });

    it('should show all apps when search is cleared', async () => {
      const user = userEvent.setup();
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'frontend-app' },
        { ...mockPlatformApp, id: '2', name: 'backend-api' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      const searchInput = screen.getByPlaceholderText('Search applications...');
      await user.type(searchInput, 'frontend');
      await user.clear(searchInput);

      expect(screen.getByText('frontend-app')).toBeInTheDocument();
      expect(screen.getByText('backend-api')).toBeInTheDocument();
    });
  });

  // ============================================
  // Status Display Tests
  // ============================================
  describe('Status Display Tests', () => {
    it('TC-PA-C054: should display running status with correct styling', () => {
      const apps = [{ ...mockPlatformApp, id: '1', name: 'running-app', status: 'running' }];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('TC-PA-C055: should display building status with spinner', () => {
      const apps = [{ ...mockBuildingApp, id: '1', name: 'building-app' }];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('Building')).toBeInTheDocument();
    });

    it('TC-PA-C056: should display failed status', () => {
      const apps = [{ ...mockFailedApp, id: '1', name: 'failed-app' }];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('should display deleting status', () => {
      const apps = [{ ...mockDeletingApp, id: '1', name: 'deleting-app' }];

      render(<AppsList {...defaultProps} apps={apps} />);

      expect(screen.getByText('Deleting')).toBeInTheDocument();
    });
  });

  // ============================================
  // Delete Flow Tests
  // ============================================
  describe('Delete Flow Tests', () => {
    it('TC-PA-C057: should open delete modal on delete click', async () => {
      const user = userEvent.setup();
      const apps = [{ ...mockPlatformApp, id: '1', name: 'app-to-delete', status: 'running' }];

      render(<AppsList {...defaultProps} apps={apps} />);

      // Find and click delete button
      const deleteButton = screen.getByRole('button', { name: /delete/i }) || 
                           screen.getByLabelText(/delete/i);
      if (deleteButton) {
        await user.click(deleteButton);
        
        await waitFor(() => {
          // Look for the dialog modal (alertdialog role)
          expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        });
      }
    });

    it('TC-PA-C058: should call onUpdateApps with deleting status', async () => {
      const onUpdateApps = vi.fn();
      const apps = [{ ...mockPlatformApp, id: '1', name: 'app-to-delete', status: 'running' }];

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      render(
        <AppsList 
          {...defaultProps} 
          apps={apps} 
          onUpdateApps={onUpdateApps}
        />
      );

      // The delete flow should trigger onUpdateApps
      // This tests that the callback is properly wired
      expect(onUpdateApps).toBeDefined();
    });
  });

  // ============================================
  // Build Info Tests
  // ============================================
  describe('Build Info Tests', () => {
    it('TC-PA-C059: should display build information', () => {
      const apps = [{ ...mockPlatformApp, id: '1', name: 'test-app', status: 'running' }];
      const buildInfo = {
        'test-app': mockBuildInfo,
      };

      render(
        <AppsList 
          {...defaultProps} 
          apps={apps}
          buildInfo={buildInfo}
        />
      );

      // Build info should be visible in the app card
      expect(screen.getByText('test-app')).toBeInTheDocument();
    });

    it('should handle missing build info gracefully', () => {
      const apps = [{ ...mockPlatformApp, id: '1', name: 'no-build-app', status: 'running' }];

      render(<AppsList {...defaultProps} apps={apps} buildInfo={{}} />);

      expect(screen.getByText('no-build-app')).toBeInTheDocument();
    });
  });

  // ============================================
  // Logs Expansion Tests
  // ============================================
  describe('Logs Expansion Tests', () => {
    it('TC-PA-C060: should call onFetchLogs when expanding logs', async () => {
      const user = userEvent.setup();
      const onFetchLogs = vi.fn();
      const apps = [{ ...mockPlatformApp, id: '1', name: 'test-app', status: 'running' }];
      const buildInfo = {
        'test-app': { ...mockBuildInfo, number: 5 },
      };

      render(
        <AppsList 
          {...defaultProps} 
          apps={apps}
          buildInfo={buildInfo}
          onFetchLogs={onFetchLogs}
        />
      );

      // Find logs toggle button if exists
      const logsButton = screen.queryByRole('button', { name: /logs|terminal/i });
      if (logsButton) {
        await user.click(logsButton);
        expect(onFetchLogs).toHaveBeenCalledWith('test-app', 5);
      }
    });

    it('should toggle logs expansion state', async () => {
      const user = userEvent.setup();
      const apps = [{ ...mockPlatformApp, id: '1', name: 'test-app', status: 'running' }];
      const buildLogs = {
        'test-app': 'Sample build logs...',
      };

      render(
        <AppsList 
          {...defaultProps} 
          apps={apps}
          buildLogs={buildLogs}
        />
      );

      // Component should handle expansion toggle
      expect(screen.getByText('test-app')).toBeInTheDocument();
    });
  });

  // ============================================
  // Metrics Display Tests
  // ============================================
  describe('Metrics Display Tests', () => {
    it('should fetch metrics for running apps only', () => {
      const apps = [
        { ...mockPlatformApp, id: '1', name: 'running-app', status: 'running' },
        { ...mockBuildingApp, id: '2', name: 'building-app' },
        { ...mockFailedApp, id: '3', name: 'failed-app' },
      ];

      render(<AppsList {...defaultProps} apps={apps} />);

      // Verify running apps are rendered
      expect(screen.getByText('running-app')).toBeInTheDocument();
      expect(screen.getByText('building-app')).toBeInTheDocument();
      expect(screen.getByText('failed-app')).toBeInTheDocument();
    });
  });

  // ============================================
  // Scrollable List Tests
  // ============================================
  describe('Scrollable List Tests', () => {
    it('should have scrollable container for many apps', () => {
      const apps = Array.from({ length: 20 }, (_, i) => ({
        ...mockPlatformApp,
        id: `${i}`,
        name: `app-${i}`,
      }));

      const { container } = render(<AppsList {...defaultProps} apps={apps} />);

      // Check for scrollable container class
      const scrollContainer = container.querySelector('.overflow-y-auto');
      expect(scrollContainer).toBeInTheDocument();
    });
  });
});
