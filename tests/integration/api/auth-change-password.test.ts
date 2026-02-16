import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/auth/profile/change-password/route';
import { NextRequest } from 'next/server';
import { expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/audit');

describe('PUT /api/auth/profile/change-password', () => {
  const testUrl = 'http://localhost:3000/api/auth/profile/change-password';

  function createMockPutRequest(url: string, body: any) {
    return new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as NextRequest;
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const { AuditLogService } = await import('@/lib/audit');
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);

    // getAuditContext is also imported from @/lib/audit in the route
    const auditModule = await import('@/lib/audit');
    if ('getAuditContext' in auditModule) {
      vi.mocked(auditModule.getAuditContext).mockReturnValue({
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        requestId: 'test-id',
      } as any);
    }
  });

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
    signInResult?: { error: any };
    updateResult?: { error: any };
  }) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.user ?? { id: 'user-123', email: 'test@example.com' } },
      error: options.userError ?? null,
    });

    const updateUser = vi.fn().mockResolvedValue(
      options.updateResult ?? { error: null }
    );

    const sessionClient = {
      auth: { getUser, updateUser },
    };

    const signInWithPassword = vi.fn().mockResolvedValue(
      options.signInResult ?? { error: null }
    );

    const serviceClient = {
      auth: { signInWithPassword },
    };

    return { sessionClient, serviceClient, getUser, updateUser, signInWithPassword };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-090: should change password successfully', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({});

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword456',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toBe('Password changed successfully');
    });

    it('TC-AUTH-091: should verify current password via signIn', async () => {
      const { sessionClient, serviceClient, signInWithPassword } = setupSupabaseMock({});

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword456',
      });

      await PUT(request as NextRequest);

      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'oldPassword123',
      });
    });

    it('TC-AUTH-092: should create audit log on success', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({});

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const { AuditLogService } = await import('@/lib/audit');

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword456',
      });

      await PUT(request as NextRequest);

      expect(AuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'password_change',
          service_type: 'auth',
        })
      );
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-093: should return 401 for unauthenticated user', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({
        user: null,
        userError: { message: 'Not authenticated' },
      });

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'old',
        newPassword: 'new123',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-AUTH-094: should reject missing currentPassword', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({});

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, { newPassword: 'newPassword456' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('required');
    });

    it('TC-AUTH-095: should reject missing newPassword', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({});

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, { currentPassword: 'oldPassword123' });
      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('required');
    });

    it('TC-AUTH-096: should reject password shorter than 6 chars', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({});

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'oldPassword123',
        newPassword: '12345',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('at least 6');
    });
  });

  // ============================================
  // Wrong Password
  // ============================================
  describe('Wrong Password', () => {
    it('TC-AUTH-097: should reject incorrect current password', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({
        signInResult: { error: { message: 'Invalid login credentials' } },
      });

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'wrongPassword',
        newPassword: 'newPassword456',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('incorrect');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-098: should return 400 when Supabase update fails', async () => {
      const { sessionClient, serviceClient } = setupSupabaseMock({
        updateResult: { error: { message: 'Password update failed' } },
      });

      const { createClient, createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(sessionClient as any);
      vi.mocked(createServiceClient).mockResolvedValue(serviceClient as any);

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword456',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('Password update failed');
    });

    it('TC-AUTH-099: should handle unexpected errors', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockRejectedValue(new Error('Connection failed'));

      const request = createMockPutRequest(testUrl, {
        currentPassword: 'old',
        newPassword: 'newpass',
      });

      const response = await PUT(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.message).toBeDefined();
    });
  });
});
