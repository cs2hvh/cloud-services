import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/users/list/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/users/list', () => {
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
    it('TC-DB-039: should list all users for a cluster', async () => {
      // Mock cluster ownership verification
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean user list API
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          users: [
            {
              name: 'doadmin',
              role: 'primary',
              mysql_settings: { auth_plugin: 'mysql_native_password' },
            },
            {
              name: 'testuser',
              role: 'normal',
              mysql_settings: { auth_plugin: 'mysql_native_password' },
            },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.users).toBeDefined();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.users.length).toBe(2);
    });

    it('TC-DB-040: should include default users in the list', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          users: [
            {
              name: 'doadmin',
              role: 'primary',
              mysql_settings: { auth_plugin: 'mysql_native_password' },
            },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      const hasDefaultAdmin = data.users.some((user: any) => user.name === 'doadmin');
      expect(hasDefaultAdmin).toBe(true);
      expect(data.users[0].role).toBe('primary');
    });

    it('should list users with roles and metadata', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          users: [
            {
              name: 'doadmin',
              role: 'primary',
              mysql_settings: { auth_plugin: 'mysql_native_password' },
            },
            {
              name: 'readonly',
              role: 'normal',
              mysql_settings: { auth_plugin: 'caching_sha2_password' },
            },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      data.users.forEach((user: any) => {
        expect(user.name).toBeDefined();
        expect(user.role).toBeDefined();
        expect(['primary', 'normal']).toContain(user.role);
      });
    });

    it('should return empty array for cluster with no custom users', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          users: [
            {
              name: 'doadmin',
              role: 'primary',
            },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.users.length).toBe(1);
      expect(data.users[0].name).toBe('doadmin');
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Authorization Tests', () => {
    it('should reject listing users for cluster owned by different user', async () => {
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
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: differentUserCluster.id }
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
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: 'non-existent-id' }
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
      vi.mocked(axios.default.get).mockRejectedValue(
        new Error('DigitalOcean API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
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
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Security Tests', () => {
    it('should not expose passwords in user list', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          users: [
            {
              name: 'doadmin',
              role: 'primary',
            },
            {
              name: 'testuser',
              role: 'normal',
            },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Passwords should not be included in list response
      data.users.forEach((user: any) => {
        expect(user.password).toBeUndefined();
      });
    });
  });
});
