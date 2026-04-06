import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/services/platform-apps/resize/route';
import {
  mockBuildingApp,
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
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/services/jenkins');
vi.mock('@/lib/services/build-polling');
vi.mock('@/lib/providers/github');
vi.mock('@/lib/services/runtime-env-reconciler');

describe('POST /api/services/platform-apps/resize', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockPlatformApp,
        user_id: mockPlatformAppUser.id,
        size: 'small',
      },
    } as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({
      success: true,
      data: { ...mockPlatformApp, size: 'medium', status: 'building' },
    } as any);
    vi.mocked(Platform_Apps.get_env_vars).mockResolvedValue([]);
    vi.mocked(Platform_App_Deployments.get_operation_lock).mockResolvedValue({
      success: true,
      blocked: false,
      blocker: null,
      deployment: null,
      message: null,
    } as any);
    vi.mocked(Platform_App_Deployments.start_build).mockResolvedValue({
      success: true,
      data: { id: 'dep-1' },
    } as any);

    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.updateJobConfig).mockResolvedValue(undefined as any);
    vi.mocked(JenkinsService.triggerBuild).mockResolvedValue(2);

    const { BuildPollingService } = await import('@/lib/services/build-polling');
    vi.mocked(BuildPollingService.startPolling).mockResolvedValue(undefined as any);

    const { GitHubProvider } = await import('@/lib/providers/github');
    vi.mocked(GitHubProvider).mockImplementation(
      function MockGitHubProvider(this: unknown) {
        return {
          getToken: vi.fn().mockResolvedValue({ accessToken: 'mock-token' }),
        } as any;
      } as any
    );

    const { reconcileRuntimeEnv } = await import('@/lib/services/runtime-env-reconciler');
    vi.mocked(reconcileRuntimeEnv).mockResolvedValue({
      status: 'success',
    } as any);
  });

  it('requires authentication', async () => {
    await mockUnauthenticatedUser();

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 401);
  });

  it('blocks resize while another deployment is active', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.get_operation_lock).mockResolvedValue({
      success: true,
      blocked: true,
      blocker: 'building',
      deployment: { id: 'dep-1' },
      message: 'Cannot resize while a deployment is in progress.',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 409);

    expect(data.error).toContain('deployment is in progress');
  });

  it('rejects downsize requests', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockPlatformApp,
        user_id: mockPlatformAppUser.id,
        size: 'large',
      },
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'small' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 400);

    expect(data.error).toContain('Invalid resize operation');
  });

  it('starts a resize build and creates the in-progress deployment row', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    const { BuildPollingService } = await import('@/lib/services/build-polling');

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.message).toContain('Resize started');
    expect(data.build_number).toBe(2);
    expect(Platform_App_Deployments.start_build).toHaveBeenCalledWith({
      app_id: mockPlatformApp.id,
      build_number: 2,
      trigger: 'resize',
    });
    expect(BuildPollingService.startPolling).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: mockPlatformApp.id,
        appName: mockPlatformApp.name,
        buildNumber: 2,
        trigger: 'resize',
        resizeContext: {
          previousSize: 'small',
          targetSize: 'medium',
        },
      })
    );
  });

  it('recovers gracefully if tracking fails after Jenkins already started the build', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    const { BuildPollingService } = await import('@/lib/services/build-polling');
    vi.mocked(Platform_App_Deployments.start_build).mockResolvedValue({
      success: false,
      error: 'Failed to create in-progress deployment record',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.warning).toContain('Failed to create in-progress deployment record');
    expect(BuildPollingService.startPolling).toHaveBeenCalled();
  });

  it('reverts local app state if Jenkins never starts the build', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { JenkinsService } = await import('@/lib/services/jenkins');
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(JenkinsService.triggerBuild).mockRejectedValue(new Error('Jenkins unavailable'));

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toContain('Jenkins unavailable');
    expect(Platform_Apps.update).toHaveBeenNthCalledWith(
      2,
      mockPlatformApp.id,
      expect.objectContaining({
        size: 'small',
        status: 'running',
      })
    );
  });

  it('rejects resize for an app already marked building', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockBuildingApp,
        user_id: mockPlatformAppUser.id,
        size: 'small',
      },
    } as any);
    vi.mocked(Platform_App_Deployments.get_operation_lock).mockResolvedValue({
      success: true,
      blocked: true,
      blocker: 'building',
      deployment: { id: 'dep-2' },
      message: 'Cannot resize while a deployment is in progress.',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockBuildingApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 409);
  });
});
