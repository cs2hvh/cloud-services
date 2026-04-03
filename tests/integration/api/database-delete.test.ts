import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/database/delete/route';
import { NextRequest } from 'next/server';
import { mockDatabaseCluster } from '../../utils/mock-data';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';

// Mock dependencies - use exact paths as imported in the route
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('@/lib/services/database-integration');
vi.mock('@/lib/services/jenkins');
vi.mock('@/lib/jenkins');
vi.mock('jenkins');
vi.mock('axios');

describe('POST /api/services/database/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();

    // Mock DatabaseIntegrationService - allow deletion by default
    const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
    vi.mocked(DatabaseIntegrationService.canDeleteDatabase).mockResolvedValue({
      canDelete: true,
      linkedApps: 0,
      linkedAppNames: [],
    });

    // Mock Billing close
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.close_active_service).mockResolvedValue({ charged: 0, newBalance: 100 });

    // Mock Projects.add_log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue(true);
  });

  describe('Success Cases', () => {
    it('TC-DB-024: should delete cluster with valid authentication', async () => {
      // Mock Supabase read to get cluster details
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock mark_as_deleted
      vi.mocked(Database_Clusters.mark_as_deleted).mockResolvedValue({
        success: true,
        cluster: [mockDatabaseCluster],
      });

      // Mock DigitalOcean delete API
      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 200);

      expect(data.message).toContain('deleted successfully');
      expect(axios.default.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/databases/${mockDatabaseCluster.cluster_id}`),
        expect.any(Object)
      );
    });

    it('should sync deletion between DigitalOcean and Supabase', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const markDeletedMock = vi.fn().mockResolvedValue({ success: true, cluster: [mockDatabaseCluster] });
      vi.mocked(Database_Clusters.mark_as_deleted).mockImplementation(markDeletedMock);

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 204,
        data: {},
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      await POST(request as NextRequest);

      // Verify both systems were called
      expect(axios.default.delete).toHaveBeenCalled();
      expect(markDeletedMock).toHaveBeenCalledWith(mockDatabaseCluster.cluster_id);
    });

    it('should close billing on deletion', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });
      vi.mocked(Database_Clusters.mark_as_deleted).mockResolvedValue({ success: true, cluster: [mockDatabaseCluster] });

      const { Billing } = await import('@/lib/supabase/queries/billing');

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204, data: {} });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(Billing.close_active_service).toHaveBeenCalledWith(
        'database',
        expect.objectContaining({
          serviceId: mockDatabaseCluster.id,
        })
      );
    });
  });

  describe('Integration Checks', () => {
    it('should return 409 when database has active integrations', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      // Mock active integrations
      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.canDeleteDatabase).mockResolvedValue({
        canDelete: false,
        linkedApps: 2,
        linkedAppNames: ['app1', 'app2'],
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 409);

      expect(data.code).toBe('DATABASE_HAS_ACTIVE_LINKS');
      expect(data.linked_apps_count).toBe(2);
    });

    it('should force delete and unlink apps when force=true', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });
      vi.mocked(Database_Clusters.mark_as_deleted).mockResolvedValue({ success: true, cluster: [mockDatabaseCluster] });

      const { DatabaseIntegrationService } = await import('@/lib/services/database-integration');
      vi.mocked(DatabaseIntegrationService.canDeleteDatabase).mockResolvedValue({
        canDelete: false,
        linkedApps: 2,
        linkedAppNames: ['app1', 'app2'],
      });
      vi.mocked(DatabaseIntegrationService.unlinkAllFromDatabase).mockResolvedValue({
        success: true,
        unlinked_count: 2,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204, data: {} });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id, force: true }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 200);

      expect(DatabaseIntegrationService.unlinkAllFromDatabase).toHaveBeenCalled();
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
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response!, 401);
    });

    it('should reject deleting a cluster owned by another user', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          ...mockDatabaseCluster,
          owner_id: '00000000-0000-0000-0000-000000000999',
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 403);
      expect(data.error).toContain('not authorized');
    });
  });

  describe('Error Cases', () => {
    it('should handle DigitalOcean API errors', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockRejectedValue(
        new Error('DigitalOcean API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });

    it('should handle Supabase mark_as_deleted failure', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });

      vi.mocked(Database_Clusters.mark_as_deleted).mockResolvedValue({
        success: false,
        error: 'Database mark_as_deleted failed',
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204, data: {} });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response!, 500);

      expect(data.error).toBeDefined();
    });
  });

  describe('Activity Log', () => {
    it('should add activity log on successful deletion', async () => {
      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: mockDatabaseCluster,
      });
      vi.mocked(Database_Clusters.mark_as_deleted).mockResolvedValue({ success: true, cluster: [mockDatabaseCluster] });

      const { Projects } = await import('@/lib/supabase/queries/projects');

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({ status: 204, data: {} });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/database/delete',
        { id: mockDatabaseCluster.cluster_id }
      );

      await POST(request as NextRequest);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: mockDatabaseCluster.project_id,
          event: 'Trash2',
        })
      );
    });
  });
});
