import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/network/update/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth', () => ({
  authenticateUser: vi.fn(),
}));
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/network/update', () => {
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

  describe('Success Cases - Add Rules', () => {
    it('TC-DB-056: should add IP address firewall rule', async () => {
      // Mock cluster ownership verification
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean add rule API
      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'ip_addr',
              value: '192.168.1.1',
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('Firewall rules updated');
      expect(axios.default.put).toHaveBeenCalledWith(
        expect.stringContaining(`/databases/${mockDatabaseCluster.cluster_id}/firewall`),
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({ type: 'ip_addr', value: '192.168.1.1' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('TC-DB-056: should add CIDR block firewall rule', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'ip_addr',
              value: '10.0.0.0/24',
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('updated');
      expect(axios.default.put).toHaveBeenCalled();
    });

    it('TC-DB-057: should add droplet firewall rule', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'droplet',
              value: '12345',
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBeDefined();
      expect(axios.default.put).toHaveBeenCalled();
    });

    it('TC-DB-057: should add Kubernetes cluster firewall rule', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'k8s',
              value: 'k8s-cluster-uuid',
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBeDefined();
    });

    it('TC-DB-057: should add tag-based firewall rule', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'tag',
              value: 'web-servers',
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBeDefined();
    });

    it('TC-DB-058: should add multiple firewall rules at once', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            { type: 'ip_addr', value: '192.168.1.1' },
            { type: 'ip_addr', value: '10.0.0.0/24' },
            { type: 'droplet', value: '12345' },
            { type: 'tag', value: 'backend' },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBeDefined();
      expect(axios.default.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          rules: expect.arrayContaining([
            expect.objectContaining({ type: 'ip_addr' }),
            expect.objectContaining({ type: 'droplet' }),
            expect.objectContaining({ type: 'tag' }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Success Cases - Remove Rules', () => {
    it('TC-DB-059: should remove specific firewall rule by uuid', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'remove',
          rule_uuid: 'rule-uuid-123',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('removed');
      expect(axios.default.put).toHaveBeenCalled();
    });

    it('TC-DB-059: should remove multiple firewall rules', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'remove',
          rule_uuids: ['rule-1', 'rule-2', 'rule-3'],
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toBeDefined();
    });
  });

  describe('Validation Cases', () => {
    it('TC-DB-060: should reject invalid IP address format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'ip_addr',
              value: '999.999.999.999', // Invalid IP
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });

    it('TC-DB-060: should reject invalid CIDR notation', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'ip_addr',
              value: '10.0.0.0/33', // Invalid CIDR
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });

    it('TC-DB-060: should reject empty rules array for add action', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });

    it('TC-DB-060: should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });

    it('TC-DB-060: should reject invalid action type', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'invalid_action',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });

    it('TC-DB-061: should reject unsupported rule type', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [
            {
              type: 'invalid_type',
              value: 'some-value',
            },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(400);
    });
  });

  describe('Authorization Cases', () => {
    it('TC-DB-060: should reject access to cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: { ...mockDatabaseCluster, owner_id: 'different-user-id' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(403);
    });

    it('TC-DB-060: should require authentication', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }) as any,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('TC-DB-061: should handle non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: 'non-existent-id',
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(404);
    });

    it('TC-DB-061: should handle DigitalOcean API errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockRejectedValue({
        response: {
          status: 422,
          data: { message: 'Invalid firewall rule configuration' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(422);
    });

    it('TC-DB-061: should handle firewall rule conflict (duplicate)', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockRejectedValue({
        response: {
          status: 409,
          data: { message: 'Firewall rule already exists' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(409);
    });

    it('TC-DB-061: should handle network timeout', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: [{ type: 'ip_addr', value: '192.168.1.1' }],
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('TC-DB-061: should handle removal of non-existent rule gracefully', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockResolvedValue({
        status: 200,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'remove',
          rule_uuid: 'non-existent-rule',
        }
      );

      const response = await POST(request as NextRequest);
      
      // Should succeed or return appropriate status
      expect([200, 404]).toContain(response?.status);
    });

    it('TC-DB-061: should handle maximum firewall rules limit', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.put).mockRejectedValue({
        response: {
          status: 422,
          data: { message: 'Maximum number of firewall rules reached' },
        },
      });

      // Try to add many rules
      const manyRules = Array.from({ length: 100 }, (_, i) => ({
        type: 'ip_addr',
        value: `192.168.1.${i}`,
      }));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/update',
        {
          cluster_id: mockDatabaseCluster.id,
          action: 'add',
          rules: manyRules,
        }
      );

      const response = await POST(request as NextRequest);
      
      expect(response?.status).toBe(422);
    });
  });
});
