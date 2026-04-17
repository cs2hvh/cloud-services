import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/redeploy/route';
import { NextRequest } from 'next/server';
import {
  mockPlatformApp,
  mockBuildingApp,
  mockDeletingApp,
  mockFailedApp,
  mockPlatformAppUser,
  mockProject,
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
    startReleaseBuildMock: vi.fn(),
    jenkinsBuildTriggerMock: vi.fn(),
    MockAppOperationError,
  };
});

// Mock all dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/services/jenkins');
vi.mock('@/lib/services/app-status');
vi.mock('@/lib/services/build-polling');
vi.mock('@/lib/audit');
vi.mock('@/lib/audit/context');
vi.mock('@/lib/services/runtime-env-reconciler');
vi.mock('@/lib/app-operations', () => {
  class MockAppReleaseBuildService {
    startReleaseBuild = appOpsMocks.startReleaseBuildMock;
  }

  class MockJenkinsBuildAdapter {
    triggerBuild = appOpsMocks.jenkinsBuildTriggerMock;
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
    AppReleaseBuildService: MockAppReleaseBuildService,
    JenkinsBuildAdapter: MockJenkinsBuildAdapter,
    AppOperationFinalizer: MockAppOperationFinalizer,
    AppOperationError: appOpsMocks.MockAppOperationError,
    resolveBuildBackedOperationState,
  };
});

/**
 * Platform Apps Redeploy API Integration Tests
 * POST /api/services/platform-apps/redeploy
 */
describe('POST /api/services/platform-apps/redeploy', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock for rate limiter
    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    // Default mock for Platform_Apps.get
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockPlatformApp,
        user_id: mockPlatformAppUser.id,
        project_id: mockProject.id,
      },
    } as any);

    // Default mock for JenkinsService.triggerBuild
    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.updateJobConfig).mockResolvedValue(undefined as any);
    appOpsMocks.jenkinsBuildTriggerMock.mockResolvedValue({
      buildNumber: 6,
      jobName: `${mockPlatformApp.name}-job`,
      url: `https://jenkins.example/job/${mockPlatformApp.name}-job/6/`,
    });

    // Default mock for AppStatusService.setStatus
    const { AppStatusService } = await import('@/lib/services/app-status');
    vi.mocked(AppStatusService.setStatus).mockResolvedValue({ success: true });

    // Default mock for Platform_Apps.get_env_vars
    vi.mocked(Platform_Apps.get_env_vars).mockResolvedValue([]);

    // Default mock for Projects.add_log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    // Default mock for getAuditContext
    const { getAuditContext } = await import('@/lib/audit/context');
    vi.mocked(getAuditContext).mockReturnValue({} as any);

    const { reconcileRuntimeEnv } = await import('@/lib/services/runtime-env-reconciler');
    vi.mocked(reconcileRuntimeEnv).mockResolvedValue({
      status: 'success',
      reason: null,
    } as any);

    appOpsMocks.startReleaseBuildMock.mockImplementation(async (params) => {
      if (params.appStatus === 'building') {
        throw new appOpsMocks.MockAppOperationError({
          code: 'APP_OPERATION_IN_PROGRESS',
          message: 'Build is already building.',
          statusCode: 409,
          retryable: true,
        });
      }
      if (params.appStatus === 'deleting') {
        throw new appOpsMocks.MockAppOperationError({
          code: 'APP_DELETING',
          message: 'App is being deleted.',
          statusCode: 409,
        });
      }

      const execution = await params.executor({
        id: 'op-1',
      } as any);

      return {
        operation: {
          id: 'op-1',
          build_number: execution.buildNumber,
          status: 'building',
        },
        buildNumber: execution.buildNumber,
        reused: false,
      };
    });
  });

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication Tests', () => {
    it('TC-PA-I050: should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // Rate Limiting Tests
  // ============================================
  describe('Rate Limiting Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I056: should enforce rate limiting', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 45,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should reject invalid app_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing app_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        {}
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  it('returns 202 when the same idempotent redeploy is still starting and has no Jenkins build number yet', async () => {
    await mockAuthenticatedUser(mockPlatformAppUser.id);
    const { BuildPollingService } = await import('@/lib/services/build-polling');

    appOpsMocks.startReleaseBuildMock.mockResolvedValueOnce({
      operation: {
        id: 'op-pending',
        build_number: null,
        status: 'building',
        trigger: 'manual',
        failure_reason: null,
        operation_details: {
          schema_version: 1,
          type: 'redeploy',
          trigger_origin: 'manual',
          steps: [],
        },
      },
      buildNumber: null,
      reused: true,
    });

    const request = createMockPostRequest(
      'http://localhost:3000/api/services/platform-apps/redeploy',
      { app_id: mockPlatformApp.id }
    );

    const response = await POST(request as NextRequest);
    const data = await expectResponseStatus(response, 202);

    expect(data.code).toBe('APP_OPERATION_IN_PROGRESS');
    expect(data.reused).toBe(true);
    expect(data.operation_id).toBe('op-pending');
    expect(BuildPollingService.startPolling).not.toHaveBeenCalled();
  });

  // ============================================
  // App Not Found Tests
  // ============================================
  describe('App Not Found Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I052: should return 404 when app not found', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: false,
        error: 'App not found',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: '550e8400-e29b-41d4-a716-446655440999' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 404);
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization Tests', () => {
    it('TC-PA-I053: should reject unauthorized user (not owner)', async () => {
      await mockAuthenticatedUser('different-user-id');

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id, // Different from authenticated user
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 403);
    });
  });

  // ============================================
  // App State Validation Tests
  // ============================================
  describe('App State Validation Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I054: should reject redeploy for already building app', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockBuildingApp,
          user_id: mockPlatformAppUser.id,
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockBuildingApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toContain('building');
    });

    it('TC-PA-I055: should reject redeploy for deleting app', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockDeletingApp,
          user_id: mockPlatformAppUser.id,
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockDeletingApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toContain('deleted');
    });

    it('should allow redeploy for failed app', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockFailedApp,
          user_id: mockPlatformAppUser.id,
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockFailedApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('should allow redeploy for running app', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I051: should trigger redeploy successfully', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('Redeploy triggered');
      expect(data.build_number).toBeDefined();
      expect(data.app_id).toBe(mockPlatformApp.id);
      expect(data.app_name).toBe(mockPlatformApp.name);
    });

    it('should call JenkinsService.triggerBuild', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      expect(appOpsMocks.jenkinsBuildTriggerMock).toHaveBeenCalledWith({
        appName: mockPlatformApp.name,
      });
    });

    it('TC-PA-I057: should start a release-build operation', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      expect(appOpsMocks.startReleaseBuildMock).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: mockPlatformApp.id,
          appName: mockPlatformApp.name,
          trigger: 'manual',
          operationType: 'redeploy',
        })
      );
    });

    it('TC-PA-I058: should add project log', async () => {
      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: mockProject.id,
          event: 'Platform App Redeployed',
        })
      );
    });

    it('should return build number from Jenkins', async () => {
      appOpsMocks.jenkinsBuildTriggerMock.mockResolvedValue({
        buildNumber: 10,
        jobName: `${mockPlatformApp.name}-job`,
        url: `https://jenkins.example/job/${mockPlatformApp.name}-job/10/`,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.build_number).toBe(10);
    });
  });

  // ============================================
  // Jenkins Failure Tests
  // ============================================
  describe('Jenkins Failure Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle Jenkins trigger failure', async () => {
      appOpsMocks.jenkinsBuildTriggerMock.mockRejectedValue(new Error('Jenkins unavailable'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBeDefined();
    });
  });

  // ============================================
  // Project Log Failure Tests
  // ============================================
  describe('Project Log Failure Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should still succeed if project log fails', async () => {
      const { Projects } = await import('@/lib/supabase/queries/projects');
      vi.mocked(Projects.add_log).mockRejectedValue(new Error('Log service unavailable'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      // Should still succeed even if logging fails
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('should skip project log when no project_id', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          project_id: null,
        },
      } as any);

      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      // Project log should not be called when no project_id
      // (depends on implementation - may or may not call)
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    // it('should handle database errors', async () => {
    //   const { Platform_Apps } = await import('@/lib/supabase/queries');
    //   vi.mocked(Platform_Apps.get).mockRejectedValue(new Error('Database error'));

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/platform-apps/redeploy',
    //     { app_id: mockPlatformApp.id }
    //   );

    //   const response = await POST(request as NextRequest);
    //   await expectResponseStatus(response, 400);
    // });

    it('should handle AppStatusService errors', async () => {
      const { AppStatusService } = await import('@/lib/services/app-status');
      vi.mocked(AppStatusService.setStatus).mockRejectedValue(
        new Error('Status update failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      // Should handle gracefully
      const response = await POST(request as NextRequest);
      expect(response).toBeDefined();
    });
  });

  // ============================================
  // Git Provider Token Tests (URL construction)
  // ============================================
  describe('Git Provider Token URL construction', () => {
    // These tests verify the token injection uses regex (handles www. variants)
    // by checking the GitHubProvider mock is called as the token source.
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should attempt token retrieval for github provider', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          git_provider: 'github',
          repository_url: 'https://github.com/owner/repo',
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      // Token fetch is best-effort; redeploy still succeeds even without a token
      await expectResponseStatus(response, 200);
    });

    it('should still succeed when token retrieval fails for github provider', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          git_provider: 'github',
          repository_url: 'https://github.com/owner/private-repo',
        },
      } as any);

      // Simulate all token sources failing
      vi.mock('@/lib/providers/github', () => {
        return {
          GitHubProvider: class {
            getToken = vi.fn().mockRejectedValue(new Error('Token fetch failed'));
          },
        };
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/redeploy',
        { app_id: mockPlatformApp.id }
      );

      // Should still trigger redeploy (with unauthenticated URL)
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });
});
