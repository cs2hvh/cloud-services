import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/get/route';
import { NextRequest } from 'next/server';
import {
  mockPlatformApp,
  mockPlatformAppUser,
  mockEnvVars,
} from '../../utils/mock-data-platform-apps';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock all dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/app-status');

/**
 * Platform Apps Get API Integration Tests
 * POST /api/services/platform-apps/get
 */
describe('POST /api/services/platform-apps/get', () => {
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
      },
    } as any);

    // Default mock for Platform_Apps.get_env_vars
    vi.mocked(Platform_Apps.get_env_vars).mockResolvedValue(mockEnvVars);

    // Default mock for AppStatusService.syncStatus
    const { AppStatusService } = await import('@/lib/services/app-status');
    vi.mocked(AppStatusService.syncStatus).mockResolvedValue({
      currentStatus: 'running',
      previousStatus: 'running',
      changed: false,
    } as any);
  });

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication Tests', () => {
    it('TC-PA-I040: should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
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

    it('TC-PA-I046: should enforce rate limiting', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 30,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
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
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: 'invalid-uuid' }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing app_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        {}
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

    it('TC-PA-I042: should return 404 when app not found', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: false,
        error: 'App not found',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
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
    it('TC-PA-I043: should reject unauthorized user (not owner)', async () => {
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
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 403);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I041: should return app details', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.id).toBe(mockPlatformApp.id);
      expect(data.name).toBe(mockPlatformApp.name);
      expect(data.status).toBeDefined();
      expect(data.deployment_url).toBeDefined();
    });

    it('should call Platform_Apps.get with correct app_id', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      expect(Platform_Apps.get).toHaveBeenCalledWith(mockPlatformApp.id);
    });

    it('TC-PA-I044: should sync status from K8s', async () => {
      const { AppStatusService } = await import('@/lib/services/app-status');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      expect(AppStatusService.syncStatus).toHaveBeenCalledWith(
        mockPlatformApp.id,
        mockPlatformApp.name,
        mockPlatformApp.status
      );
    });

    it('should return synced status in response', async () => {
      const { AppStatusService } = await import('@/lib/services/app-status');
      vi.mocked(AppStatusService.syncStatus).mockResolvedValue({
        currentStatus: 'failed',
        previousStatus: 'running',
        changed: true,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.status).toBe('failed');
    });

    it('TC-PA-I045: should include env_vars in response', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.env_vars).toBeDefined();
      expect(Array.isArray(data.env_vars)).toBe(true);
      expect(data.env_vars).toEqual(mockEnvVars);
    });

    it('should call Platform_Apps.get_env_vars', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      await POST(request as NextRequest);

      expect(Platform_Apps.get_env_vars).toHaveBeenCalledWith(mockPlatformApp.id);
    });

    it('should return all app fields', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.id).toBeDefined();
      expect(data.name).toBeDefined();
      expect(data.slug).toBeDefined();
      expect(data.repository_url).toBeDefined();
      expect(data.branch).toBeDefined();
      expect(data.framework).toBeDefined();
      expect(data.port).toBeDefined();
      expect(data.deployment_url).toBeDefined();
      expect(data.created_at).toBeDefined();
    });
  });

  // ============================================
  // Status Sync Tests
  // ============================================
  describe('Status Sync Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle status sync for running app', async () => {
      const { AppStatusService } = await import('@/lib/services/app-status');
      vi.mocked(AppStatusService.syncStatus).mockResolvedValue({
        currentStatus: 'running',
        previousStatus: 'running',
        changed: false,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.status).toBe('running');
    });

    it('should handle status sync for building app', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          status: 'building',
        },
      } as any);

      const { AppStatusService } = await import('@/lib/services/app-status');
      vi.mocked(AppStatusService.syncStatus).mockResolvedValue({
        currentStatus: 'building',
        previousStatus: 'building',
        changed: false,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.status).toBe('building');
    });

    it('should handle status transition from building to running', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: {
          ...mockPlatformApp,
          user_id: mockPlatformAppUser.id,
          status: 'building',
        },
      } as any);

      const { AppStatusService } = await import('@/lib/services/app-status');
      vi.mocked(AppStatusService.syncStatus).mockResolvedValue({
        currentStatus: 'running',
        previousStatus: 'building',
        changed: true,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      // Should return the synced status, not the DB status
      expect(data.status).toBe('running');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle database errors', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockRejectedValue(new Error('Database error'));

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should handle status sync errors gracefully', async () => {
      const { AppStatusService } = await import('@/lib/services/app-status');
      vi.mocked(AppStatusService.syncStatus).mockRejectedValue(
        new Error('K8s connection failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      // Should still return response even if status sync fails
      const response = await POST(request as NextRequest);
      // Note: Actual behavior may vary - test verifies error handling
      expect(response).toBeDefined();
    });

    it('should handle env_vars fetch error', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get_env_vars).mockRejectedValue(
        new Error('Failed to fetch env vars')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/get',
        { app_id: mockPlatformApp.id }
      );

      // Should handle gracefully
      const response = await POST(request as NextRequest);
      expect(response).toBeDefined();
    });
  });
});
