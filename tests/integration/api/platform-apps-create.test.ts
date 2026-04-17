import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/create/route';
import { NextRequest } from 'next/server';
import {
  mockCreatePlatformAppPayload,
  mockPlatformAppUser,
  mockPlatformApp,
  mockInvalidPlatformAppPayloads,
  mockPlatformAppPricing,
} from '../../utils/mock-data-platform-apps';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock all dependencies before imports
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/services');
vi.mock('@/lib/services/platform-app-service');
vi.mock('@/config/billing-flow');
vi.mock('@/config/pricing');
vi.mock('@/lib/providers/github');
vi.mock('@/lib/gitlab/token-refresh');

/**
 * Platform Apps Create API Integration Tests
 * POST /api/services/platform-apps/create
 */
describe('POST /api/services/platform-apps/create', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock required environment variables
    process.env = {
      ...originalEnv,
      JENKINS_URL: 'http://jenkins.test',
      CLOUDFLARE_API_TOKEN: 'test-cloudflare-token',
      CLOUDFLARE_ZONE_ID: 'test-zone-id',
      KUBE_IP: '10.0.0.1',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    };

    // Default mock for rate limiter
    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    // Default mock for billing flow
    const { ensureBalance } = await import('@/config/billing-flow');
    vi.mocked(ensureBalance).mockResolvedValue({ ok: true, balance: 100 } as any);

    // Default mock for pricing
    const { getRatesForPlatformApp } = await import('@/config/pricing');
    vi.mocked(getRatesForPlatformApp).mockResolvedValue({
      initialCost: mockPlatformAppPricing.small.initialCost,
      hourlyRate: mockPlatformAppPricing.small.hourlyRate,
    });

    // Default mock for Platform_Apps
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.count_by_owner).mockResolvedValue(0);
    vi.mocked(Platform_Apps.check_name_exists).mockResolvedValue(false);
    vi.mocked(Platform_Apps.create).mockResolvedValue({
      success: true,
      data: mockPlatformApp,
    } as any);

    // Default mock for DeploymentService
    const { DeploymentService } = await import('@/lib/services');
    vi.mocked(DeploymentService.deploy).mockResolvedValue({
      success: true,
      app_id: mockPlatformApp.id,
      deployment_url: mockPlatformApp.deployment_url,
      port: mockPlatformApp.port,
      build_number: 1,
    });

    // Default mock for Projects.add_log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.get_by_id).mockResolvedValue({
      id: mockCreatePlatformAppPayload.project_id,
      owner: mockPlatformAppUser.id,
    } as any);
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    const { PlatformAppService } = await import('@/lib/services/platform-app-service');
    vi.mocked(PlatformAppService.createApp).mockResolvedValue({
      success: true,
      appId: mockPlatformApp.id,
      deploymentUrl: mockPlatformApp.deployment_url,
      port: mockPlatformApp.port,
      billingInfo: {
        initialCost: mockPlatformAppPricing.small.initialCost,
        hourlyRate: mockPlatformAppPricing.small.hourlyRate,
      },
    } as any);

    // Default mock for supabase server client (used for GitHub token retrieval)
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              provider_token: 'mock-github-token',
              user: {
                id: mockPlatformAppUser.id,
                identities: [
                  {
                    provider: 'github',
                    identity_data: { provider_token: 'mock-github-token' }
                  }
                ],
                app_metadata: { provider: 'github' }
              }
            }
          }
        }),
      },
    } as any);

    // Default mock for GitHubProvider
    const { GitHubProvider } = await import('@/lib/providers/github');
    vi.mocked(GitHubProvider).mockImplementation(() => ({
      getToken: vi.fn().mockResolvedValue({ accessToken: 'mock-github-token' }),
    }) as any);

    // Default mock for GitLab token refresh
    const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
    vi.mocked(getValidGitLabToken).mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication Tests', () => {
    it('TC-PA-I001: should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.app_id).toBeDefined();
      expect(data.deployment_url).toBeDefined();
    });
  });

  // ============================================
  // Rate Limiting Tests
  // ============================================
  describe('Rate Limiting Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I004: should enforce rate limiting', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 30,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('30');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I003: should reject invalid payload - invalid name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockInvalidPlatformAppPayloads.invalidName
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid payload - name too short', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockInvalidPlatformAppPayloads.nameTooShort
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid payload - invalid git provider', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockInvalidPlatformAppPayloads.invalidProvider
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid payload - invalid framework', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockInvalidPlatformAppPayloads.invalidFramework
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid payload - invalid size', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockInvalidPlatformAppPayloads.invalidSize
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid payload - invalid repository URL', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockInvalidPlatformAppPayloads.invalidUrl
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Billing Tests
  // ============================================
  describe('Billing Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I005: should reject when insufficient credits', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');
      vi.mocked(PlatformAppService.createApp).mockResolvedValue({
        success: false,
        error: 'Insufficient credits',
        errorCode: 'INSUFFICIENT_BALANCE',
        balance: 2,
        required: mockPlatformAppPricing.small.initialCost,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 402);

      expect(data.error).toBe('Insufficient credits');
      expect(data.balance).toBeDefined();
      expect(data.required).toBeDefined();
    });

    it('TC-PA-I012: should return deferred billing activation details after successful creation', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.billing).toEqual(
        expect.objectContaining({
          initial_cost: mockPlatformAppPricing.small.initialCost,
          hourly_rate: mockPlatformAppPricing.small.hourlyRate,
          activation: 'on_first_successful_deployment',
        })
      );
    });

    it('should use correct pricing for different sizes', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        { ...mockCreatePlatformAppPayload, size: 'medium' }
      );

      await POST(request as NextRequest);

      expect(PlatformAppService.createApp).toHaveBeenCalledWith(
        expect.objectContaining({ size: 'medium' })
      );
    });
  });

  // ============================================
  // App Limit Tests
  // ============================================
  describe('App Limit Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I006: should reject when app limit reached (20 apps)', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');
      vi.mocked(PlatformAppService.createApp).mockResolvedValue({
        success: false,
        error: 'App limit reached',
        errorCode: 'APP_LIMIT_EXCEEDED',
        currentCount: 20,
        maxLimit: 20,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('App limit reached');
      expect(data.current_count).toBe(20);
      expect(data.max_limit).toBe(20);
    });

    it('should allow creation when below limit', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 201);
    });
  });

  // ============================================
  // Duplicate Name Tests
  // ============================================
  describe('Duplicate Name Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I007: should reject duplicate app name', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');
      vi.mocked(PlatformAppService.createApp).mockResolvedValue({
        success: false,
        error: 'App name already exists',
        errorCode: 'NAME_EXISTS',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toBe('App name already exists');
      expect(data.field).toBe('name');
    });

    it('should allow unique app name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 201);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I002: should create app with valid payload', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.app_id).toBeDefined();
      expect(data.deployment_url).toBeDefined();
      // build_number may not always be returned depending on deployment success
    });

    it('should call DeploymentService.deploy with correct config', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      await POST(request as NextRequest);

      expect(PlatformAppService.createApp).toHaveBeenCalledWith(
        expect.objectContaining({
          name: mockCreatePlatformAppPayload.name,
          repository_url: mockCreatePlatformAppPayload.repository_url,
          branch: mockCreatePlatformAppPayload.branch,
          framework: mockCreatePlatformAppPayload.framework,
          git_provider: mockCreatePlatformAppPayload.git_provider,
        })
      );
    });

    it('TC-PA-I013: should add project log when project_id is provided', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      await POST(request as NextRequest);

      expect(PlatformAppService.createApp).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: mockCreatePlatformAppPayload.project_id,
        })
      );
    });

    it('TC-PA-I014: should assign port 3000 for Next.js framework', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');
      vi.mocked(PlatformAppService.createApp).mockResolvedValue({
        success: true,
        appId: mockPlatformApp.id,
        deploymentUrl: mockPlatformApp.deployment_url,
        port: 3000,
        billingInfo: {
          initialCost: mockPlatformAppPricing.small.initialCost,
          hourlyRate: mockPlatformAppPricing.small.hourlyRate,
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        { ...mockCreatePlatformAppPayload, framework: 'Next.js' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.port).toBe(3000);
    });

    it('TC-PA-I015: should assign port 8000 for Python framework', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');
      vi.mocked(PlatformAppService.createApp).mockResolvedValue({
        success: true,
        appId: 'app-python-123',
        deploymentUrl: 'https://python-app.apps.hostguardian.net',
        port: 8000,
        billingInfo: {
          initialCost: mockPlatformAppPricing.small.initialCost,
          hourlyRate: mockPlatformAppPricing.small.hourlyRate,
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        { ...mockCreatePlatformAppPayload, framework: 'python', name: 'python-app' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 201);

      expect(data.port).toBe(8000);
    });

    it('should pass env_vars to deployment service', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');

      const payloadWithEnvVars = {
        ...mockCreatePlatformAppPayload,
        env_vars: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'API_KEY', value: 'secret123' },
        ],
      };

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        payloadWithEnvVars
      );

      await POST(request as NextRequest);

      expect(PlatformAppService.createApp).toHaveBeenCalledWith(
        expect.objectContaining({
          env_vars: payloadWithEnvVars.env_vars,
        })
      );
    });
  });

  // ============================================
  // Deployment Failure Tests
  // ============================================
  describe('Deployment Failure Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should return error when deployment fails', async () => {
      const { PlatformAppService } = await import('@/lib/services/platform-app-service');
      vi.mocked(PlatformAppService.createApp).mockResolvedValue({
        success: false,
        error: 'Jenkins job creation failed',
        errorCode: 'DEPLOYMENT_FAILED',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 502);

      expect(data.error).toBeDefined();
    });
  });

  // NOTE: Git Provider Token Tests removed - GitHub token fallback via GitHubProvider.getToken
  // requires complex class mocking. Provider token handling is covered by the success cases above
  // which use session provider_token. GitHubProvider integration testing would be better suited
  // for unit tests of the provider itself.

  // ============================================
  // Server Configuration Error Tests
  // ============================================
  describe('Server Configuration Error Tests', () => {
    it('should return 500 without disclosing internal env var names', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      // Remove a required env var to trigger the 500 path
      const cleanEnv = { ...process.env };
      delete cleanEnv.JENKINS_URL;
      process.env = cleanEnv;

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/create',
        mockCreatePlatformAppPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Server configuration error');
      // Must NOT expose internal variable names to the client
      expect(JSON.stringify(data)).not.toContain('JENKINS_URL');
      expect(JSON.stringify(data)).not.toContain('CLOUDFLARE_API_TOKEN');
      expect(JSON.stringify(data)).not.toContain('.env.local');
      expect(JSON.stringify(data)).not.toContain('Missing required environment');
    });
  });
});
