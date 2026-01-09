import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/delete/route';
import { NextRequest } from 'next/server';
import {
  mockKubernetesCluster,
  mockKubernetesUser,
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
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('axios');

// Helper to create Supabase mock for delete operations
function createDeleteSupabaseMock(clusterData: any, readError: any = null, deleteError: any = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: clusterData,
            error: readError,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            data: clusterData ? [clusterData] : [],
            error: deleteError,
          })),
        })),
      })),
    })),
  };
}

describe('POST /api/services/kubernetes/clusters/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock for requireAdmin
    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    // Default mock for Projects.add_log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    // Default mock for Billing.close_active_service
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.close_active_service).mockResolvedValue({ success: true } as any);

    // Default mock for axios (droplet deletion)
    const axios = await import('axios');
    vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });
  });

  describe('Authentication Tests', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock({
          ...mockKubernetesCluster,
          owner_id: mockKubernetesUser.id,
        }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock({
          ...mockKubernetesCluster,
          owner_id: mockKubernetesUser.id,
        }) as any
      );
    });

    it('should delete cluster with valid cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('deleted');
    });

    it('should delete control plane droplet from DigitalOcean', async () => {
      const axios = await import('axios');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      // Check that control plane droplet was deleted
      expect(axios.default.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/droplets/${mockKubernetesCluster.control_plane.droplet_id}`),
        expect.any(Object)
      );
    });

    it('should delete worker droplets from DigitalOcean', async () => {
      const axios = await import('axios');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      // Check that worker droplets were deleted
      for (const worker of mockKubernetesCluster.workers) {
        expect(axios.default.delete).toHaveBeenCalledWith(
          expect.stringContaining(`${worker.droplet_id}`),
          expect.any(Object)
        );
      }
    });

    it('should add activity log on deletion', async () => {
      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'Trash2',
        })
      );
    });

    it('should close billing on deletion', async () => {
      const { Billing } = await import('@/lib/supabase/queries/billing');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(Billing.close_active_service).toHaveBeenCalledWith(
        'kubernetes',
        expect.objectContaining({
          serviceId: mockKubernetesCluster.cluster_id,
        })
      );
    });
  });

  describe('Error Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);
    });

    it('should return error for non-existent cluster', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock(null, { message: 'Cluster not found' }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should handle DigitalOcean API errors gracefully', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock({
          ...mockKubernetesCluster,
          owner_id: mockKubernetesUser.id,
        }) as any
      );

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue(new Error('API Error'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      // Should still succeed but with droplet_warnings
      const data = await expectResponseStatus(response, 200);
      expect(data.droplet_warnings).toBeDefined();
    });

    it('should handle database deletion errors', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock(
          { ...mockKubernetesCluster, owner_id: mockKubernetesUser.id },
          null,
          { message: 'Database error' }
        ) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Authorization Tests', () => {
    it('should allow user to delete own cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock({
          ...mockKubernetesCluster,
          owner_id: mockKubernetesUser.id,
        }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('should reject non-admin deleting another users cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock({
          ...mockKubernetesCluster,
          owner_id: 'different-user-id',
        }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 403);
    });

    it('should allow admin to delete any cluster', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock admin check
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock({
          ...mockKubernetesCluster,
          owner_id: 'different-user-id',
        }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        { cluster_id: mockKubernetesCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  describe('Validation Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);
    });

    it('should handle missing cluster_id', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue(
        createDeleteSupabaseMock(null, { message: 'Invalid cluster_id' }) as any
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/delete',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });
});
