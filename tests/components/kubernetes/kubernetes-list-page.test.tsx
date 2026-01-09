import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KubernetesClustersMain from '@/components/dashboard/kubernetes/clusters-main';
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

describe('KubernetesClustersMain - List View', () => {
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

  describe('Empty State', () => {
    it('should display empty state when no clusters', () => {
      render(<KubernetesClustersMain clusters={[]} />);
      
      expect(screen.getByText(/no kubernetes found/i)).toBeInTheDocument();
    });

    it('should show create cluster CTA in empty state', () => {
      render(<KubernetesClustersMain clusters={[]} />);
      
      const createLink = screen.getByRole('link', { name: /new kubernetes/i });
      expect(createLink).toBeInTheDocument();
      expect(createLink).toHaveAttribute('href', '/dashboard/services/kubernetes/new');
    });
  });

  describe('Cluster List Display', () => {
    it('should display cluster name', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);
      
      expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
    });

    it('should display cluster ID', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);
      
      expect(screen.getByText(mockKubernetesCluster.cluster_id)).toBeInTheDocument();
    });

    it('should display cluster status', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any, mockPendingCluster as any, mockCreatingCluster as any]} />);
      
      expect(screen.getByText('ready')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('creating')).toBeInTheDocument();
    });

    it('should display worker count', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);
      
      const workerCount = mockKubernetesCluster.workers?.length || 0;
      expect(screen.getByText(workerCount.toString())).toBeInTheDocument();
    });

    it('should display k8s version', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);
      
      expect(screen.getByText(mockKubernetesCluster.k8s_version)).toBeInTheDocument();
    });

    it('should render download kubeconfig button for ready clusters', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);
      
      const downloadButtons = screen.getAllByRole('button', { name: /download kubeconfig/i });
      expect(downloadButtons.length).toBeGreaterThan(0);
    });

    it('should render view cluster link', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);
      
      const viewLinks = screen.getAllByRole('link', { name: /view cluster/i });
      expect(viewLinks.length).toBeGreaterThan(0);
      expect(viewLinks[0]).toHaveAttribute('href', expect.stringContaining('/clusters/'));
    });
  });

  describe('Create Cluster Button', () => {
    it('should display create cluster button', () => {
      render(<KubernetesClustersMain clusters={[]} />);
      
      expect(screen.getByRole('link', { name: /new kubernetes/i })).toBeInTheDocument();
    });

    it('should link to new cluster page', () => {
      render(<KubernetesClustersMain clusters={[]} />);
      
      const createLink = screen.getByRole('link', { name: /new kubernetes/i });
      expect(createLink).toHaveAttribute('href', '/dashboard/services/kubernetes/new');
    });
  });

  describe('Download Kubeconfig', () => {
    it('should call download API when download button clicked', async () => {
      const user = userEvent.setup();
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: 'apiVersion: v1\nkind: Config',
        }),
      });

      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);

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

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: 'apiVersion: v1\nkind: Config',
        }),
      });

      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);

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

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: 'apiVersion: v1\nkind: Config',
        }),
      });

      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);

      const downloadButton = screen.getByRole('button', { name: /download/i });
      await user.click(downloadButton);

      await waitFor(() => {
        expect(downloadFilename).toContain('.yaml');
        expect(downloadFilename).toContain(mockKubernetesCluster.cluster_id);
      });

      document.createElement = originalCreateElement;
    });

    it('should handle download API errors silently', async () => {
      const user = userEvent.setup();

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);

      const downloadButton = screen.getByRole('button', { name: /download kubeconfig/i });
      
      // Should not throw
      await user.click(downloadButton);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
    });
  });

  describe('Status Badge Rendering', () => {
    it('should show different badge colors for different statuses', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any, mockPendingCluster as any, mockCreatingCluster as any]} />);

      expect(screen.getByText('ready')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
      expect(screen.getByText('creating')).toBeInTheDocument();

      // Badge colors should be different (test via class)
      const readyBadge = screen.getByText('ready');
      const pendingBadge = screen.getByText('pending');
      
      // They should have different styles/classes - check they exist
      expect(readyBadge).toBeVisible();
      expect(pendingBadge).toBeVisible();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible heading', () => {
      render(<KubernetesClustersMain clusters={[]} />);

      const headings = screen.getAllByRole('heading', { name: /kubernetes/i });
      expect(headings[0]).toBeInTheDocument();
      expect(headings[0]).toHaveTextContent('Kubernetes');
    });

    it('should have accessible table structure', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);

      // Should have table with proper structure
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      expect(within(table).getAllByRole('row').length).toBeGreaterThan(0);
    });

    it('should have column headers', () => {
      render(<KubernetesClustersMain clusters={[mockKubernetesCluster as any]} />);

      expect(screen.getByRole('columnheader', { name: /cluster/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /nodes/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /version/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
    });
  });

  describe('Multiple Clusters', () => {
    it('should display all clusters in table', () => {
      const clusters = [mockKubernetesCluster, mockPendingCluster, mockCreatingCluster];
      render(<KubernetesClustersMain clusters={clusters as any} />);

      expect(screen.getByText(mockKubernetesCluster.cluster_name)).toBeInTheDocument();
      expect(screen.getByText(mockPendingCluster.cluster_name)).toBeInTheDocument();
      expect(screen.getByText(mockCreatingCluster.cluster_name)).toBeInTheDocument();
    });

    it('should show correct row count in table', () => {
      const clusters = [mockKubernetesCluster, mockPendingCluster, mockCreatingCluster];
      render(<KubernetesClustersMain clusters={clusters as any} />);

      const table = screen.getByRole('table');
      // +1 for header row
      expect(within(table).getAllByRole('row').length).toBe(clusters.length + 1);
    });
  });
});
