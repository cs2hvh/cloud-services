//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/update/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';
import { mockUser } from '../../utils/mock-data';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/audit');
vi.mock('@/lib/supabase/auth');

describe('POST /api/services/platform-apps/update', () => {
  const testUrl = 'http://localhost:3000/api/services/platform-apps/update';
  const validAppId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 });

    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    const { getAuditContext } = await import('@/lib/audit');
    vi.mocked(getAuditContext).mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      requestId: 'req-1',
    } as any);

    const { AuditLogService } = await import('@/lib/audit');
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue(undefined as any);
  });

  async function mockAppExists(overrides: any = {}) {
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        user_id: mockUser.id,
        name: 'my-app',
        project_id: 'project-1',
        ...overrides,
      },
    } as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({
      success: true,
      data: { name: 'my-app', ...overrides },
    } as any);
  }

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-PA-101: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'new-name',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-PA-102: should return 429 when rate limited', async () => {
      await mockAuthenticatedUser();

      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({ allowed: false, retryAfterSec: 30 });

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'new-name',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-PA-103: should return 400 when app_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, { name: 'new-name' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-PA-104: should return 400 when app_id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: 'not-uuid',
        name: 'new-name',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-PA-105: should return 400 for invalid framework', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        framework: 'invalid-framework',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-PA-106: should return 400 for invalid status', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        status: 'invalid-status',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Not Found
  // ============================================
  describe('Not Found', () => {
    it('TC-PA-107: should return 404 when app does not exist', async () => {
      await mockAuthenticatedUser();

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: false,
      } as any);

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'new-name',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('not found');
    });
  });

  // ============================================
  // Authorization
  // ============================================
  describe('Authorization', () => {
    it('TC-PA-108: should return 403 for non-owner', async () => {
      await mockAuthenticatedUser();
      await mockAppExists({ user_id: 'other-user-id' });

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'new-name',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-PA-109: should update app successfully', async () => {
      await mockAuthenticatedUser();
      await mockAppExists();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'updated-name',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 200);
    });

    it('TC-PA-110: should create audit log', async () => {
      await mockAuthenticatedUser();
      await mockAppExists();

      const { AuditLogService } = await import('@/lib/audit');

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'updated-name',
      });
      await POST(request as any);

      expect(AuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          service_type: 'platform_apps',
          service_id: validAppId,
        })
      );
    });

    it('TC-PA-111: should add project log when project_id exists', async () => {
      await mockAuthenticatedUser();
      await mockAppExists({ project_id: 'project-1' });

      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'updated-name',
      });
      await POST(request as any);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'project-1',
        })
      );
    });
  });

  // ============================================
  // Update Failure
  // ============================================
  describe('Update Failure', () => {
    it('TC-PA-112: should return 400 when update fails', async () => {
      await mockAuthenticatedUser();

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: { user_id: mockUser.id, name: 'my-app' },
      } as any);
      vi.mocked(Platform_Apps.update).mockResolvedValue({
        success: false,
        error: 'DB write failed',
      } as any);

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'new-name',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('DB write failed');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-PA-113: should return 400 on unexpected error', async () => {
      await mockAuthenticatedUser();

      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockRejectedValue(new Error('Redis down'));

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        name: 'new-name',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Redis down');
    });
  });
});
