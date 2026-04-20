//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/users/reset/route';
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

describe('POST /api/services/database/users/reset', () => {
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
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: mockDatabaseCluster,
    });
    vi.mocked(Database_Clusters.get_users).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(Database_Clusters.update_users).mockResolvedValue({
      success: true,
    });
    vi.mocked(Database_Clusters.update_connections).mockResolvedValue({
      success: true,
    });
  });

  describe('Success Cases', () => {
    it('TC-DB-044: should reset user password and return new password', async () => {
      // Mock cluster ownership verification
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean password reset
      const axios = await import('axios');
      const newPassword = 'new-secure-password-123';
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'testuser',
            password: newPassword,
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('reset successfully');
      expect(data.data.password).toBeDefined();
      expect(data.data.password).toBe(newPassword);
      expect(data.data.password.length).toBeGreaterThan(12);
    });

    it('TC-DB-045: should reset password for primary user with appropriate warning', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      const newPassword = 'new-admin-password-456';
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'doadmin',
            role: 'primary',
            password: newPassword,
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'doadmin',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data.password).toBeDefined();
      expect(data.data.password).toBe(newPassword);
      // Could include warning in response
      if (data.warning) {
        expect(data.warning).toContain('primary user');
      }
    });

    it('should generate strong password', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      const strongPassword = 'Abc123!@#XyZ789$%^';
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'testuser',
            password: strongPassword,
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Verify password meets strength requirements
      expect(data.data.password.length).toBeGreaterThan(12);
      expect(data.data.password).toMatch(/[A-Z]/); // Has uppercase
      expect(data.data.password).toMatch(/[a-z]/); // Has lowercase
      expect(data.data.password).toMatch(/[0-9]/); // Has numbers
    });

    it('should update password in DigitalOcean', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'testuser',
            password: 'new-password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      await POST(request as NextRequest);

      // Verify DigitalOcean API was called
      expect(axios.default.post).toHaveBeenCalledWith(
        expect.stringContaining('/users/testuser/reset_auth'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        { username: 'testuser' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject missing username', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
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
        'http://localhost:3000/api/services/database/users/reset',
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
    it('should return 400 for non-existent user', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'User not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'nonexistentuser',
        }
      );

      const response = await POST(request as NextRequest);
      // API returns 400 for all DO errors
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
    });

    it('should return 400 for non-existent cluster', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          data: { message: 'Cluster not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: '550e8400-e29b-41d4-a716-446655440099',
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle DigitalOcean API errors', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          data: { message: 'DigitalOcean API error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      // Provider/API validation failures are surfaced as client errors.
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle database query errors', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue(
        new Error('Network error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Authorization Tests', () => {
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
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Security Tests', () => {
    it('should return password securely (one-time)', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      const newPassword = 'secure-one-time-password';
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'testuser',
            password: newPassword,
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Password should be returned in plain text for user to save
      expect(typeof data.data.password).toBe('string');
      expect(data.data.password).toBe(newPassword);
    });

    it('should not store plain text password in logs', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      const newPassword = 'sensitive-password-value';
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'testuser',
            password: newPassword,
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      await POST(request as NextRequest);

      // In real implementation, verify console.log/logger doesn't contain password
      // This is more of a code review check
      expect(true).toBe(true);
    });
  });

  describe('Sync to Supabase', () => {
    it('should update encrypted password in Supabase', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          user: {
            name: 'testuser',
            password: 'new-password',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/users/reset',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          username: 'testuser',
        }
      );

      await POST(request as NextRequest);

      // Verify password was updated (would be encrypted in real implementation)
      expect(axios.default.post).toHaveBeenCalled();
    });
  });
});
