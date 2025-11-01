import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/read_all_owner/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster, mockCreatingCluster, mockProject } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');

describe('POST /api/services/database/read_all_owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  describe('Success Cases', () => {
    it('TC-DB-019: should list all clusters for authenticated user', async () => {
      const mockClusters = [mockDatabaseCluster, mockCreatingCluster];

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: mockClusters,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.clusters).toBeDefined();
      expect(Array.isArray(data.clusters)).toBe(true);
      expect(data.clusters.length).toBe(2);
      expect(data.clusters[0].id).toBe(mockDatabaseCluster.id);
    });

    it('TC-DB-022: should return empty array for user with no clusters', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.clusters).toBeDefined();
      expect(Array.isArray(data.clusters)).toBe(true);
      expect(data.clusters.length).toBe(0);
    });

    it('TC-DB-023: should calculate cluster stats correctly', async () => {
      const mockClusters = [
        mockDatabaseCluster,
        mockCreatingCluster,
        { ...mockDatabaseCluster, id: 'cluster-3' },
      ];

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: mockClusters,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.stats).toBeDefined();
      expect(data.stats.total_clusters).toBe(3);
    });
  });

  describe('Filtering Tests', () => {
    it('TC-DB-021: should filter clusters by project_id', async () => {
      const projectClusters = [
        { ...mockDatabaseCluster, project_id: mockProject.id },
        { ...mockCreatingCluster, project_id: mockProject.id },
      ];

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: projectClusters,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { project_id: mockProject.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.clusters).toBeDefined();
      expect(data.clusters.length).toBe(2);
      data.clusters.forEach((cluster: any) => {
        expect(cluster.project_id).toBe(mockProject.id);
      });
    });
  });

  describe('Pagination Tests', () => {
    it('TC-DB-020: should handle pagination parameters', async () => {
      const allClusters = Array.from({ length: 15 }, (_, i) => ({
        ...mockDatabaseCluster,
        id: `cluster-${i}`,
        name: `test-cluster-${i}`,
      }));

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: allClusters.slice(0, 10), // First page, 10 items
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { page: 1, limit: 10 }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.clusters.length).toBeLessThanOrEqual(10);
    });

    it('should handle page 2 of results', async () => {
      const allClusters = Array.from({ length: 15 }, (_, i) => ({
        ...mockDatabaseCluster,
        id: `cluster-${i + 10}`,
        name: `test-cluster-${i + 10}`,
      }));

      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: allClusters.slice(10, 15), // Second page, 5 items
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        { page: 2, limit: 10 }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.clusters.length).toBe(5);
    });
  });

  describe('Authentication Tests', () => {
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
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });
  });

  describe('Error Handling', () => {
    it('should handle database query errors gracefully', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle Supabase failure response', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: false,
        error: 'Failed to fetch clusters',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Data Structure Validation', () => {
    it('should return clusters with all required fields', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: [mockDatabaseCluster],
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      const cluster = data.clusters[0];
      expect(cluster.id).toBeDefined();
      expect(cluster.name).toBeDefined();
      expect(cluster.engine).toBeDefined();
      expect(cluster.status).toBeDefined();
      expect(cluster.region).toBeDefined();
    });

    it('should not expose sensitive password data', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries');
      vi.mocked(Database_Clusters.read_all_owner).mockResolvedValue({
        success: true,
        data: [mockDatabaseCluster],
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/read_all_owner',
        {}
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      const cluster = data.clusters[0];
      // Passwords should be encrypted objects, not plain strings
      if (cluster.public_connection?.password) {
        expect(typeof cluster.public_connection.password).toBe('object');
      }
    });
  });
});
