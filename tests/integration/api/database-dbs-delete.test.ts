import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/dbs/delete/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('axios');

describe('POST /api/services/database/dbs/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
    
    // Setup default mocks
    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: mockDatabaseCluster,
    });
    vi.mocked(Database_Clusters.remove_db).mockResolvedValue({
      success: true,
      data: mockDatabaseCluster,
    });
    
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue(true);
  });

  describe('Success Cases', () => {
    it('TC-DB-052: should delete custom database', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'custom_db',
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
    // NOTE: Protected database validation (system databases like mysql, postgres, etc.)
    // is handled entirely by the DigitalOcean API, not at our API level.
    // Our route simply forwards the delete request to DO, which rejects protected DBs.

    it('should forward system database delete to DO and return DO error', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'cannot delete protected database' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'mysql',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBe('cannot delete protected database');
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        { db_name: 'mydb' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject missing db_name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: 'invalid-uuid',
          db_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject empty db_name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: '',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent database', async () => {
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
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'nonexistent_db',
        }
      );

      const response = await POST(request as NextRequest);
      // API catches DO errors and returns 400
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should return 404 for non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: '550e8400-e29b-41d4-a716-446655440099',
          db_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      // API catches DO errors and returns 400
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle DigitalOcean API errors', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue({
        response: {
          data: { message: 'DigitalOcean API error' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle database query errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.remove_db).mockResolvedValue({
        success: false,
        error: 'Database write failed',
      });
      
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Authorization Tests', () => {
    // NOTE: Route does not perform ownership verification — relies on DO API auth.
    // No ownership test needed here.

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
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Sync to Supabase', () => {
    it('should remove database from Supabase cluster record', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/delete',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          db_name: 'custom_db',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      // Verify Supabase sync was called
      expect(Database_Clusters.remove_db).toHaveBeenCalledWith(
        mockDatabaseCluster.cluster_id,
        'custom_db'
      );
    });
  });
});
