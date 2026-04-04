import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/dbs/retrieve/route';
import { NextRequest } from 'next/server';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('axios');

/**
 * Database Retrieve Tests
 * TC-DB-051: Get specific database details from a cluster
 *
 * Route: POST /api/services/database/dbs/retrieve
 * Auth: authenticateUser()
 * Validation: retrieveDbSchema -> { cluster_id: UUID, name: string (min 1) }
 * External: DigitalOcean GET /v2/databases/{cluster_id}/dbs/{name}
 * Response: { data: db, message } on 200, { error } on 400
 */

const VALID_CLUSTER_ID = '550e8400-e29b-41d4-a716-446655440001';
const API_URL = 'http://localhost:3000/api/services/database/dbs/retrieve';

describe('POST /api/services/database/dbs/retrieve', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DIGITAL_OCEAN_TOKEN = 'test-do-token';
    mockAuthenticatedUser();

    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        cluster_id: VALID_CLUSTER_ID,
        owner_id: '550e8400-e29b-41d4-a716-446655440000',
        engine: 'mysql',
      },
    } as any);
  });

  describe('Authentication Tests', () => {
    it('TC-DB-051: should reject unauthenticated requests', async () => {
      await mockUnauthenticatedUser();
      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });

    it('should accept authenticated user request', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { db: { name: 'test_db' } },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      expect(response!.status).not.toBe(401);
    });

    it('should reject retrieving a database from a cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          cluster_id: VALID_CLUSTER_ID,
          owner_id: '00000000-0000-0000-0000-000000000999',
          engine: 'mysql',
        },
      } as any);

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);
      expect(data.error).toContain('not authorized');
    });
  });

  describe('Validation Tests', () => {
    it('TC-DB-052: should return 400 for missing cluster_id', async () => {
      const request = createMockPostRequest(API_URL, {
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('TC-DB-053: should return 400 for missing name', async () => {
      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should return 400 for invalid cluster_id (not UUID)', async () => {
      const request = createMockPostRequest(API_URL, {
        cluster_id: 'invalid-uuid',
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should return 400 for empty name', async () => {
      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: '',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should return 400 for empty body', async () => {
      const request = createMockPostRequest(API_URL, {});

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });
  });

  describe('Success Cases', () => {
    it('TC-DB-054: should retrieve database details by name', async () => {
      const mockDb = { name: 'production_db', size_mib: 100 };
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { db: mockDb },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'production_db',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.data).toBeDefined();
      expect(data.data.name).toBe('production_db');
      expect(data.message).toBe('Database retrieved successfully');
    });

    it('should call DigitalOcean API with correct URL and headers', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { db: { name: 'test_db' } },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      await POST(request as NextRequest);

      expect(axios.default.get).toHaveBeenCalledWith(
        `https://api.digitalocean.com/v2/databases/${VALID_CLUSTER_ID}/dbs/test_db`,
        {
          headers: {
            Authorization: 'test-do-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should retrieve default database', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { db: { name: 'defaultdb' } },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'defaultdb',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);
      expect(data.data.name).toBe('defaultdb');
    });

    it('should retrieve database with special names', async () => {
      const specialNames = ['information_schema', 'postgres', 'mysql', 'test_db_123'];

      const axios = await import('axios');

      for (const dbName of specialNames) {
        vi.mocked(axios.default.get).mockResolvedValue({
          status: 200,
          data: { db: { name: dbName } },
        });

        const request = createMockPostRequest(API_URL, {
          cluster_id: VALID_CLUSTER_ID,
          name: dbName,
        });

        const response = await POST(request as NextRequest);
        const data = await expectResponseStatus(response!, 200);
        expect(data.data.name).toBe(dbName);
      }
    });
  });

  describe('Error Cases', () => {
    it('TC-DB-055: should return 400 when database not found on DO', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          data: { message: 'Database not found' },
        },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'non_existent_db',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);
      expect(data.error).toBe('Database not found');
    });

    it('should return 400 when cluster not found on DO', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          data: { message: 'cluster not found' },
        },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);
      expect(data.error).toBe('cluster not found');
    });

    it('should return 400 with "Invalid request" when DO error has no message', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue({
        response: {
          data: {},
        },
      });

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);
      expect(data.error).toBe('Invalid request');
    });

    it('should handle non-AxiosError (unknown error)', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockRejectedValue(new Error('Network failure'));

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 500);
    });

    it('should handle DigitalOcean timeout', async () => {
      const axios = await import('axios');
      const timeoutError = new Error('timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      vi.mocked(axios.default.get).mockRejectedValue(timeoutError);

      const request = createMockPostRequest(API_URL, {
        cluster_id: VALID_CLUSTER_ID,
        name: 'test_db',
      });

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 500);
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid consecutive requests', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { db: { name: 'test_db' } },
      });

      const requests = Array(5)
        .fill(null)
        .map(() =>
          createMockPostRequest(API_URL, {
            cluster_id: VALID_CLUSTER_ID,
            name: 'test_db',
          })
        );

      const responses = await Promise.all(
        requests.map((req) => POST(req as NextRequest))
      );

      for (const response of responses) {
        await expectResponseStatus(response!, 200);
      }
    });
  });
});
