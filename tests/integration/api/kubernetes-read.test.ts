import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/read/route';
import { NextRequest } from 'next/server';
import {
  mockKubernetesCluster,
  mockKubernetesUser,
  mockPendingCluster,
} from '../../utils/mock-data-kubernetes';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/auth');

// Helper to create a Supabase mock with proper chain
function createSupabaseMock(returnData: any, returnError: any = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => ({
            data: returnData,
            error: returnError,
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: Array.isArray(returnData) ? returnData[0] : returnData,
                error: returnError,
              })),
            })),
            single: vi.fn(() => ({
              data: Array.isArray(returnData) ? returnData[0] : returnData,
              error: returnError,
            })),
          })),
        })),
      })),
    })),
  };
}

describe('POST /api/services/kubernetes/clusters/read', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Default mock for requireAdmin (non-admin)
    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });
  });

  describe('List All Clusters', () => {
    it('should return all user clusters', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock([mockKubernetesCluster, mockPendingCluster]) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should return empty array if no clusters', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock([]) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should handle database errors', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock(null, { message: 'Database error' }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Get Single Cluster', () => {
    it('should return specific cluster by cluster_id', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock(mockKubernetesCluster) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.cluster).toBeDefined();
    });

    it('should return 404 for non-existent cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock(null) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 404);
    });

    it('should allow admin to view any cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock admin check
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock(mockKubernetesCluster) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
    });

    it('should handle database error for single cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock(null, { message: 'Database error' }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/read',
        { cluster_id: 'some-id' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  // Security: Ownership is enforced by filtering query (owner_id filter for non-admins).
  // Kubeconfig handling is tested in dedicated endpoint.
});
