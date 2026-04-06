import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/dbs/list/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('axios');

describe('POST /api/services/database/dbs/list', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
    
    // Setup default mocks
    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: mockDatabaseCluster,
    });
    vi.mocked(Database_Clusters.update_dbs).mockResolvedValue({
      success: true,
      data: mockDatabaseCluster,
    });
  });

  describe('Success Cases', () => {
    it('TC-DB-049: should list all databases in cluster', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          dbs: [
            { name: 'defaultdb' },
            { name: 'production_db' },
            { name: 'staging_db' },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(3);
    });

    it('TC-DB-050: should include default MySQL databases', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          dbs: [
            { name: 'defaultdb' },
            { name: 'information_schema' },
            { name: 'mysql' },
            { name: 'performance_schema' },
            { name: 'sys' },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      const dbNames = data.data.map((db: any) => db.name);
      expect(dbNames).toContain('mysql');
      expect(dbNames).toContain('information_schema');
      expect(dbNames).toContain('performance_schema');
    });

    it('TC-DB-050: should include default PostgreSQL databases', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          dbs: [
            { name: 'defaultdb' },
            { name: 'postgres' },
            { name: 'template0' },
            { name: 'template1' },
          ],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      const dbNames = data.data.map((db: any) => db.name);
      expect(dbNames).toContain('postgres');
      expect(dbNames).toContain('template0');
      expect(dbNames).toContain('template1');
    });

    it('should return empty array for Redis cluster (no databases)', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: {
          dbs: [],
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(data.data.length).toBe(0);
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: 'invalid-uuid' }
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
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });

    it('should reject listing databases for a cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          ...mockDatabaseCluster,
          owner_id: '00000000-0000-0000-0000-000000000999',
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);
      expect(data.error).toContain('not authorized');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent cluster', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'Cluster not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: '550e8400-e29b-41d4-a716-446655440099' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
    });

    it('should handle DigitalOcean API errors', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          data: { message: 'DigitalOcean API error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle database query errors', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue(
        new Error('Network error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/list',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });
});
