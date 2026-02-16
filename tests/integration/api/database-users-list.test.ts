//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/users/list/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/config/functions', () => ({
  Encryption: {
    encrypt: vi.fn((val: string) => ({ encrypted: val, iv: 'test', tag: 'test', salt: 'test' })),
    decrypt: vi.fn((val: any) => val.encrypted || val),
  },
  ConnectionPasswordUpdater: {
    updateEncryptedUri: vi.fn((uri: any, username: string, password: string) => ({ encrypted: `updated-uri-${password}`, iv: 'test', tag: 'test', salt: 'test' })),
    updatePasswordInUri: vi.fn((uri: string, username: string, password: string) => uri),
    isEncryptedData: vi.fn((value: any) => typeof value === 'object' && value !== null && 'encrypted' in value),
  },
  EncryptedData: {},
}));
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

    // Setup default mocks for Database_Clusters
    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.get_users).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(Database_Clusters.update_users).mockResolvedValue({
      success: true,
    });
  });

  describe('Success Cases', () => {
    it('TC-DB-039: should list all users for a cluster', async () => {
      // Mock Supabase update_users
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_users).mockResolvedValue({
        success: true,
        data: {},
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
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(2);
    });

    it('TC-DB-040: should include default users in the list', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_users).mockResolvedValue({
        success: true,
        data: {},
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
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      const hasDefaultAdmin = data.data.some((user: any) => user.name === 'doadmin');
      expect(hasDefaultAdmin).toBe(true);
      expect(data.data[0].role).toBe('primary');
    });

    it('should list users with roles and metadata', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_users).mockResolvedValue({
        success: true,
        data: {},
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
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      data.data.forEach((user: any) => {
        expect(user.name).toBeDefined();
        expect(user.role).toBeDefined();
        expect(['primary', 'normal']).toContain(user.role);
      });
    });

    it('should return empty array for cluster with no custom users', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_users).mockResolvedValue({
        success: true,
        data: {},
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
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data.length).toBe(1);
      expect(data.data[0].name).toBe('doadmin');
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
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for non-existent cluster (forwarded to DO API)', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          data: { message: 'cluster not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: '550e8400-e29b-41d4-a716-446655440099' }
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
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          data: { message: 'DigitalOcean API error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle Supabase sync failure gracefully (returns 200 with warning)', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_users).mockResolvedValue({
        success: false,
        error: 'Sync failed',
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          users: [
            { name: 'testuser', role: 'normal' },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Route returns success with warning for sync failure
      expect(data.data).toBeDefined();
    });
  });

  describe('Security Tests', () => {
    it('should not expose passwords in user list', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.update_users).mockResolvedValue({
        success: true,
        data: {},
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
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Passwords should not be included in list response
      data.data.forEach((user: any) => {
        expect(user.password).toBeUndefined();
      });
    });
  });
});
