import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/delete_node/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/audit');
vi.mock('@/lib/audit/context');

describe('POST /api/services/kubernetes/clusters/delete_node', () => {
  const testUrl = 'http://localhost:3000/api/services/kubernetes/clusters/delete_node';

  let mockSupabase: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: vi.fn().mockReturnThis(),
    };

    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);

    const { getAuditContext } = await import('@/lib/audit/context');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      requestId: 'req-123',
    } as any);

    const { AuditLogService } = await import('@/lib/audit');
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-K8S-101: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-K8S-102: should delete node successfully', async () => {
      await mockAuthenticatedUser();

      // First call: select cluster
      const selectSingle = vi.fn().mockResolvedValue({
        data: {
          workers: [
            { droplet_id: 'droplet-1' },
            { droplet_id: 'droplet-2' },
          ],
          cluster_name: 'test-cluster',
          project_id: 'project-1',
        },
        error: null,
      });

      // Second call: update
      const updateSingle = vi.fn().mockResolvedValue({
        data: {},
        error: null,
      });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: selectSingle,
              }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: updateSingle,
            }),
          }),
        };
      });

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('deleted successfully');
    });

    it('TC-K8S-103: should filter out the correct droplet', async () => {
      await mockAuthenticatedUser();

      let capturedUpdate: any = null;

      const selectSingle = vi.fn().mockResolvedValue({
        data: {
          workers: [
            { droplet_id: '111' },
            { droplet_id: '222' },
            { droplet_id: '333' },
          ],
          cluster_name: 'test-cluster',
          project_id: null,
        },
        error: null,
      });

      const mockUpdate = vi.fn().mockImplementation((val) => {
        capturedUpdate = val;
        return {
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        };
      });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: selectSingle,
              }),
            }),
          };
        }
        return { update: mockUpdate };
      });

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: '222',
      });
      await POST(request as any);

      expect(capturedUpdate.workers).toHaveLength(2);
      expect(capturedUpdate.workers.map((w: any) => w.droplet_id)).toEqual(['111', '333']);
    });

    it('TC-K8S-104: should add activity log when project_id exists', async () => {
      await mockAuthenticatedUser();

      const selectSingle = vi.fn().mockResolvedValue({
        data: {
          workers: [{ droplet_id: 'droplet-1' }],
          cluster_name: 'test-cluster',
          project_id: 'project-1',
        },
        error: null,
      });

      const updateSingle = vi.fn().mockResolvedValue({ data: {}, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: selectSingle }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: updateSingle }),
          }),
        };
      });

      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      await POST(request as any);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'project-1',
          event: 'Server',
        })
      );
    });

    it('TC-K8S-105: should create audit log', async () => {
      await mockAuthenticatedUser();

      const selectSingle = vi.fn().mockResolvedValue({
        data: {
          workers: [{ droplet_id: 'droplet-1' }],
          cluster_name: 'test-cluster',
          project_id: null,
        },
        error: null,
      });

      const updateSingle = vi.fn().mockResolvedValue({ data: {}, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: selectSingle }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: updateSingle }),
          }),
        };
      });

      const { AuditLogService } = await import('@/lib/audit');

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      await POST(request as any);

      expect(AuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          service_type: 'kubernetes',
          service_id: 'cluster-1',
        })
      );
    });
  });

  // ============================================
  // Cluster Not Found / Error Cases
  // ============================================
  describe('Error Cases', () => {
    it('TC-K8S-106: should return 400 when cluster not found', async () => {
      await mockAuthenticatedUser();

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Row not found' },
            }),
          }),
        }),
      });

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'nonexistent',
        droplet_id: 'droplet-1',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Row not found');
    });

    it('TC-K8S-107: should return 400 when update fails', async () => {
      await mockAuthenticatedUser();

      const selectSingle = vi.fn().mockResolvedValue({
        data: {
          workers: [{ droplet_id: 'droplet-1' }],
          cluster_name: 'test-cluster',
          project_id: null,
        },
        error: null,
      });

      const updateSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: selectSingle }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: updateSingle }),
          }),
        };
      });

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Update failed');
    });

    it('TC-K8S-108: should return 400 on unexpected Error', async () => {
      await mockAuthenticatedUser();

      mockSupabase.from.mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('DB connection lost');
    });

    it('TC-K8S-109: should return 400 on non-Error throw', async () => {
      await mockAuthenticatedUser();

      mockSupabase.from.mockImplementation(() => {
        throw 'string error';
      });

      const request = createMockPostRequest(testUrl, {
        cluster_id: 'cluster-1',
        droplet_id: 'droplet-1',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Unknown error');
    });
  });
});
