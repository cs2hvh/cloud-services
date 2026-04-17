import { beforeEach, describe, expect, it, vi } from 'vitest';

const appOpsMocks = vi.hoisted(() => ({
  startReleaseBuildMock: vi.fn(),
  resolveBuildBackedOperationStateMock: vi.fn(),
  startPollingMock: vi.fn(),
  logAppImagesMock: vi.fn(),
}));

vi.mock('@/lib/services/jenkins', () => ({
  JenkinsService: {
    updateJobConfig: vi.fn(),
  },
}));
vi.mock('@/lib/services/build-polling', () => ({
  BuildPollingService: {
    startPolling: appOpsMocks.startPollingMock,
  },
}));
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/providers/github');
vi.mock('@/lib/providers/gitlab/token-manager', () => ({
  gitlabTokenManager: {
    getToken: vi.fn(),
  },
}));
vi.mock('@/lib/providers/bitbucket/token-manager', () => ({
  bitbucketTokenManager: {
    getToken: vi.fn(),
  },
}));
vi.mock('@/lib/services/kubernetes-info', () => ({
  KubernetesInfoService: {
    logAppImages: appOpsMocks.logAppImagesMock,
  },
}));
vi.mock('@/lib/services/runtime-env-reconciler');
vi.mock('@/lib/app-operations', () => {
  class MockAppReleaseBuildService {
    startReleaseBuild = appOpsMocks.startReleaseBuildMock;
  }

  class MockJenkinsBuildAdapter {}
  class MockAppOperationFinalizer {}

  return {
    AppReleaseBuildService: MockAppReleaseBuildService,
    JenkinsBuildAdapter: MockJenkinsBuildAdapter,
    AppOperationFinalizer: MockAppOperationFinalizer,
    resolveBuildBackedOperationState: appOpsMocks.resolveBuildBackedOperationStateMock,
  };
});

describe('AutoDeployService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get_env_vars).mockResolvedValue([]);
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: { status: 'running' },
    } as never);

    const { GitHubProvider } = await import('@/lib/providers/github');
    vi.mocked(GitHubProvider).mockImplementation(
      function MockGitHubProvider(this: unknown) {
        return {
          getToken: vi.fn().mockResolvedValue({ accessToken: 'mock-token' }),
        } as never;
      } as never
    );

    appOpsMocks.startPollingMock.mockResolvedValue(undefined as never);
    appOpsMocks.logAppImagesMock.mockResolvedValue(undefined as never);
  });

  it('returns failure when a duplicate webhook delivery reuses a failed operation', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');

    appOpsMocks.startReleaseBuildMock.mockResolvedValue({
      operation: {
        id: 'op-failed',
        build_number: null,
        status: 'failed',
      },
      buildNumber: null,
      reused: true,
    });
    appOpsMocks.resolveBuildBackedOperationStateMock.mockReturnValue({
      kind: 'failed',
      code: 'EXECUTOR_TRIGGER_FAILED',
      message: 'Secret sync failed',
      reused: true,
      retryable: false,
    });

    const result = await AutoDeployService.deploy({
      appId: 'app-1',
      appName: 'my-app',
      userId: 'user-1',
      gitProvider: 'github',
      repositoryUrl: 'https://github.com/acme/repo.git',
      branch: 'main',
      framework: 'nextjs',
      commitSha: 'abcdef123456',
      deliveryId: 'delivery-1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Secret sync failed',
    });
  });

  it('skips duplicate webhook delivery while the original deployment is still being processed', async () => {
    const { AutoDeployService } = await import('@/lib/services/auto-deploy');
    appOpsMocks.startReleaseBuildMock.mockResolvedValue({
      operation: {
        id: 'op-pending',
        build_number: null,
        status: 'building',
      },
      buildNumber: null,
      reused: true,
    });
    appOpsMocks.resolveBuildBackedOperationStateMock.mockReturnValue({
      kind: 'pending',
      code: 'APP_OPERATION_IN_PROGRESS',
      message: 'Auto-deploy is already in progress.',
      reused: true,
    });

    const result = await AutoDeployService.deploy({
      appId: 'app-1',
      appName: 'my-app',
      userId: 'user-1',
      gitProvider: 'github',
      repositoryUrl: 'https://github.com/acme/repo.git',
      branch: 'main',
      framework: 'nextjs',
      commitSha: 'abcdef123456',
      deliveryId: 'delivery-1',
    });

    expect(result).toEqual({
      success: true,
      skipped: true,
      skipReason: 'Duplicate webhook delivery already being processed',
    });
    expect(appOpsMocks.startPollingMock).not.toHaveBeenCalled();
  });
});
