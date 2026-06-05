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

const appOpsMocks = vi.hoisted(() => {
  class MockAppOperationError extends Error {
    code: string;
    statusCode: number;
    retryable: boolean;

    constructor(params: {
      code: string;
      message: string;
      statusCode?: number;
      retryable?: boolean;
    }) {
      super(params.message);
      this.code = params.code;
      this.statusCode = params.statusCode ?? 500;
      this.retryable = params.retryable ?? false;
    }
  }

  return {
    resizeOperationMock: vi.fn(),
    jenkinsBuildTriggerMock: vi.fn(),
    MockAppOperationError,
  };
});

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/services/jenkins');
vi.mock('@/lib/services/build-polling');
vi.mock('@/lib/providers/github');
vi.mock('@/lib/services/runtime-env-reconciler');
vi.mock('@/lib/app-operations', () => {
  class MockAppRuntimeMutationService {
    resize = appOpsMocks.resizeOperationMock;
  }

  class MockJenkinsBuildAdapter {
    triggerBuild = appOpsMocks.jenkinsBuildTriggerMock;
    triggerResizeBuild = appOpsMocks.jenkinsBuildTriggerMock;
  }

  class MockAppOperationFinalizer {}

  function resolveBuildBackedOperationState(params: any) {
    if (typeof params.result.buildNumber === 'number') {
      return {
        kind: 'ready',
        buildNumber: params.result.buildNumber,
        reused: params.result.reused,
      };
    }

    if (params.result.operation?.status === 'building') {
      return {
        kind: 'pending',
        code: 'APP_OPERATION_IN_PROGRESS',
        message: `${params.actionLabel} is already in progress. Jenkins build number is not available yet.`,
        reused: params.result.reused,
      };
    }

    if (params.result.operation?.status === 'failed') {
      return {
        kind: 'failed',
        code: params.result.operation?.operation_details?.error?.code ?? 'APP_OPERATION_FAILED',
        message:
          params.result.operation?.failure_reason ??
          params.result.operation?.operation_details?.error?.message ??
          `${params.actionLabel} failed.`,
        reused: params.result.reused,
        retryable: false,
      };
    }

    return {
      kind: 'invalid',
      code: 'BUILD_NUMBER_UNAVAILABLE',
      message: `${params.actionLabel} completed without a Jenkins build number.`,
      reused: params.result.reused,
    };
  }

  return {
    AppRuntimeMutationService: MockAppRuntimeMutationService,
    JenkinsBuildAdapter: MockJenkinsBuildAdapter,
    AppOperationFinalizer: MockAppOperationFinalizer,
    AppOperationError: appOpsMocks.MockAppOperationError,
    resolveBuildBackedOperationState,
  };
});

describe('POST /api/services/platform-apps/resize', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    const { Platform_Apps } = await import('@/lib/supabase/queries');
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

    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.updateJobConfig).mockResolvedValue(undefined as any);
    appOpsMocks.jenkinsBuildTriggerMock.mockResolvedValue({
      buildNumber: 2,
      jobName: `${mockPlatformApp.name}-job`,
      url: `https://jenkins.example/job/${mockPlatformApp.name}-job/2/`,
    });

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

    appOpsMocks.resizeOperationMock.mockImplementation(async (params) => {
      if (params.appStatus === 'building') {
        throw new appOpsMocks.MockAppOperationError({
          code: 'APP_OPERATION_IN_PROGRESS',
          message: 'Build #2 is still in progress. Please wait for it to complete.',
          statusCode: 409,
          retryable: true,
        });
      }

      if (params.onBeforeTrigger) {
        await params.onBeforeTrigger();
      }

      try {
        const execution = await params.executor('op-1');
        if (params.onAfterTrigger) {
          await params.onAfterTrigger(execution.buildNumber);
        }
        return {
          operation: {
            id: 'op-1',
            build_number: execution.buildNumber,
            status: 'building',
          },
          buildNumber: execution.buildNumber,
          reused: false,
        };
      } catch (error) {
        if (params.onTriggerFailure) {
          await params.onTriggerFailure();
        }
        throw error;
      }
    });
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

  it('returns the stored failure for a reused resize request that failed before Jenkins returned a build number', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { BuildPollingService } = await import('@/lib/services/build-polling');

    appOpsMocks.resizeOperationMock.mockResolvedValueOnce({
      operation: {
        id: 'op-failed',
        build_number: null,
        status: 'failed',
        trigger: 'resize',
        failure_reason: 'Runtime secret sync failed',
        operation_details: {
          schema_version: 1,
          type: 'resize',
          trigger_origin: 'manual',
          steps: [],
          error: {
            code: 'RESIZE_TRIGGER_FAILED',
            message: 'Runtime secret sync failed',
            retryable: false,
          },
        },
      },
      buildNumber: null,
      reused: true,
    });

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 409);

    expect(data.code).toBe('RESIZE_TRIGGER_FAILED');
    expect(data.error).toBe('Runtime secret sync failed');
    expect(data.reused).toBe(true);
    expect(BuildPollingService.startPolling).not.toHaveBeenCalled();
  });

  it('blocks resize while another deployment is active', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    appOpsMocks.resizeOperationMock.mockRejectedValueOnce(
      new appOpsMocks.MockAppOperationError({
        code: 'APP_OPERATION_IN_PROGRESS',
        message: 'Build #2 is still in progress. Please wait for it to complete.',
        statusCode: 409,
        retryable: true,
      })
    );

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 409);

    expect(data.error).toContain('still in progress');
  });

  it('allows downsize requests', async () => {
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
    const data = await expectResponseStatus(response, 200);

    expect(data.message).toContain('Resize started');
    expect(appOpsMocks.resizeOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentSize: 'large',
        targetSize: 'small',
      })
    );
  });

  it('starts a resize build and creates the in-progress deployment row', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    const { BuildPollingService } = await import('@/lib/services/build-polling');

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.message).toContain('Resize started');
    expect(data.build_number).toBe(2);
    expect(Platform_Apps.update).not.toHaveBeenCalledWith(
      mockPlatformApp.id,
      expect.objectContaining({ size: 'medium' })
    );
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
    const { BuildPollingService } = await import('@/lib/services/build-polling');
    vi.mocked(BuildPollingService.startPolling).mockImplementation(() => {
      throw new Error('Tracking startup failed');
    });

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 200);

    expect(data.message).toContain('Resize started');
    expect(BuildPollingService.startPolling).toHaveBeenCalled();
  });

  it('reverts local app state if Jenkins never starts the build', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    appOpsMocks.jenkinsBuildTriggerMock.mockRejectedValue(new Error('Jenkins unavailable'));

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockPlatformApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toBe('Failed to resize app');
    expect(Platform_Apps.update).not.toHaveBeenCalledWith(
      mockPlatformApp.id,
      expect.objectContaining({
        size: 'small',
      })
    );
  });

  it('rejects resize for an app already marked building', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockBuildingApp,
        user_id: mockPlatformAppUser.id,
        size: 'small',
      },
    } as any);

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/resize',
      { app_id: mockBuildingApp.id, new_size: 'medium' }
    );

    const response = await POST(request as NextRequest);
    await expectResponseStatus(response, 409);
  });
});
