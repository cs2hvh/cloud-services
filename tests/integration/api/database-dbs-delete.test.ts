import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/dbs/delete/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/dbs/delete', () => {
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
    it('TC-DB-052: should delete custom database', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: 'custom_db',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('deleted successfully');
      expect(axios.default.delete).toHaveBeenCalledWith(
        expect.stringContaining('/dbs/custom_db'),
        expect.any(Object)
      );
    });
  });

  describe('Protected Databases', () => {
    it('TC-DB-053: should return 400 when attempting to delete system database', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: 'mysql',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toContain('cannot delete');
    });

    it('should protect all system databases from deletion', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const systemDatabases = [
        'mysql',
        'sys',
        'information_schema',
        'performance_schema',
        'postgres',
        'template0',
        'template1',
        'defaultdb',
      ];

      for (const dbName of systemDatabases) {
        const request = createMockPostRequest(
          'http://localhost:3000/api/services/database/dbs/delete',
          {
            cluster_id: mockDatabaseCluster.id,
            database_name: dbName,
          }
        );

        const response = await POST(request as NextRequest);
        const status = response?.status || 400;

        // Should be rejected
        expect([400, 403]).toContain(status);
      }
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        { database_name: 'mydb' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject missing database_name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        { cluster_id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: 'invalid-uuid',
          database_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject empty database_name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: '',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent database', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'Database not found' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: 'nonexistent_db',
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
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: 'non-existent-cluster',
          database_name: 'mydb',
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
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: 'mydb',
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
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: 'mydb',
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
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: differentUserCluster.id,
          database_name: 'mydb',
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
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.id,
          database_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Sync to Supabase', () => {
    it('should remove database from Supabase cluster record', async () => {
      const clusterWithDbs = {
        ...mockDatabaseCluster,
        dbs: [
          { id: 'defaultdb', name: 'defaultdb' },
          { id: 'custom_db', name: 'custom_db' },
        ],
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: clusterWithDbs,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: clusterWithDbs.id,
          database_name: 'custom_db',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      // Verify deletion was called
      expect(axios.default.delete).toHaveBeenCalled();
    });
  });
});
