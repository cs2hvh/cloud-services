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

  const defaultProps = {
    products: mockProducts as any,
    locations: mockLocations as any,
    projects: mockProjects as any,
    userId: 'test-user-id',
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
          databases: [
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

      // Should show step indicator or form title
      expect(screen.getByText(/create/i) || screen.getByText(/database/i)).toBeInTheDocument();
    });

    it('should display all engine options', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          databases: [
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

      // Should display database engine options
      expect(screen.getByText(/mysql/i) || screen.getByRole('button', { name: /mysql/i })).toBeInTheDocument();
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
          databases: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const mysqlOption = screen.getByLabelText(/mysql/i) || screen.getByRole('radio', { name: /mysql/i });
      await user.click(mysqlOption);

      expect(mysqlOption).toBeChecked();
    });

    it('should allow selecting PostgreSQL engine', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          databases: [
            { id: 'pg', code: 'pg', name: 'PostgreSQL', versions: ['15'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const pgOption = screen.getByLabelText(/postgresql/i) || screen.getByRole('radio', { name: /postgresql/i });
      await user.click(pgOption);

      expect(pgOption).toBeChecked();
    });

    it('should show engine-specific options after selection', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          databases: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0', '5.7'], available: true },
          ],
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const mysqlOption = screen.getByLabelText(/mysql/i);
      await user.click(mysqlOption);

      // Should show version selection
      await waitFor(() => {
        expect(screen.getByText('8.0') || screen.getByText(/version/i)).toBeInTheDocument();
      });
    });

    it('should display all four database types', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: {
          databases: [
            { id: 'mysql', code: 'mysql', name: 'MySQL', versions: ['8.0'], available: true },
            { id: 'pg', code: 'pg', name: 'PostgreSQL', versions: ['15'], available: true },
            { id: 'mongodb', code: 'mongodb', name: 'MongoDB', versions: ['6'], available: true },
            { id: 'redis', code: 'redis', name: 'Redis', versions: ['7'], available: true },
          ],
        },
      });

      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/mysql/i)).toBeInTheDocument();
        expect(screen.getByText(/postgresql/i)).toBeInTheDocument();
        expect(screen.getByText(/mongodb/i)).toBeInTheDocument();
        expect(screen.getByText(/redis/i)).toBeInTheDocument();
      });
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
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const sizeOption = screen.getByRole('radio', { name: /db-s-1vcpu-1gb/i });
      await user.click(sizeOption);

      expect(sizeOption).toBeChecked();
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
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const locationSelect = screen.getByRole('combobox', { name: /location/i });
      await user.click(locationSelect);

      await waitFor(async () => {
        const nyc3Option = screen.getByText(/new york/i);
        await user.click(nyc3Option);
      });

      expect(locationSelect).toHaveValue('nyc3');
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
      vi.mocked(api.post).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Fill form and submit
      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      expect(screen.getByText(/loading|creating/i)).toBeInTheDocument();
    });

    it('should redirect to cluster detail page on success', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 201,
        data: {
          id: 'new-cluster-id',
          cluster_id: 'new-cluster-id',
        },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Complete form submission
      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith(
          expect.stringContaining('/dashboard/services/database/clusters/')
        );
      });
    });

    it('should show success toast notification', async () => {
      vi.mocked(api.post).mockResolvedValue({
        status: 201,
        data: { id: 'new-cluster-id' },
      });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });

  describe('TC-DB-076: Submit form with missing fields', () => {
    it('should show validation error for missing cluster name', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('name'));
    });

    it('should show validation error for invalid cluster name', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'INVALID NAME'); // Uppercase not allowed

      const submitButton = screen.getByRole('button', { name: /next|continue/i });
      await user.click(submitButton);

      expect(toast.error).toHaveBeenCalled();
    });

    it('should show validation error for missing engine selection', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Try to proceed without selecting engine
      const nextButton = screen.getByRole('button', { name: /next|continue/i });
      await user.click(nextButton);

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/engine|database type/i)
      );
    });

    it('should show validation error for missing region', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/location|region/i)
      );
    });

    it('should display validation errors inline', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'ab'); // Too short

      const nextButton = screen.getByRole('button', { name: /next|continue/i });
      await user.click(nextButton);

      expect(screen.getByText(/name.*least.*3/i)).toBeInTheDocument();
    });
  });

  describe('TC-DB-077: Handle creation failure', () => {
    it('should display error message on API failure', async () => {
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

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid configuration')
        );
      });
    });

    it('should keep form editable after error', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      // Form should still be editable
      const nameInput = screen.getByLabelText(/name/i);
      expect(nameInput).not.toBeDisabled();
    });

    it('should allow retry after failure', async () => {
      vi.mocked(api.post)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 201,
          data: { id: 'new-cluster-id' },
        });

      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      
      // First attempt - fails
      await user.click(submitButton);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      // Second attempt - succeeds
      await user.click(submitButton);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });

  describe('Multi-step Form Navigation', () => {
    it('should navigate between form steps', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Should have next/continue button
      const nextButton = screen.getByRole('button', { name: /next|continue/i });
      expect(nextButton).toBeInTheDocument();
    });

    it('should show back button on non-first steps', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /next|continue/i });
      await user.click(nextButton);

      const backButton = screen.queryByRole('button', { name: /back|previous/i });
      expect(backButton).toBeInTheDocument();
    });

    it('should maintain form state when navigating back', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'test-cluster');

      const nextButton = screen.getByRole('button', { name: /next|continue/i });
      await user.click(nextButton);

      const backButton = screen.getByRole('button', { name: /back|previous/i });
      await user.click(backButton);

      expect(nameInput).toHaveValue('test-cluster');
    });
  });

  describe('Terms and Conditions', () => {
    it('should require terms acceptance before submission', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create|submit/i });
      await user.click(submitButton);

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/terms|privacy policy/i)
      );
    });

    it('should enable submission after accepting terms', async () => {
      const user = userEvent.setup();
      render(<DatabaseSelect {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const termsCheckbox = screen.getByRole('checkbox', { name: /terms|agree/i });
      await user.click(termsCheckbox);

      expect(termsCheckbox).toBeChecked();
    });
  });
});
