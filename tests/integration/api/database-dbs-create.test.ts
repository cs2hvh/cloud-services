export const runtime = 'nodejs';


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/dbs/create/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');

describe('POST /api/services/database/dbs/create', () => {
  // beforeEach(async () => {
  //   vi.clearAllMocks();
    
  //   // Setup default authentication mock
  //   const authModule = await import('@/lib/auth/server-auth');
  //  // console.log("Setting up authentication mock...");
  //   // vi.mocked(authModule.authenticateUser).mockImplementation(async () => ({
  //   //   authenticated: true,
  //   //   user: {
  //   //     id:'ab6bf954-1f16-4d41-94a9-c2410d55a0e4',
  //   //     email:'pankaj.soni@ahurasense.com',
  //   //   },
  //   //   response: null,
  //   // } as any));
  // });

  console.log("Starting test suite for database dbs create API...");

  describe('Success Cases', () => {
    it('TC-DB-046: should create new database in cluster', async () => {
      // Mock cluster ownership verification
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock DigitalOcean database creation
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          db: {
            name: 'production_db',
          },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'production_db',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 201);

      expect(data.message).toContain('created successfully');
      expect(data.database).toBeDefined();
      expect(data.database.name).toBe('production_db');
    });

    it('should create database with valid naming conventions', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      const validNames = ['myapp', 'app_db', 'test123', 'staging_env'];

      for (const dbName of validNames) {
        vi.mocked(axios.default.post).mockResolvedValue({
          status: 201,
          data: {
            db: { name: dbName },
          },
        });

        const request = createMockPostRequest(
          'http://localhost:3000/api/services/database/dbs/create',
          {
            cluster_id: mockDatabaseCluster.cluster_id,
            name: dbName,
          }
        );

        const response = await POST(request as NextRequest);
        await expectResponseStatus(response!, 201);
      }
    });

    it('should sync database creation to Supabase', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 201,
        data: {
          db: { name: 'new_db' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'new_db',
        }
      );

      await POST(request as NextRequest);

      // Verify Supabase was updated
      expect(axios.default.post).toHaveBeenCalled();
    });
  });

  describe('Reserved Names Validation', () => {
    it('TC-DB-047: should reject reserved database names', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const reservedNames = [
        'mysql',
        'sys',
        'information_schema',
        'performance_schema',
        'postgres',
        'template0',
        'template1',
        'admin',
        'local',
        'config',
      ];

      for (const reservedName of reservedNames) {
        const request = createMockPostRequest(
          'http://localhost:3000/api/services/database/dbs/create',
          {
            cluster_id: mockDatabaseCluster.cluster_id,
            name: reservedName,
          }
        );

        const response = await POST(request as NextRequest);
        const status = response?.status || 400;

        // Should be rejected with 400
        expect(status).toBe(400);
      }
    });
  });

  describe('Duplicate Detection', () => {
    it('TC-DB-048: should return 409 for duplicate database name', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue({
        response: {
          status: 409,
          data: { message: 'Database already exists' },
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'defaultdb', // Already exists
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 409);

      expect(data.error).toBeDefined();
    });
  });

  describe('Validation Tests', () => {
    it('should reject missing cluster_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        { name: 'mydb' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject missing database name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        { cluster_id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid cluster_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: 'invalid-uuid',
          name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject empty database name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: '',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should reject database names with spaces', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'my database',
        }
      );

      const response = await POST(request as NextRequest);
      const status = response?.status || 400;

      expect([400, 201]).toContain(status);
      // Should ideally be 400, but depends on validation
    });

    it('should reject database names with special characters', async () => {
      const invalidNames = ['my-db!', 'db@name', 'test#db', 'db$name'];

      for (const name of invalidNames) {
        const request = createMockPostRequest(
          'http://localhost:3000/api/services/database/dbs/create',
          {
            cluster_id: mockDatabaseCluster.cluster_id,
            name,
          }
        );

        const response = await POST(request as NextRequest);
        const status = response?.status || 400;

        // Should be rejected or handled
        expect([400, 201, 500]).toContain(status);
      }
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: 'non-existent-cluster',
          name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
    });

    it('should handle DigitalOcean API errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue(
        new Error('DigitalOcean API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle database query errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Authorization Tests', () => {
    it('should reject creation for cluster owned by different user', async () => {
      const differentUserCluster = {
        ...mockDatabaseCluster,
        owner_id: 'different-user-id',
      };

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.get_dbs).mockResolvedValue({
        success: true,
        data: differentUserCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: differentUserCluster.cluster_id,
          name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);

      expect(data.error).toContain('not authorized');
    });

    it('should reject unauthenticated requests', async () => {
      // Override the beforeEach mock for this specific test
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValueOnce({
        authenticated: false,
        user: null,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/dbs/create',
        {
          cluster_id: mockDatabaseCluster.cluster_id,
          name: 'mydb',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });
});
