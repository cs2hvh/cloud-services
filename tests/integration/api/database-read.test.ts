import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/read/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster, mockUser } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');

describe('POST /api/services/database/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  describe('Success Cases', () => {
    it('TC-DB-015: should read cluster by ID with valid authentication', async () => {
      // Mock Supabase query
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.cluster).toBeDefined();
      expect(data.cluster.id).toBe(mockDatabaseCluster.id);
      expect(data.cluster.name).toBe(mockDatabaseCluster.name);
    });

    it('TC-DB-018: should verify returned data structure includes all required fields', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Verify connection details
      expect(data.cluster.public_connection).toBeDefined();
      expect(data.cluster.public_connection.host).toBeDefined();
      expect(data.cluster.public_connection.port).toBeDefined();

      // Verify users list included
      expect(data.cluster.users).toBeDefined();
      expect(Array.isArray(data.cluster.users)).toBe(true);

      // Verify databases list included
      expect(data.cluster.dbs).toBeDefined();
      expect(Array.isArray(data.cluster.dbs)).toBe(true);
    });
  });

  describe('Authorization Tests', () => {
    it('TC-DB-016: should return 403 when reading cluster belonging to different user', async () => {
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
        'http://localhost:3000/api/services/database/read',
        { id: differentUserCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);

      expect(data.error).toContain('not authorized');
    });

    it('should reject unauthenticated requests', async () => {
      // Mock unauthenticated user
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
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Error Cases', () => {
    it('TC-DB-017: should return 404 for non-existent cluster', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: false,
        error: 'Cluster not found',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: 'non-existent-id' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 404);

      expect(data.error).toBeDefined();
    });

    it('should return 400 for missing cluster ID', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should return 400 for invalid cluster ID format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 400);
    });

    it('should handle database query errors gracefully', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Password Security', () => {
    it('should not expose plain text passwords in response', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read',
        { id: mockDatabaseCluster.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      // Check that passwords are encrypted or undefined
      if (data.cluster.public_connection?.password) {
        expect(typeof data.cluster.public_connection.password).toBe('object');
        expect(data.cluster.public_connection.password).toHaveProperty('encrypted');
      }
    });
  });
});
