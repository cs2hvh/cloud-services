import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/services/platform-apps/delete/route';
import {
  mockAdminUser,
  mockFailedApp,
  mockPlatformApp,
  mockPlatformAppUser,
} from '../../utils/mock-data-platform-apps';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/platform-app-service');
vi.mock('@/lib/services/app-status');

describe('POST /api/services/platform-apps/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockPlatformApp,
        user_id: mockPlatformAppUser.id,
      },
    } as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({ success: true } as any);
    vi.mocked(Platform_App_Deployments.get_operation_lock).mockResolvedValue({
      success: true,
      blocked: false,
      blocker: null,
      deployment: null,
      message: null,
    } as any);

    const { PlatformAppService } = await import('@/lib/services/platform-app-service');
    vi.mocked(PlatformAppService.deleteApp).mockResolvedValue(undefined as any);

    const { AppStatusService } = await import('@/lib/services/app-status');
    vi.mocked(AppStatusService.setStatus).mockResolvedValue(undefined as any);
  });

  it('requires authentication', async () => {
    await mockUnauthenticatedUser();

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 401);
  });

  it('deletes an app successfully for the owner', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.message).toBe('App deleted successfully');
  });

  it('allows an admin delete when the user is an admin', async () => {
    await mockAuthenticatedUser(mockAdminUser.id);
    const { requireAdmin } = await import('@/lib/supabase/auth');
    const { PlatformAppService } = await import('@/lib/services/platform-app-service');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id, is_admin: true }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 200);

    expect(PlatformAppService.deleteApp).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: mockPlatformApp.id,
        userId: mockAdminUser.id,
        isAdmin: true,
      })
    );
  });

  it('rejects a non-owner user', async () => {
    await mockAuthenticatedUser('different-user-id');

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 403);
  });

  it('blocks delete while a build is in progress', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.get_operation_lock).mockResolvedValue({
      success: true,
      blocked: true,
      blocker: 'building',
      deployment: { id: 'dep-1' },
      message: 'Cannot delete while building',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 409);

    expect(data.error).toContain('build is in progress');
  });

  it('blocks delete while the app is already deleting', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.get_operation_lock).mockResolvedValue({
      success: true,
      blocked: true,
      blocker: 'deleting',
      deployment: null,
      message: 'App is already being deleted.',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 409);

    expect(data.error).toContain('already being deleted');
  });

  it('restores running status if delete fails after marking deleting', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { PlatformAppService } = await import('@/lib/services/platform-app-service');
    const { AppStatusService } = await import('@/lib/services/app-status');
    vi.mocked(PlatformAppService.deleteApp).mockRejectedValue(new Error('Infrastructure cleanup failed'));

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 400);

    expect(data.error).toContain('Infrastructure cleanup failed');
    expect(AppStatusService.setStatus).toHaveBeenNthCalledWith(1, mockPlatformApp.id, 'deleting');
    expect(AppStatusService.setStatus).toHaveBeenNthCalledWith(2, mockPlatformApp.id, 'running');
  });

  it('restores failed status and failure reason if delete fails for a failed app', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    const { PlatformAppService } = await import('@/lib/services/platform-app-service');
    const { AppStatusService } = await import('@/lib/services/app-status');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockFailedApp,
        user_id: mockPlatformAppUser.id,
      },
    } as any);
    vi.mocked(PlatformAppService.deleteApp).mockRejectedValue(new Error('Delete failed'));

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/delete',
      { app_id: mockFailedApp.id }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 400);

    expect(AppStatusService.setStatus).toHaveBeenNthCalledWith(1, mockFailedApp.id, 'deleting');
    expect(AppStatusService.setStatus).toHaveBeenNthCalledWith(
      2,
      mockFailedApp.id,
      'failed',
      mockFailedApp.last_failure_reason
    );
  });
});
