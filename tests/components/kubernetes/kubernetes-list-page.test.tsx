import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KubernetesPage from '@/app/dashboard/services/kubernetes/page';
import {
  mockKubernetesCluster,
  mockPendingCluster,
  mockCreatingCluster,
} from '../../utils/mock-data-kubernetes';

// Mock Next.js components
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => {
    const hrefValue = typeof href === 'object' ? href.pathname : href;
    return <a href={hrefValue}>{children}</a>;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
}));

describe('KubernetesPage - List View', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Load', () => {
    it('should display loading state initially', () => {
      fetchMock.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<KubernetesPage />);

      // Loading spinner is present (animated spinning div)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should fetch clusters on mount', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockKubernetesCluster],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/services/kubernetes/clusters/read',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('should display clusters after successful fetch', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockKubernetesCluster, mockPendingCluster],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
        expect(screen.getByText(mockPendingCluster.cluster_name)).toBeInTheDocument();
      });
    });

    it('should display empty state when no clusters', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText(/no kubernetes found/i)).toBeInTheDocument();
      });
    });

    it('should handle fetch errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Cluster List Display', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockKubernetesCluster, mockPendingCluster, mockCreatingCluster],
        }),
      });
    });

    it('should display cluster name', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
      });
    });

    it('should display cluster ID', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        // Component displays id field, not cluster_id
        expect(screen.getByText(mockKubernetesCluster.id)).toBeInTheDocument();
      });
    });

    it('should display cluster status', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText('ready')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();
        expect(screen.getByText('creating')).toBeInTheDocument();
      });
    });

    it('should display worker count', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        // Component displays workers.length - use getAllByText since multiple clusters have same count
        const workerCount = mockKubernetesCluster.workers?.length || 0;
        const workerElements = screen.getAllByText(workerCount.toString());
        expect(workerElements.length).toBeGreaterThan(0);
      });
    });

    it('should display k8s version', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        const versions = screen.getAllByText(mockKubernetesCluster.k8s_version);
        expect(versions.length).toBeGreaterThan(0);
      });
    });

    it('should display created date', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        // Check for date in some format (multiple clusters have same date)
        const dates = screen.getAllByText(/2024/);
        expect(dates.length).toBeGreaterThan(0);
      });
    });

    it('should render download kubeconfig button for ready clusters', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        const downloadButtons = screen.getAllByRole('button', { name: /download kubeconfig/i });
        expect(downloadButtons.length).toBeGreaterThan(0);
      });
    });

    it('should render view cluster link', async () => {
      render(<KubernetesPage />);

      await waitFor(() => {
        const viewLinks = screen.getAllByRole('link', { name: /view cluster/i });
        expect(viewLinks.length).toBeGreaterThan(0);
        expect(viewLinks[0]).toHaveAttribute('href', expect.stringContaining('/clusters/'));
      });
    });
  });

  describe('Create Cluster Button', () => {
    it('should display create cluster button', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /new kubernetes/i })).toBeInTheDocument();
      });
    });

    it('should link to new cluster page', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        const createLink = screen.getByRole('link', { name: /new kubernetes/i });
        expect(createLink).toHaveAttribute('href', '/dashboard/services/kubernetes/new');
      });
    });
  });

  describe('Download Kubeconfig', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockKubernetesCluster],
        }),
      });
    });

    it('should call download API when download button clicked', async () => {
      const user = userEvent.setup();
      
      render(<KubernetesPage />);

      // Wait for clusters to load
      await waitFor(() => {
        expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
      });

      // Mock download API response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: 'apiVersion: v1\nkind: Config',
        }),
      });

      const downloadButton = screen.getByRole('button', { name: /download kubeconfig/i });
      await user.click(downloadButton);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/services/kubernetes/clusters/downloadkube',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ cluster_id: mockKubernetesCluster.cluster_id }),
          })
        );
      });
    });

    it('should create blob and trigger download', async () => {
      const user = userEvent.setup();
      const mockClick = vi.fn();
      
      // Mock createElement to capture click calls
      const originalCreateElement = document.createElement.bind(document);
      document.createElement = vi.fn((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = mockClick;
        }
        return element;
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: 'apiVersion: v1\nkind: Config',
        }),
      });

      const downloadButton = screen.getByRole('button', { name: /download/i });
      await user.click(downloadButton);

      await waitFor(() => {
        expect(mockClick).toHaveBeenCalled();
      });

      // Restore original createElement
      document.createElement = originalCreateElement;
    });

    it('should download with correct filename (.yaml extension)', async () => {
      const user = userEvent.setup();
      let downloadFilename = '';

      const originalCreateElement = document.createElement.bind(document);
      document.createElement = vi.fn((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          Object.defineProperty(element, 'download', {
            set: (value) => {
              downloadFilename = value;
            },
            get: () => downloadFilename,
          });
        }
        return element;
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: 'apiVersion: v1\nkind: Config',
        }),
      });

      const downloadButton = screen.getByRole('button', { name: /download/i });
      await user.click(downloadButton);

      await waitFor(() => {
        expect(downloadFilename).toContain('.yaml');
        expect(downloadFilename).toContain(mockKubernetesCluster.cluster_id);
      });

      document.createElement = originalCreateElement;
    });

    it('should handle download API errors', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
      });

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const downloadButton = screen.getByRole('button', { name: /download kubeconfig/i });
      await user.click(downloadButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to download kubeconfig');
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Status Badge Rendering', () => {
    it('should show different badge colors for different statuses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockKubernetesCluster, mockPendingCluster, mockCreatingCluster],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        expect(screen.getByText('ready')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();
        expect(screen.getByText('creating')).toBeInTheDocument();
      });

      // Badge colors should be different (test via class)
      const readyBadge = screen.getByText('ready');
      const pendingBadge = screen.getByText('pending');
      
      // They should have different styles/classes
      expect(readyBadge.className).toContain('green');
      expect(pendingBadge.className).toContain('yellow');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible heading', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        const headings = screen.getAllByRole('heading', { name: /kubernetes/i });
        expect(headings[0]).toBeInTheDocument();
        expect(headings[0]).toHaveTextContent('Kubernetes');
      });
    });

    it('should have accessible table structure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockKubernetesCluster],
        }),
      });

      render(<KubernetesPage />);

      await waitFor(() => {
        // Should have table with proper structure
        const table = screen.queryByRole('table');
        if (table) {
          expect(within(table).queryAllByRole('row').length).toBeGreaterThan(0);
        }
      });
    });
  });
});
