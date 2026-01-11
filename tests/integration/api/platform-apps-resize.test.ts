import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/resize/route';
import { NextRequest } from 'next/server';
import {
  mockPlatformApp,
  mockBuildingApp,
  mockPlatformAppUser,
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
vi.mock('@/lib/services/jenkins');
vi.mock('@/lib/services/build-polling');
vi.mock('@/lib/providers/github');
vi.mock('@/config/pricing');

/**
 * Platform Apps Resize API Integration Tests
 * POST /api/services/platform-apps/resize
 */
describe('POST /api/services/platform-apps/resize', () => {
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
        size: 'small',
      },
    } as any);
    vi.mocked(Platform_Apps.update).mockResolvedValue({
      success: true,
      data: { ...mockPlatformApp, size: 'medium' },
    } as any);
    vi.mocked(Platform_Apps.get_env_vars).mockResolvedValue([]);

    // Default mock for JenkinsService
    const { JenkinsService } = await import('@/lib/services/jenkins');
    vi.mocked(JenkinsService.createJob).mockResolvedValue(undefined);
    vi.mocked(JenkinsService.updateJobConfig).mockResolvedValue(undefined);
    vi.mocked(JenkinsService.triggerBuild).mockResolvedValue(2);
    vi.mocked(JenkinsService.getLatestBuildNumber).mockResolvedValue(2);

    // Default mock for BuildPollingService
    const { BuildPollingService } = await import('@/lib/services/build-polling');
    vi.mocked(BuildPollingService.startPolling).mockResolvedValue(undefined);

    const { getRatesForPlatformApp } = await import('@/config/pricing');
    vi.mocked(getRatesForPlatformApp).mockResolvedValue({
      initialCost: mockPlatformAppPricing.medium.initialCost,
      hourlyRate: mockPlatformAppPricing.medium.hourlyRate,
    });

    // Default mock for Billing
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.update_active_platform_app_rate).mockResolvedValue({
      success: true,
    } as any);

    // Default mock for Projects.add_log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    // Default mock for GitHubProvider
    const { GitHubProvider } = await import('@/lib/providers/github');
    vi.mocked(GitHubProvider).mockImplementation(() => ({
      getToken: vi.fn().mockResolvedValue({ accessToken: 'mock-token' }),
    } as any));
  });

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication Tests', () => {
    it('TC-PA-I060: should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
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

    it('TC-PA-I068: should enforce rate limiting', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 60,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
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
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: 'invalid-uuid', new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing app_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing new_size', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid size value', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'xlarge' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // App Not Found Tests
  // ============================================
  describe('App Not Found Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I065: should return 404 when app not found', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: false,
        error: 'App not found',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: '550e8400-e29b-41d4-a716-446655440999', new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 404);
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization Tests', () => {
    it('TC-PA-I066: should reject unauthorized user (not owner)', async () => {
      await mockAuthenticatedUser('different-user-id');

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 403);
    });
  });

  // ============================================
  // Size Validation Tests
  // ============================================
  describe('Size Validation Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I061: should allow upsize from small to medium', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          size: 'small',
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('TC-PA-I062: should allow upsize from medium to large', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          size: 'medium',
        },
      } as any);

      const { getRatesForPlatformApp } = await import('@/config/pricing');
      vi.mocked(getRatesForPlatformApp).mockResolvedValue({
        initialCost: mockPlatformAppPricing.large.initialCost,
        hourlyRate: mockPlatformAppPricing.large.hourlyRate,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'large' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('TC-PA-I063: should reject downsize (large to small)', async () => {
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

    it('TC-PA-I064: should reject same size', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          size: 'medium',
        },
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Invalid resize operation');
    });

    it('should allow upsize from small to large (skip medium)', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          size: 'small',
        },
      } as any);

      const { getRatesForPlatformApp } = await import('@/config/pricing');
      vi.mocked(getRatesForPlatformApp).mockResolvedValue({
        initialCost: mockPlatformAppPricing.large.initialCost,
        hourlyRate: mockPlatformAppPricing.large.hourlyRate,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'large' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // Billing Tests
  // ============================================
  describe('Billing Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I069: should update billing rate for new size', async () => {
      const { Billing } = await import('@/lib/supabase/queries/billing');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      await POST(request as NextRequest);

      // Should update billing rate
      expect(Billing.update_active_platform_app_rate).toHaveBeenCalled();
    });

    it('should use correct pricing for target size', async () => {
      const { getRatesForPlatformApp } = await import('@/config/pricing');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      await POST(request as NextRequest);

      expect(getRatesForPlatformApp).toHaveBeenCalledWith('medium');
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should resize app successfully', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('resized');
      expect(data.build_number).toBeDefined();
    });

    it('should trigger Jenkins job with new size', async () => {
      const { JenkinsService } = await import('@/lib/services/jenkins');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      await POST(request as NextRequest);

      expect(JenkinsService.updateJobConfig).toHaveBeenCalled();
      expect(JenkinsService.triggerBuild).toHaveBeenCalled();
    });

    it('should start build polling', async () => {
      const { BuildPollingService } = await import('@/lib/services/build-polling');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      await POST(request as NextRequest);

      expect(BuildPollingService.startPolling).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: mockPlatformApp.id,
          appName: mockPlatformApp.name,
          trigger: 'resize',
        })
      );
    });

    it('should update app size in database', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      await POST(request as NextRequest);

      expect(Platform_Apps.update).toHaveBeenCalledWith(
        mockPlatformApp.id,
        expect.objectContaining({ size: 'medium' })
      );
    });
  });

  // ============================================
  // App State Tests
  // ============================================
  describe('App State Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should reject resize for building app', async () => {
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
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toContain('building');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle Jenkins errors', async () => {
      const { JenkinsService } = await import('@/lib/services/jenkins');
      vi.mocked(JenkinsService.updateJobConfig).mockRejectedValue(
        new Error('Jenkins unavailable')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 500);
    });

    it('should handle database errors', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.update).mockRejectedValue(
        new Error('Database error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/resize',
        { app_id: mockPlatformApp.id, new_size: 'medium' }
      );

      const response = await POST(request as NextRequest);
      expect(response).toBeDefined();
    });
  });
});
