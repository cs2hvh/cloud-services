import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/env-vars/update/route';
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

const withAppMutationLockMock = vi.fn();

// Mock all dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/kubernetes-info');
vi.mock('@/lib/services/app-status');
vi.mock('@/lib/services/runtime-env-reconciler');
vi.mock('@/lib/app-operations', () => {
  class MockResourceMutationLockService {
    withAppMutationLock = withAppMutationLockMock;
  }

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
    ResourceMutationLockService: MockResourceMutationLockService,
    AppOperationError: MockAppOperationError,
  };
});

/**
 * Platform Apps Environment Variables API Integration Tests
 * POST /api/services/platform-apps/env-vars/update
 * 
 * This API endpoint updates environment variables for a platform app.
 * It does NOT trigger Jenkins rebuild - just stores the env vars.
 */
describe('POST /api/services/platform-apps/env-vars/update', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock for rate limiter
    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    // Default mock for Platform_Apps
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: {
        ...mockPlatformApp,
        user_id: mockPlatformAppUser.id,
      },
    } as any);
    vi.mocked(Platform_Apps.set_env_vars).mockResolvedValue({
      success: true,
    } as any);

    const { reconcileRuntimeEnv } = await import('@/lib/services/runtime-env-reconciler');
    vi.mocked(reconcileRuntimeEnv).mockResolvedValue({
      status: 'success',
      runtimeEnvVars: mockEnvVars,
      reason: null,
    } as any);

    withAppMutationLockMock.mockImplementation(async ({ run }) => run());

    const { KubernetesInfoService } = await import('@/lib/services/kubernetes-info');
    vi.mocked(KubernetesInfoService.updateEnvVarsAndRestart).mockResolvedValue({
      success: true,
    } as any);
  });

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication Tests', () => {
    it('TC-PA-I070: should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
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

    it('TC-PA-I077: should enforce rate limiting', async () => {
      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 30,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
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
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: 'invalid-uuid', env_vars: mockEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing app_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { env_vars: mockEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject missing env_vars', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject env_vars with empty key', async () => {
      const invalidEnvVars = [
        { key: '', value: 'some-value' },
      ];

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: invalidEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject env_vars with empty value', async () => {
      const invalidEnvVars = [
        { key: 'MY_VAR', value: '' },
      ];

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: invalidEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should accept valid env_vars', async () => {
      const validEnvVars = [
        { key: 'DATABASE_URL', value: 'postgres://localhost' },
        { key: 'API_KEY', value: 'sk-test-123' },
        { key: 'MY_VAR_123', value: 'value' },
      ];

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: validEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization Tests', () => {
    it('TC-PA-I074: should reject unauthorized user (not owner)', async () => {
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
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 403);
    });
  });

  // ============================================
  // App Not Found Tests
  // ============================================
  describe('App Not Found Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I075: should return 404 when app not found', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: false,
        error: 'App not found',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        {
          app_id: '550e8400-e29b-41d4-a716-446655440999',
          env_vars: mockEnvVars,
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 404);
    });

    it('should return 404 when success is true but data is null (null ownership guard)', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      // Simulates a race condition where the record was deleted between check and fetch,
      // or a DB adapter that returns success:true with null data.
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: null,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        {
          app_id: '550e8400-e29b-41d4-a716-446655440999',
          env_vars: mockEnvVars,
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 404);
    });
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('TC-PA-I071: should update env_vars successfully', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('Environment');
    });

    it('should store env_vars in database', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
      );

      await POST(request as NextRequest);

      expect(Platform_Apps.set_env_vars).toHaveBeenCalledWith(
        mockPlatformApp.id,
        mockEnvVars
      );
    });

    it('should accept empty env_vars array (clear all)', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: [] }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // Special Characters Tests
  // ============================================
  describe('Special Characters in Values', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle env_vars with special characters in values', async () => {
      const specialEnvVars = [
        { key: 'CONNECTION_STRING', value: 'postgres://user:p@ss=word@host:5432/db?sslmode=require' },
        { key: 'JSON_CONFIG', value: '{"key":"value","nested":{"a":1}}' },
        { key: 'MULTILINE', value: 'line1\\nline2\\nline3' },
      ];

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: specialEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });

    it('should handle env_vars with unicode characters', async () => {
      const unicodeEnvVars = [
        { key: 'GREETING', value: 'Hello 世界 🌍' },
        { key: 'EMOJI_VAR', value: '👋🏼 Welcome!' },
      ];

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: unicodeEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================
  describe('Error Handling Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockPlatformAppUser.id);
    });

    it('should handle database update errors', async () => {
      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.set_env_vars).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/platform-apps/env-vars/update',
        { app_id: mockPlatformApp.id, env_vars: mockEnvVars }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });
});
