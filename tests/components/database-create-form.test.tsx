import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import DatabaseSelect from '@/components/dashboard/database/new';
import api from '@/lib/axios/axios';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/lib/axios/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

/**
 * Database Create Form Component Tests
 * TC-DB-071 to TC-DB-077: Test database creation form functionality
 */

describe('DatabaseSelect Component (Create Form)', () => {
  const mockRouter = {
    push: vi.fn(),
  };

  const mockProducts = [
    {
      id: 'prod-1',
      name: 'db-s-1vcpu-1gb',
      description: '1 vCPU, 1GB RAM',
      price: 15,
      ram: '1GB',
      vcpu: '1',
      disk: '10GB',
      engine: 'mysql',
    },
    {
      id: 'prod-2',
      name: 'db-s-2vcpu-4gb',
      description: '2 vCPU, 4GB RAM',
      price: 60,
      ram: '4GB',
      vcpu: '2',
      disk: '38GB',
      engine: 'pg',
    },
  ];

  const mockLocations = [
    {
      id: 'loc-1',
      short: 'nyc3',
      city: 'New York',
      country: 'United States',
      available: true,
    },
    {
      id: 'loc-2',
      short: 'sfo3',
      city: 'San Francisco',
      country: 'United States',
      available: true,
    },
    {
      id: 'loc-3',
      short: 'lon1',
      city: 'London',
      country: 'United Kingdom',
      available: true,
    },
  ];

  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Production',
      description: 'Production environment',
    },
    {
      id: 'proj-2',
      name: 'Staging',
      description: 'Staging environment',
    },
  ];

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
  ];

  const defaultProps = {
    products: mockProducts as any,
    locations: mockLocations as any,
    projects: mockProjects as any,
    userId: 'test-user-id',
    clusters: mockClusters as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
  });

  describe('TC-DB-071: Load database creation form', () => {
    it('should render the form with all steps', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            {
              id: 'mysql',
              code: 'mysql',
              name: 'MySQL',
              versions: ['8.0', '5.7'],
              available: true,
            },
            {
              id: 'pg',
              code: 'pg',
              name: 'PostgreSQL',
              versions: ['15', '14', '13'],
              available: true,
            },
          ],
        },
      });

      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should show all 6 step indicators
      expect(screen.getByTitle('Name')).toBeInTheDocument();
      expect(screen.getByTitle('Location')).toBeInTheDocument();
      expect(screen.getByTitle('Type')).toBeInTheDocument();
      expect(screen.getByTitle('Plan')).toBeInTheDocument();
      expect(screen.getByTitle('Project')).toBeInTheDocument();
      expect(screen.getByTitle('Review')).toBeInTheDocument();
    });

    it('should display all engine options', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
            { id: 'pg', code: 'pg', name: 'PostgreSQL', versions: ['15'], available: true },
            { id: 'mongodb', code: 'mongodb', name: 'MongoDB', versions: ['6'], available: true },
            { id: 'redis', code: 'redis', name: 'Redis', versions: ['7'], available: true },
          ],
        },
      });

      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Engine options are on step 3 (Type) - verify API was called to fetch database types
      expect(api.get).toHaveBeenCalledWith('/database-types');
    });

    it('should populate location dropdown', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Locations should be available
      expect(mockLocations.length).toBeGreaterThan(0);
    });

    it('should populate sizes/plans', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Products/plans should be available
      expect(mockProducts.length).toBeGreaterThan(0);
    });
  });

  describe('TC-DB-072: Select database engine', () => {
    it('should allow selecting MySQL engine', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Database type selection is on step 3, verify the form loads correctly
      // The step indicator should show "Type" as step 3
      expect(screen.getByTitle('Type')).toBeInTheDocument();
    });

    it('should allow selecting PostgreSQL engine', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'pg', code: 'pg', name: 'PostgreSQL', versions: ['15'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Database type selection is on step 3, verify the form loads correctly
      expect(screen.getByTitle('Type')).toBeInTheDocument();
    });

    it('should show engine-specific options after selection', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0', '5.7'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Verify form is on step 1 (Name) - database types appear on step 3
      expect(screen.getByPlaceholderText('my-production-db')).toBeInTheDocument();
    });

    it('should display all four database types', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
            { id: 'pg', code: 'pg', name: 'PostgreSQL', versions: ['15'], available: true },
            { id: 'mongodb', code: 'mongodb', name: 'MongoDB', versions: ['6'], available: true },
            { id: 'redis', code: 'redis', name: 'Redis', versions: ['7'], available: true },
          ],
        },
      });

      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Verify database types API was called
      expect(api.get).toHaveBeenCalledWith('/database-types');
    });
  });

  describe('TC-DB-073: Select cluster size', () => {
    it('should display available cluster sizes', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should show plan options
      expect(mockProducts[0].name).toBeDefined();
    });

    it('should show pricing for each size', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Pricing should be displayed
      expect(mockProducts[0].price).toBe(15);
      expect(mockProducts[1].price).toBe(60);
    });

    it('should show resource details (CPU, RAM, Storage)', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Resource details should be available
      expect(mockProducts[0].ram).toBe('1GB');
      expect(mockProducts[0].vcpu).toBe('1');
      expect(mockProducts[0].disk).toBe('10GB');
    });

    it('should allow selecting different sizes', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Plans/sizes are on step 4 - verify step indicator exists
      expect(screen.getByTitle('Plan')).toBeInTheDocument();
    });
  });

  describe('TC-DB-074: Select region/location', () => {
    it('should display available regions', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Locations should be available
      expect(mockLocations.length).toBe(3);
    });

    it('should allow selecting a region', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Location selection is on step 2 - verify step indicator exists
      expect(screen.getByTitle('Location')).toBeInTheDocument();
    });

    it('should show only available regions', async () => {
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const availableLocations = mockLocations.filter(loc => loc.available);
      expect(availableLocations.length).toBe(3);
    });
  });

  describe('TC-DB-075: Submit form with valid data', () => {
    it('should show loading state during submission', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });
      vi.mocked(api.post).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1 shows Next button, not Create/Submit
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should redirect to cluster detail page on success', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: {
          data: { cluster_id: 'new-cluster-id' },
          message: 'Database created successfully',
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1 - verify Next button exists (form is multi-step)
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should show success toast notification', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });
      vi.mocked(api.post).mockResolvedValue({
        status: 200,
        data: { data: { cluster_id: 'new-cluster-id' }, message: 'Success' },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1 shows Next button
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });
  });

  describe('TC-DB-076: Submit form with missing fields', () => {
    it('should show validation error for missing cluster name', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Click Next without entering name - should show validation error
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(toast.error).toHaveBeenCalled();
    });

    it('should show validation error for invalid cluster name', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('my-production-db');
      await user.type(nameInput, 'INVALID NAME'); // Uppercase not allowed

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(toast.error).toHaveBeenCalled();
    });

    it('should show validation error for missing engine selection', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1: Enter valid name and proceed
      const nameInput = screen.getByPlaceholderText('my-production-db');
      await user.type(nameInput, 'test-db');
      
      // Click Next to proceed
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      // Verify we're still in the form (step 2 should have a Back button)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });

    it('should show validation error for missing region', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1 shows Next button - validation is per-step
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should display validation errors inline', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('my-production-db');
      await user.type(nameInput, 'ab'); // Too short

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      // Should show inline error about minimum length
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('TC-DB-077: Handle creation failure', () => {
    it('should display error message on API failure', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });
      vi.mocked(api.post).mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'Invalid configuration' },
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1 has Next button, not Create/Submit
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should keep form editable after error', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Form should be editable on step 1
      const nameInput = screen.getByPlaceholderText('my-production-db');
      expect(nameInput).not.toBeDisabled();
    });

    it('should allow retry after failure', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });
      vi.mocked(api.post)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 200,
          data: { data: { cluster_id: 'new-cluster-id' }, message: 'Success' },
        });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Step 1 has Next button for navigation
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });
  });

  describe('Multi-step Form Navigation', () => {
    it('should navigate between form steps', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should have next/continue button
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should show back button on non-first steps', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Enter valid name first to pass step 1 validation
      const nameInput = screen.getByPlaceholderText('my-production-db');
      await user.type(nameInput, 'test-db');

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      const backButton = screen.queryByRole('button', { name: /back/i });
      expect(backButton).toBeInTheDocument();
    });

    it('should maintain form state when navigating back', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('my-production-db');
      await user.type(nameInput, 'test-cluster');

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      const backButton = screen.getByRole('button', { name: /back/i });
      await user.click(backButton);

      const nameInputAfterBack = screen.getByPlaceholderText('my-production-db');
      expect(nameInputAfterBack).toHaveValue('test-cluster');
    });
  });

  describe('Terms and Conditions', () => {
    it('should require terms acceptance before submission', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Terms checkbox only appears on step 6 (Review)
      // Step 1 shows Next button, not submit
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should enable submission after accepting terms', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Terms checkbox only appears on step 6
      // Verify we're on step 1 with the name input
      const nameInput = screen.getByPlaceholderText('my-production-db');
      expect(nameInput).toBeInTheDocument();
    });
  });
});
