import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/network/read/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');

describe('POST /api/services/database/network/read', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
  });

  describe('Success Cases', () => {
    it('TC-DB-055: should retrieve firewall rules for cluster', async () => {
      const clusterWithRules = {
        ...mockDatabaseCluster,
        network_rules: [
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
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: clusterWithRules,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(2);
    });

    it('TC-DB-056: should return empty array for cluster with no rules', async () => {
      const clusterNoRules = {
        ...mockDatabaseCluster,
        network_rules: [],
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: clusterNoRules,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(0);
    });

    it('TC-DB-057: should retrieve different rule types (ip_addr, droplet, k8s, tag, app)', async () => {
      const clusterWithAllRuleTypes = {
        ...mockDatabaseCluster,
        network_rules: [
          { uuid: 'rule-1', type: 'ip_addr', value: '192.168.1.1' },
          { uuid: 'rule-2', type: 'droplet', value: '12345' },
          { uuid: 'rule-3', type: 'k8s', value: 'k8s-cluster-id' },
          { uuid: 'rule-4', type: 'tag', value: 'web-servers' },
          { uuid: 'rule-5', type: 'app', value: 'app-id' },
        ],
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: clusterWithAllRuleTypes,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data.length).toBe(5);
      const types = data.data.map((rule: any) => rule.type);
      expect(types).toContain('ip_addr');
      expect(types).toContain('droplet');
      expect(types).toContain('k8s');
      expect(types).toContain('tag');
      expect(types).toContain('app');
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
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
        'http://localhost:3000/api/services/database/network/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });

    it('should reject reading network rules for a cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          ...mockDatabaseCluster,
          owner_id: '00000000-0000-0000-0000-000000000999',
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);
      expect(data.error).toContain('not authorized');
    });
  });

  describe('Error Handling', () => {
    it('TC-DB-055: should handle database errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/network/read',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 500);
    });
  });
});
