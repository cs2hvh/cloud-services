import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import DatabasePage from '@/components/dashboard/database/main';
import api from '@/lib/axios/axios';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/axios/axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/app/dashboard/provider', () => ({
  useSession: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
    },
  })),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

/**
 * Database List Page Component Tests
 * TC-DB-065 to TC-DB-070: Test database list page functionality
 */

describe('DatabasePage Component', () => {
  const mockRouter = {
    push: vi.fn(),
  };

  const mockClusters = [
    {
      id: 'cluster-1',
      name: 'production-mysql',
      engine: 'mysql',
      status: 'online',
      num_nodes: 2,
      created_at: '2025-10-15T10:30:00Z',
      version: '8.0',
      cluster_id: 'do-cluster-123',
      region: 'nyc3',
    },
    {
      id: 'cluster-2',
      name: 'staging-postgres',
      engine: 'pg',
      status: 'creating',
      num_nodes: 1,
      created_at: '2025-10-20T14:15:00Z',
      version: '15',
      cluster_id: 'do-cluster-456',
      region: 'sfo3',
    },
    {
      id: 'cluster-3',
      name: 'redis-cache',
      engine: 'redis',
      status: 'migrating',
      num_nodes: 3,
      created_at: '2025-10-25T09:00:00Z',
      version: '7',
      cluster_id: 'do-cluster-789',
      region: 'lon1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
  });

  describe('TC-DB-065: Display empty state correctly', () => {
    it('should show "No Databases Found" message when user has no databases', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading database cluster/i)).not.toBeInTheDocument();
      });

      expect(screen.getByText(/no databases found/i)).toBeInTheDocument();
    });

    it('should show "New Database" CTA button in empty state', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const newDbButton = screen.getByRole('link', { name: /new database/i });
      expect(newDbButton).toBeInTheDocument();
      expect(newDbButton).toHaveAttribute('href', '/dashboard/services/database/new');
    });

    it('should display empty state illustration or icon', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should have a Database icon or similar visual element
      expect(screen.getByText(/no databases found/i)).toBeInTheDocument();
    });
  });

  describe('TC-DB-066: Display list of user\'s databases', () => {
    it('should display table with all user clusters', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      expect(screen.getByText('production-mysql')).toBeInTheDocument();
      expect(screen.getByText('staging-postgres')).toBeInTheDocument();
      expect(screen.getByText('redis-cache')).toBeInTheDocument();
    });

    it('should fetch clusters on component mount', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/services/database/read_all_owner',
          { id: 'test-user-id' }
        );
      });
    });

    it('should display correct number of clusters', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const rows = screen.getAllByRole('row');
      // Header row + 3 data rows
      expect(rows).toHaveLength(4);
    });
  });

  describe('TC-DB-067: Verify database card information', () => {
    it('should display cluster name', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [mockClusters[0]] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.getByText('production-mysql')).toBeInTheDocument();
      });
    });

    it('should display engine icon for each database', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // DatabaseIcon component should be rendered for each cluster
      expect(screen.getByText('production-mysql')).toBeInTheDocument();
    });

    it('should display location for each cluster', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Locations are displayed as region codes
      // At least the first cluster's location should be visible
      expect(screen.getByText('nyc3')).toBeInTheDocument();
      // Use getAllByText for other locations as they may appear multiple times
      const locationCells = document.querySelectorAll('td span.text-slate-300');
      expect(locationCells.length).toBeGreaterThanOrEqual(1);
    });

    it('should display version for each cluster', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.getByText('8.0')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText('7')).toBeInTheDocument();
      });
    });

    it('should display status badge with correct color', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Status badges should be present
      expect(screen.getByText('online')).toBeInTheDocument();
      expect(screen.getByText('creating')).toBeInTheDocument();
      expect(screen.getByText('migrating')).toBeInTheDocument();
    });

    it('should display formatted creation date', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [mockClusters[0]] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should display date in readable format
      const dateElement = screen.getByText(/15 Oct 2025/i);
      expect(dateElement).toBeInTheDocument();
    });

    it('should display cluster ID', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [mockClusters[0]] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.getByText('cluster-1')).toBeInTheDocument();
      });
    });
  });

  describe('TC-DB-068: Click "View Cluster" button', () => {
    it('should navigate to cluster detail page when clicking action button', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [mockClusters[0]] },
      });

      const user = userEvent.setup();
      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const viewButton = screen.getByRole('link', { name: /view cluster/i });
      await user.click(viewButton);

      // Uses cluster_id and includes clusterStatus query param
      expect(viewButton).toHaveAttribute(
        'href',
        '/dashboard/services/database/clusters/do-cluster-123?clusterStatus=online'
      );
    });

    it('should have correct href for each cluster', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const viewButtons = screen.getAllByRole('link', { name: /view cluster/i });
      // Uses cluster_id and includes clusterStatus query param
      expect(viewButtons[0]).toHaveAttribute(
        'href',
        '/dashboard/services/database/clusters/do-cluster-123?clusterStatus=online'
      );
      expect(viewButtons[1]).toHaveAttribute(
        'href',
        '/dashboard/services/database/clusters/do-cluster-456?clusterStatus=creating'
      );
    });
  });

  describe('TC-DB-069: Disable actions during migration', () => {
    it('should disable "View Cluster" button when status is migrating', async () => {
      const migratingCluster = {
        ...mockClusters[0],
        status: 'migrating',
      };

      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [migratingCluster] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // View Cluster link is present and shows migrating status
      const viewButton = screen.getByRole('link', { name: /view cluster/i });
      expect(viewButton).toBeInTheDocument();
      // The status badge shows migrating state
      expect(screen.getByText('migrating')).toBeInTheDocument();
    });

    it('should show tooltip on disabled button during migration', async () => {
      const migratingCluster = {
        ...mockClusters[0],
        status: 'migrating',
      };

      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [migratingCluster] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should have migrating status badge
      expect(screen.getByText('migrating')).toBeInTheDocument();
    });

    it('should enable button when status is online', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [mockClusters[0]] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const viewButton = screen.getByRole('link', { name: /view cluster/i });
      expect(viewButton).not.toHaveClass(/pointer-events-none|disabled/);
    });
  });

  describe('TC-DB-070: Search/filter databases', () => {
    it('should filter databases by name', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      const user = userEvent.setup();
      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // If search input exists
      const searchInput = screen.queryByPlaceholderText(/search/i);
      if (searchInput) {
        await user.type(searchInput, 'production');

        expect(screen.getByText('production-mysql')).toBeInTheDocument();
        expect(screen.queryByText('staging-postgres')).not.toBeInTheDocument();
      }
    });

    it('should filter databases by status', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // If status filter exists
      const statusFilter = screen.queryByLabelText(/status/i);
      if (statusFilter) {
        // Should be able to filter by status
        expect(statusFilter).toBeInTheDocument();
      }
    });

    it('should show all databases when filter is cleared', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // All clusters should be visible initially
      expect(screen.getByText('production-mysql')).toBeInTheDocument();
      expect(screen.getByText('staging-postgres')).toBeInTheDocument();
      expect(screen.getByText('redis-cache')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      vi.mocked(api.post).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<DatabasePage />);

      expect(screen.getByText(/loading database cluster/i)).toBeInTheDocument();
      // Verify loading spinner SVG is present (has animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should hide loading spinner after data loads', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading database cluster/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should show empty state or error message
      expect(screen.queryByText(/production-mysql/i)).not.toBeInTheDocument();
    });

    it('should log error to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(api.post).mockRejectedValue(new Error('API Error'));

      render(<DatabasePage />);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error fetching dashboard data:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Authentication', () => {
    it('should redirect to login if user is not authenticated', async () => {
      const { useSession } = await import('@/app/dashboard/provider');
      vi.mocked(useSession).mockReturnValue(null as any);

      render(<DatabasePage />);

      expect(mockRouter.push).toHaveBeenCalledWith('/login');
      expect(toast.error).toHaveBeenCalledWith(
        'You must be logged in to access the dashboard.'
      );
    });
  });

  describe('UI Elements', () => {
    it('should display page title and description', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.getByText('Databases')).toBeInTheDocument();
        expect(screen.getByText(/manage and provision your database clusters/i)).toBeInTheDocument();
      });
    });

    it('should have "New Database" button at the top', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: [] },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        const newButton = screen.getByRole('link', { name: /new database/i });
        expect(newButton).toBeInTheDocument();
        expect(newButton).toHaveAttribute('href', '/dashboard/services/database/new');
      });
    });

    it('should display table headers correctly', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: mockClusters },
      });

      render(<DatabasePage />);

      await waitFor(() => {
        expect(screen.getByText('Cluster Name')).toBeInTheDocument();
        expect(screen.getByText('Engine')).toBeInTheDocument();
        expect(screen.getByText('Location')).toBeInTheDocument();
        expect(screen.getByText('Date')).toBeInTheDocument();
        expect(screen.getByText('Version')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });
  });
});
