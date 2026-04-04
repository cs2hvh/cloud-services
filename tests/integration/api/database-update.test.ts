import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/services/database/update/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPutRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/notifications');
vi.mock('@/lib/audit');
vi.mock('@/lib/supabase/auth');

describe('PUT /api/services/database/update', () => {
  const testUrl = 'http://localhost:3000/api/services/database/update';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    const { getAuditContext } = await import('@/lib/audit');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      requestId: 'req-123',
    });

    const { AuditLogService } = await import('@/lib/audit');
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

    const { NotificationService } = await import('@/lib/notifications');
    vi.mocked(NotificationService.create).mockResolvedValue(undefined as any);

    const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
    vi.mocked(Database_Clusters.read).mockResolvedValue({
      success: true,
      data: {
        name: 'my-cluster',
        project_id: 'old-project',
        owner_id: '550e8400-e29b-41d4-a716-446655440000',
      },
    } as any);
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-DB-101: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      const response = await PUT(request as any);
      await expectResponseStatus(response, 401);
    });

    it('should return 403 when the cluster belongs to another user', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '00000000-0000-0000-0000-000000000999',
        },
      } as any);

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toContain('not authorized');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-DB-102: should return 400 when cluster_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, { project_id: 'project-1' });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('cluster_id');
    });

    it('TC-DB-103: should return 400 when project_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('project_id');
    });

    it('TC-DB-104: should return 400 when both fields are missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPutRequest(testUrl, {});
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('required');
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-DB-105: should update project assignment successfully', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: true,
        data: { cluster_id: 'cluster-1', project_id: 'new-project' },
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({ name: 'New Project' } as any);
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'new-project',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('updated successfully');
      expect(Database_Clusters.update_project).toHaveBeenCalledWith('cluster-1', 'new-project');
    });

    it('TC-DB-106: should add activity log for project assignment', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: true,
        data: {},
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({ name: 'New Project' } as any);
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'new-project',
      });
      await PUT(request as any);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'new-project',
          event: 'FolderKanban',
        })
      );
    });

    it('TC-DB-107: should create audit log entry', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: true,
        data: {},
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({ name: 'New Project' } as any);
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const { AuditLogService } = await import('@/lib/audit');

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'new-project',
      });
      await PUT(request as any);

      expect(AuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          service_type: 'database',
          service_id: 'cluster-1',
        })
      );
    });

    it('TC-DB-108: should create notification', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: true,
        data: {},
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({ name: 'New Project' } as any);
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const { NotificationService } = await import('@/lib/notifications');

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'new-project',
      });
      await PUT(request as any);

      expect(NotificationService.create).toHaveBeenCalled();
    });
  });

  // ============================================
  // Failure Cases
  // ============================================
  describe('Failure Cases', () => {
    it('TC-DB-109: should return 500 when update_project fails', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: false,
        error: 'DB write failed',
      } as any);

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('DB write failed');
    });

    it('TC-DB-110: should handle notification failure gracefully', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: true,
        data: {},
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({ name: 'Project' } as any);
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const { NotificationService } = await import('@/lib/notifications');
      vi.mocked(NotificationService.create).mockRejectedValue(new Error('Notification failed'));

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      const response = await PUT(request as any);
      // Should still succeed even if notification fails
      await expectResponseStatus(response, 200);
    });

    it('TC-DB-111: should return 500 on unexpected Error', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockRejectedValue(new Error('Connection lost'));

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('Connection lost');
    });

    it('TC-DB-112: should return 500 on non-Error throw', async () => {
      await mockAuthenticatedUser();

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockRejectedValue('string error');

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      const response = await PUT(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('string error');
    });
  });

  // ============================================
  // Admin Role Detection
  // ============================================
  describe('Admin Role', () => {
    it('TC-DB-113: should detect admin role in audit log', async () => {
      await mockAuthenticatedUser();

      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

      const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
      vi.mocked(Database_Clusters.read).mockResolvedValue({
        success: true,
        data: {
          name: 'my-cluster',
          project_id: 'old-project',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      } as any);
      vi.mocked(Database_Clusters.update_project).mockResolvedValue({
        success: true,
        data: {},
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.get_by_id).mockResolvedValue({ name: 'Project' } as any);
      vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);

      const { AuditLogService } = await import('@/lib/audit');

      const request = createMockPutRequest(testUrl, {
        cluster_id: 'cluster-1',
        project_id: 'project-1',
      });
      await PUT(request as any);

      expect(AuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_role: 'admin',
        })
      );
    });
  });
});
