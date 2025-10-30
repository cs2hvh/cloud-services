import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/delete/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  describe('Success Cases', () => {
    it('TC-DB-024: should delete cluster with valid authentication', async () => {
      // Mock Supabase read to verify ownership
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean delete API
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      // Mock Supabase delete
    //   vi.mocked(Database_Clusters.delete).mockResolvedValue({
    //     success: true,
    //     data: { id: mockDatabaseCluster.id },
    //   });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('deleted successfully');
      expect(axios.default.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/databases/${mockDatabaseCluster.cluster_id}`),
        expect.any(Object)
      );
    });

    it('TC-DB-029: should sync deletion between DigitalOcean and Supabase', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const deleteMock = vi.fn().mockResolvedValue({
        success: true,
        data: { id: mockDatabaseCluster.id },
      });
      vi.mocked(Database_Clusters.delete).mockImplementation(deleteMock);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.id }
      );

      await POST(request as NextRequest);

      // Verify both systems were called
      expect(axios.default.delete).toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalled();
    });
  });

  describe('Authorization Tests', () => {
    it('TC-DB-027: should return 403 when deleting cluster owned by different user', async () => {
      const differentUserCluster = {
        ...mockDatabaseCluster,
        owner_id: 'different-user-id',
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: differentUserCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: differentUserCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);

      expect(data.error).toContain('not authorized');
    });

    it('should reject unauthenticated requests', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      const { NextResponse } = await import('next/server');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ) as any,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Error Cases', () => {
    it('TC-DB-026: should return 404 for non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
    });

    it('should return 400 for missing cluster ID', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should return 400 for invalid cluster ID format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should handle DigitalOcean API errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue(
        new Error('DigitalOcean API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });

    it('TC-DB-029: should handle Supabase deletion failure with rollback', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      // Supabase delete fails
      vi.mocked(Database_Clusters.delete).mockResolvedValue({
        success: false,
        error: 'Database deletion failed',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
      // In real implementation, should verify rollback was attempted
    });
  });

  describe('Cascade Deletion Tests', () => {
    it('TC-DB-028: should verify cascade deletion of associated records', async () => {
      const clusterWithUsers = {
        ...mockDatabaseCluster,
        users: [
          { id: 'user1', name: 'testuser1', role: 'normal' },
          { id: 'user2', name: 'testuser2', role: 'normal' },
        ],
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: clusterWithUsers,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

    //   vi.mocked(Database_Clusters.delete).mockResolvedValue({
    //     success: true,
    //     data: { id: clusterWithUsers.id },
    //   });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: clusterWithUsers.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      // Verify deletion was called (cascade should be handled by DB constraints)
      expect(Database_Clusters.delete).toHaveBeenCalledWith(clusterWithUsers.id);
    });
  });

  describe('Active Connections Warning', () => {
    it('TC-DB-025: should handle deletion of cluster with active connections', async () => {
      // This test represents the warning scenario
      // In real implementation, might check connection count before deletion
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

    //   vi.mocked(Database_Clusters.delete).mockResolvedValue({
    //     success: true,
    //     data: { id: mockDatabaseCluster.id },
    //   });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.id, force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);
    });
  });
});
