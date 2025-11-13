import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/network/read/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth', () => ({
  authenticateUser: vi.fn(),
}));
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/network/read', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup default authentication mock
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
    it('TC-DB-054: should retrieve firewall rules for cluster', async () => {
      // Mock cluster ownership verification
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean firewall rules API
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          rules: [
            {
              uuid: 'rule-1',
              cluster_uuid: mockDatabaseCluster.cluster_id,
              type: 'ip_addr',
              value: '192.168.1.1',
              created_at: '2025-10-01T10:00:00Z',
            },
            {
              uuid: 'rule-2',
              cluster_uuid: mockDatabaseCluster.cluster_id,
              type: 'droplet',
              value: '12345',
              created_at: '2025-10-01T11:00:00Z',
            },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.rules).toBeDefined();
      expect(Array.isArray(data.rules)).toBe(true);
      expect(data.rules.length).toBe(2);
      expect(data.rules[0].type).toBe('ip_addr');
      expect(data.rules[1].type).toBe('droplet');
    });

    it('TC-DB-054: should return empty array for cluster with no rules', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          rules: [],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.rules).toBeDefined();
      expect(Array.isArray(data.rules)).toBe(true);
      expect(data.rules.length).toBe(0);
    });

    it('TC-DB-054: should retrieve different rule types (ip_addr, droplet, k8s, tag, app)', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          rules: [
            { uuid: 'rule-1', type: 'ip_addr', value: '10.0.0.1' },
            { uuid: 'rule-2', type: 'droplet', value: '123' },
            { uuid: 'rule-3', type: 'k8s', value: 'k8s-cluster-id' },
            { uuid: 'rule-4', type: 'tag', value: 'web-servers' },
            { uuid: 'rule-5', type: 'app', value: 'app-id-123' },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.rules.length).toBe(5);
      expect(data.rules.find((r: any) => r.type === 'ip_addr')).toBeDefined();
      expect(data.rules.find((r: any) => r.type === 'droplet')).toBeDefined();
      expect(data.rules.find((r: any) => r.type === 'k8s')).toBeDefined();
      expect(data.rules.find((r: any) => r.type === 'tag')).toBeDefined();
      expect(data.rules.find((r: any) => r.type === 'app')).toBeDefined();
    });
  });

  describe('Validation Cases', () => {
    it('TC-DB-055: should reject request without cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        {}
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });

    it('TC-DB-055: should reject request with invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: 'invalid-id' }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });
  });

  describe('Authorization Cases', () => {
    it('TC-DB-055: should reject access to cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { ...mockDatabaseCluster, owner_id: 'different-user-id' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(403);
    });

    it('TC-DB-055: should require authentication', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }) as any,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('TC-DB-055: should handle non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(404);
    });

    it('TC-DB-055: should handle DigitalOcean API errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(500);
    });

    it('TC-DB-055: should handle network timeout', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(500);
    });
  });
});
