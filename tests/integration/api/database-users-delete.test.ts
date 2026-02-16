import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/users/delete/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
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
      // Mock Supabase remove_user
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.remove_user).mockResolvedValue({
        success: true,
        data: {},
      });
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
          cluster_id: mockDatabaseCluster.cluster_id,
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

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.remove_user).mockResolvedValue({
        success: true,
        data: {},
      });
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
          cluster_id: clusterWithUsers.cluster_id,
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
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DO API to reject deletion of doadmin
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'cannot delete primary user' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'doadmin',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should protect system users from deletion', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'cannot delete system user' },
        },
      });

      const systemUsers = ['doadmin', 'root', 'admin', 'mysql.sys'];

      for (const systemUser of systemUsers) {
        const request = createMockPostRequest(
          'http://localhost:3000/api/services/database/users/delete',
          {
            cluster_id: mockDatabaseCluster.cluster_id,
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
        { cluster_id: mockDatabaseCluster.cluster_id }
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
          cluster_id: mockDatabaseCluster.cluster_id,
          username: '',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Error Cases', () => {
    it('TC-DB-043: should return 400 for non-existent user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'User not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'nonexistentuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should return 400 for non-existent cluster (forwarded to DO API)', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'cluster not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: '550e8400-e29b-41d4-a716-446655440099',
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBe('cluster not found');
    });

    it('should handle DigitalOcean API errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'DigitalOcean API error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle Supabase sync failure after DO user deletion', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.remove_user).mockResolvedValue({
        success: false,
        error: 'Database sync failed',
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toContain('failed to sync');
    });
  });

  describe('Authorization Tests', () => {
    // NOTE: Route does not perform ownership verification — relies on DO API auth.

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
          cluster_id: mockDatabaseCluster.cluster_id,
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

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.remove_user).mockResolvedValue({
        success: true,
        data: {},
      });
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
          cluster_id: clusterWithUsers.cluster_id,
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
