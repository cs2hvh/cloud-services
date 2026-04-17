import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/services/platform-apps/recover-build/route';
import { createMockPostRequest, expectResponseStatus, mockAuthenticatedUser } from '../../utils/test-helpers';
import { mockPlatformApp, mockPlatformAppUser } from '../../utils/mock-data-platform-apps';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/jenkins');
vi.mock('@/lib/services/build-polling', () => ({
  BuildPollingService: {
    BUILD_FINALIZATION_GRACE_MS: 75_000,
    recoverBuild: vi.fn(),
  },
}));

describe('POST /api/services/platform-apps/recover-build', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockPlatformApp,
        user_id: mockPlatformAppUser.id,
        size: 'medium',
      },
    } as any);
    vi.mocked(Platform_App_Deployments.get_in_progress_by_app).mockResolvedValue({
      success: true,
      data: {
        id: 'dep-1',
        app_id: mockPlatformApp.id,
        build_number: 42,
        trigger: 'resize',
        status: 'building',
        created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      },
    } as any);

    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.getBuildInfo).mockResolvedValue({
      number: 42,
      building: false,
      result: 'SUCCESS',
      duration: 120_000,
      timestamp: Date.now() - 50 * 60 * 1000,
      url: 'https://jenkins.example/build/42',
    } as any);

    const { BuildPollingService } = await import('@/lib/services/build-polling');
    vi.mocked(BuildPollingService.recoverBuild).mockResolvedValue({
      success: true,
      recovered: true,
      status: 'success',
    } as any);
  });

  it('returns no-op when no in-progress deployment exists', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_App_Deployments.get_in_progress_by_app).mockResolvedValue({
      success: true,
      data: null,
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/recover-build',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.recovered).toBe(false);
    expect(data.message).toContain('No in-progress build');
  });

  it('does not recover while Jenkins still reports building', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.getBuildInfo).mockResolvedValue({
      number: 42,
      building: true,
      result: null,
      duration: 0,
      timestamp: Date.now(),
      url: 'https://jenkins.example/build/42',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/recover-build',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.recovered).toBe(false);
    expect(data.still_building).toBe(true);
  });

  it('waits during the normal finalization grace window', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.getBuildInfo).mockResolvedValue({
      number: 42,
      building: false,
      result: 'SUCCESS',
      duration: 60_000,
      timestamp: Date.now() - 65_000,
      url: 'https://jenkins.example/build/42',
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/recover-build',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.recovered).toBe(false);
    expect(data.message).toContain('finished recently');
  });

  it('delegates stale recovery to BuildPollingService', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { BuildPollingService } = await import('@/lib/services/build-polling');

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/recover-build',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.recovered).toBe(true);
    expect(data.status).toBe('success');
    expect(BuildPollingService.recoverBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: mockPlatformApp.id,
        appName: mockPlatformApp.name,
        buildNumber: 42,
        trigger: 'resize',
        desiredSize: 'medium',
      })
    );
  });
});
