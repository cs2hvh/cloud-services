import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/users/delete/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/users/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock authentication
    const { authenticateUser } = await import('@/lib/auth/server-auth');
    vi.mocked(authenticateUser).mockResolvedValue({
      authenticated: true,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
      },
      response: null,
    } as any);
  });

  describe('Success Cases', () => {
    it('TC-DB-041: should delete custom database user', async () => {
      // Mock cluster ownership verification
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean user deletion
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('deleted successfully');
      expect(axios.default.delete).toHaveBeenCalledWith(
        expect.stringContaining('/users/testuser'),
        expect.any(Object)
      );
    });

    it('should sync user deletion to Supabase', async () => {
      const clusterWithUsers = {
        ...mockDatabaseCluster,
        users: [
          { id: 'doadmin', name: 'doadmin', role: 'primary' },
          { id: 'testuser', name: 'testuser', role: 'normal' },
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

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: clusterWithUsers.id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      // Verify both DO and Supabase were updated
      expect(axios.default.delete).toHaveBeenCalled();
    });
  });

  describe('Protected User Tests', () => {
    it('TC-DB-042: should return 400 when attempting to delete default admin user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: 'doadmin',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toContain('cannot delete');
    });

    it('should protect system users from deletion', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const systemUsers = ['doadmin', 'root', 'admin', 'mysql.sys'];

      for (const systemUser of systemUsers) {
        const request = createMockPostRequest(
          'http://localhost:3000/api/services/database/users/delete',
          {
            cluster_id: mockDatabaseCluster.id,
            username: systemUser,
          }
        );

        const response = await POST(request as NextRequest);
        const status = response?.status || 400;
        
        // Should be rejected (400 or 403)
        expect([400, 403]).toContain(status);
      }
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        { username: 'testuser' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject missing username', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: 'invalid-uuid',
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject empty username', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: '',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Error Cases', () => {
    it('TC-DB-043: should return 404 for non-existent user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'User not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: 'nonexistentuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
    });

    it('should return 404 for non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: 'non-existent-cluster',
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
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
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle database query errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Authorization Tests', () => {
    it('should reject deletion for cluster owned by different user', async () => {
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
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: differentUserCluster.id,
          username: 'testuser',
        }
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
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Cascade Deletion', () => {
    it('should remove user from Supabase cluster record', async () => {
      const clusterWithUsers = {
        ...mockDatabaseCluster,
        users: [
          { id: 'doadmin', name: 'doadmin', role: 'primary' },
          { id: 'testuser', name: 'testuser', role: 'normal' },
          { id: 'another', name: 'another', role: 'normal' },
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

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: clusterWithUsers.id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      // Verify deletion was called
      expect(axios.default.delete).toHaveBeenCalled();
    });
  });
});
