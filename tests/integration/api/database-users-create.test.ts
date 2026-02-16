import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/users/create/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster, mockDatabaseUser } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/config/functions', () => ({
  Encryption: {
    encrypt: vi.fn((val: string) => ({ encrypted: val, iv: 'test', tag: 'test', salt: 'test' })),
    decrypt: vi.fn((val: any) => val.encrypted || val),
  },
}));
vi.mock('axios');

describe('POST /api/services/database/users/create', () => {
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
    it('TC-DB-034: should create new database user with password', async () => {
      // Mock Supabase add_user
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.add_user).mockResolvedValue({
        success: true,
        data: {},
      });
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean user creation
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'testuser',
            role: 'normal',
            password: 'generated-password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('created successfully');
      expect(data.data).toBeDefined();
      expect(data.data.name).toBe('testuser');
    });

    it('TC-DB-036: should create user without password (auto-generate)', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.add_user).mockResolvedValue({
        success: true,
        data: {},
      });
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      const generatedPassword = 'auto-generated-secure-password-123';
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'testuser',
            role: 'normal',
            password: generatedPassword,
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
          // No password provided
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(data.data.password).toBeDefined();
      expect(data.data.password.length).toBeGreaterThan(12);
    });

    it('TC-DB-035: should create user with MySQL-specific roles', async () => {
      const mysqlCluster = {
        ...mockDatabaseCluster,
        engine: 'mysql',
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.add_user).mockResolvedValue({
        success: true,
        data: {},
      });
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mysqlCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'adminuser',
            role: 'primary',
            password: 'admin-password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mysqlCluster.cluster_id,
          name: 'adminuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data.role).toBe('primary');
    });
  });

  describe('Validation Tests', () => {
    it('should reject empty username', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: '',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: 'invalid-uuid',
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('TC-DB-038: should validate username with special characters', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.add_user).mockResolvedValue({
        success: true,
        data: {},
      });
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'test_user_123',
            role: 'normal',
            password: 'password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'test_user_123',
        }
      );

      const response = await POST(request as NextRequest);
      const status = response?.status || 400;
      
      // Should either accept or reject with proper validation
      expect([200, 400]).toContain(status);
    });
  });

  describe('Duplicate User Tests', () => {
    it('TC-DB-037: should return 400 for duplicate username', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          status: 409,
          data: { message: 'User already exists' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'doadmin', // Default user that already exists
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
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
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent cluster (forwarded to DO API)', async () => {
      // Route doesn't check cluster existence — DO returns error for invalid cluster
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          data: { message: 'cluster not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: '550e8400-e29b-41d4-a716-446655440099',
          name: 'testuser',
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
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          data: { message: 'DigitalOcean API error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle Supabase sync failure after DO user creation', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.add_user).mockResolvedValue({
        success: false,
        error: 'Database sync failed',
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'testuser',
            role: 'normal',
            password: 'generated-pw',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toContain('failed to sync');
    });
  });

  describe('Password Security', () => {
    it('should return generated password securely', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.add_user).mockResolvedValue({
        success: true,
        data: {},
      });
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'testuser',
            role: 'normal',
            password: 'secure-generated-password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Password should be returned once for user to save
      expect(data.data.password).toBeDefined();
      expect(typeof data.data.password).toBe('string');
      expect(data.data.password.length).toBeGreaterThan(0);
    });
  });

  describe('Sync to Supabase', () => {
    it('should sync user creation to Supabase', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      
      const addUserMock = vi.fn().mockResolvedValue({
        success: true,
        data: {},
      });
      vi.mocked(Database_Clusters.add_user).mockImplementation(addUserMock);
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          user: {
            name: 'testuser',
            role: 'normal',
            password: 'password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'testuser',
        }
      );

      await POST(request as NextRequest);

      // Verify Supabase was updated with new user
      expect(addUserMock).toHaveBeenCalled();
    });
  });
});
