import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/services/platform-apps/list/route';
import {
  mockPlatformApp,
  mockBuildingApp,
  mockFailedApp,
  mockPlatformAppUser,
  mockPreviousDeployment,
} from '../../utils/mock-data-platform-apps';
import {
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock all dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/queries');

/**
 * Platform Apps List API Integration Tests
 * GET /api/services/platform-apps/list
 */
describe('GET /api/services/platform-apps/list', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock for rate limiter
    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    // Default mock for Platform_Apps.list_by_owner
    const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([
      mockPlatformApp,
      mockBuildingApp,
      mockFailedApp,
    ] as any);

    // Default deployment metadata mocks
    vi.mocked(Platform_App_Deployments.get_rollback_context).mockResolvedValue({
      success: true,
      data: {
        serving_release: { id: 'deploy-serving', build_number: 41 },
        rollback_target: mockPreviousDeployment,
        latest_operation: { id: 'deploy-latest', build_number: 42, trigger: 'manual' },
        can_rollback: !!mockPreviousDeployment,
      },
    } as any);
  });

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication Tests', () => {
    it('TC-PA-I030: should require authentication', async () => {
      await mockUnauthenticatedUser();

      const response = await GET();
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      const response = await GET();
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

    it('TC-PA-I034: should enforce rate limiting', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 60,
      } as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I031: should list user apps', async () => {
      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps).toBeDefined();
      expect(Array.isArray(data.apps)).toBe(true);
      expect(data.apps.length).toBe(3);
    });

    it('should call Platform_Apps.list_by_owner with user id', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');

      await GET();

      expect(Platform_Apps.list_by_owner).toHaveBeenCalledWith(mockPlatformAppUser.id);
    });

    it('TC-PA-I032: should return empty array for new user', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([]);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps).toEqual([]);
    });

    it('should return apps with correct structure', async () => {
      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      const app = data.apps[0];
      expect(app.id).toBeDefined();
      expect(app.name).toBeDefined();
      expect(app.status).toBeDefined();
    });

    it('TC-PA-I033: should include rollback capability in response', async () => {
      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      // Each app should have can_rollback field
      data.apps.forEach((app: any) => {
        expect(app).toHaveProperty('can_rollback');
        expect(typeof app.can_rollback).toBe('boolean');
      });
    });

    it('should check previous deployment for rollback capability', async () => {
      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');

      await GET();

      // Should check rollback context for each app
      expect(Platform_App_Deployments.get_rollback_context).toHaveBeenCalled();
    });

    it('should set can_rollback=true when previous deployment exists', async () => {
      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_App_Deployments.get_rollback_context).mockResolvedValue({
        success: true,
        data: {
          serving_release: { id: 'deploy-serving', build_number: 41 },
          rollback_target: mockPreviousDeployment,
          latest_operation: { id: 'deploy-latest', build_number: 42, trigger: 'manual' },
          can_rollback: true,
        },
      } as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps[0].can_rollback).toBe(true);
    });

    it('should set can_rollback=false when no previous deployment', async () => {
      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_App_Deployments.get_rollback_context).mockResolvedValue({
        success: true,
        data: {
          serving_release: { id: 'deploy-serving', build_number: 41 },
          rollback_target: null,
          latest_operation: { id: 'deploy-latest', build_number: 42, trigger: 'manual' },
          can_rollback: false,
        },
      } as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps[0].can_rollback).toBe(false);
    });

    it('should clear rollback metadata when target matches the current serving release', async () => {
      const { Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_App_Deployments.get_rollback_context).mockResolvedValue({
        success: true,
        data: {
          serving_release: {
            id: 'deploy-serving',
            build_number: 41,
            image_tag: 'example/app:41',
            image_digest: 'sha256:same',
          },
          rollback_target: null,
          latest_operation: { id: 'deploy-latest', build_number: 42, trigger: 'manual' },
          can_rollback: false,
        },
      } as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps[0].can_rollback).toBe(false);
      expect(data.apps[0].rollback_target_build_number).toBeNull();
      expect(data.apps[0].rollback_target_commit_sha).toBeNull();
    });
  });

  // ============================================
  // App Status Tests
  // ============================================
  describe('App Status Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should return apps with different statuses', async () => {
      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      const statuses = data.apps.map((app: any) => app.status);
      expect(statuses).toContain('running');
      expect(statuses).toContain('building');
      expect(statuses).toContain('failed');
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
      vi.mocked(Platform_Apps.list_by_owner).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await GET();
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it('should handle unexpected errors gracefully', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.list_by_owner).mockRejectedValue('Unexpected error');

      const response = await GET();
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Data Integrity Tests
  // ============================================
  describe('Data Integrity Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should preserve app data structure', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([mockPlatformApp] as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      const app = data.apps[0];
      expect(app.id).toBe(mockPlatformApp.id);
      expect(app.name).toBe(mockPlatformApp.name);
      expect(app.slug).toBe(mockPlatformApp.slug);
      expect(app.status).toBe(mockPlatformApp.status);
      expect(app.deployment_url).toBe(mockPlatformApp.deployment_url);
    });

    it('should handle apps without active_deployment_id', async () => {
      const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue([
        { ...mockPlatformApp, active_deployment_id: null },
      ] as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps.length).toBe(1);
      expect(Platform_App_Deployments.get_rollback_context).toHaveBeenCalledWith(
        mockPlatformApp.id,
        null
      );
    });
  });

  // ============================================
  // Performance Tests
  // ============================================
  describe('Performance Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle large number of apps', async () => {
      const { Platform_Apps, Platform_App_Deployments } = await import('@/lib/supabase/queries');
      
      // Create 10 mock apps
      const manyApps = Array.from({ length: 10 }, (_, i) => ({
        ...mockPlatformApp,
        id: `app-${i}`,
        name: `app-${i}`,
        active_deployment_id: `deploy-${i}`,
      }));
      
      vi.mocked(Platform_Apps.list_by_owner).mockResolvedValue(manyApps as any);
      vi.mocked(Platform_App_Deployments.get_rollback_context).mockResolvedValue({
        success: true,
        data: {
          serving_release: { id: 'deploy-serving', build_number: 41 },
          rollback_target: mockPreviousDeployment,
          latest_operation: { id: 'deploy-latest', build_number: 42, trigger: 'manual' },
          can_rollback: true,
        },
      } as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.apps.length).toBe(10);
      // Should check rollback context for each app
      expect(Platform_App_Deployments.get_rollback_context).toHaveBeenCalledTimes(10);
    });
  });
});
