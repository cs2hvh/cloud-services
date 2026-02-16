//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/signin/email/route';
import { NextRequest } from 'next/server';
import {
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/cooldown/emailbased');
vi.mock('@/lib/audit');
vi.mock('@/lib/audit/context');

describe('POST /api/auth/signin/email', () => {
  const testUrl = 'http://localhost:3000/api/auth/signin/email';
  const validCredentials = { email: 'test@example.com', password: 'securePassword123' };

  const mockUserData = {
    user: {
      id: 'user-id-123',
      email: 'test@example.com',
      factors: [],
    },
    session: { access_token: 'mock-token' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: allow rate limiting
    const { limitByEmail } = await import('@/lib/cooldown/emailbased');
    vi.mocked(limitByEmail).mockResolvedValue({ allowed: true, retryAfterSec: 0 });

    // Default: getAuditContext returns empty context
    const { getAuditContext } = await import('@/lib/audit/context');
    vi.mocked(getAuditContext).mockReturnValue({} as any);

    // Default: AuditLogService.create succeeds
    const { AuditLogService } = await import('@/lib/audit');
    vi.mocked(AuditLogService.create).mockResolvedValue(undefined as any);
  });

  function setupSupabaseMock(options: {
    signInResult: { data: any; error: any };
    profileResult?: { data: any; error?: any };
  }) {
    const signInWithPassword = vi.fn().mockResolvedValue(options.signInResult);
    const single = vi.fn().mockResolvedValue(
      options.profileResult ?? { data: { username: 'testuser' }, error: null }
    );
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const mockClient = {
      auth: { signInWithPassword },
      from,
    };

    return { mockClient, signInWithPassword, from };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-020: should sign in with valid credentials', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: { data: mockUserData, error: null },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toBe('Signed in successfully.');
      expect(data.name).toBe('testuser');
      expect(data.twofastatus).toBe(false);
    });

    it('TC-AUTH-021: should return twofastatus true when TOTP is verified', async () => {
      const userWithMFA = {
        ...mockUserData,
        user: {
          ...mockUserData.user,
          factors: [{ factor_type: 'totp', status: 'verified' }],
        },
      };

      const { mockClient } = setupSupabaseMock({
        signInResult: { data: userWithMFA, error: null },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.twofastatus).toBe(true);
    });

    it('TC-AUTH-022: should return email as name when no profile username', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: { data: mockUserData, error: null },
        profileResult: { data: null, error: { code: 'PGRST116' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.name).toBe('test@example.com');
    });

    it('TC-AUTH-023: should create audit log on successful login', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: { data: mockUserData, error: null },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { AuditLogService } = await import('@/lib/audit');

      const request = createMockPostRequest(testUrl, validCredentials);
      await POST(request as NextRequest);

      expect(AuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-id-123',
          action: 'login',
          service_type: 'auth',
          service_name: 'Email/Password Login',
          metadata: expect.objectContaining({
            login_method: 'email',
          }),
        })
      );
    });

    it('TC-AUTH-024: should still succeed if audit log fails', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: { data: mockUserData, error: null },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { AuditLogService } = await import('@/lib/audit');
      vi.mocked(AuditLogService.create).mockRejectedValue(new Error('Audit DB down'));

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toBe('Signed in successfully.');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-AUTH-025: should reject missing email', async () => {
      const request = createMockPostRequest(testUrl, { password: 'password123' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-026: should reject missing password', async () => {
      const request = createMockPostRequest(testUrl, { email: 'test@example.com' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-027: should reject empty body', async () => {
      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toBe('Email and password are required');
    });

    it('TC-AUTH-028: should reject empty string email', async () => {
      const request = createMockPostRequest(testUrl, { email: '', password: 'pass' });
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('TC-AUTH-029: should reject empty string password', async () => {
      const request = createMockPostRequest(testUrl, { email: 'test@example.com', password: '' });
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Authentication Failure Tests
  // ============================================
  describe('Authentication Failures', () => {
    it('TC-AUTH-030: should return 401 for wrong password', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: {
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' },
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'test@example.com',
        password: 'wrongpassword',
      });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.message).toBe('Invalid login credentials');
    });

    it('TC-AUTH-031: should return 401 for non-existent email', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: {
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' },
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        email: 'nonexistent@example.com',
        password: 'password123',
      });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.message).toBe('Invalid login credentials');
    });

    it('TC-AUTH-032: should return 401 when user is null (no error)', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: {
          data: { user: null, session: null },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.message).toBe('Authentication failed');
    });

    it('TC-AUTH-033: should return 401 for email not confirmed', async () => {
      const { mockClient } = setupSupabaseMock({
        signInResult: {
          data: { user: null, session: null },
          error: { message: 'Email not confirmed' },
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.message).toBe('Email not confirmed');
    });
  });

  // ============================================
  // Rate Limiting Tests
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-AUTH-034: should return 429 when rate limit exceeded', async () => {
      const { limitByEmail } = await import('@/lib/cooldown/emailbased');
      vi.mocked(limitByEmail).mockResolvedValue({ allowed: false, retryAfterSec: 45 });

      const request = createMockPostRequest(testUrl, validCredentials);
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too many requests. Try again later.');
      expect(response.headers.get('Retry-After')).toBe('45');
    });

    it('TC-AUTH-035: should call limitByEmail with correct email', async () => {
      const { limitByEmail } = await import('@/lib/cooldown/emailbased');
      vi.mocked(limitByEmail).mockResolvedValue({ allowed: false, retryAfterSec: 30 });

      const request = createMockPostRequest(testUrl, validCredentials);
      await POST(request as NextRequest);

      expect(limitByEmail).toHaveBeenCalledWith(
        'test@example.com',
        { limit: 5, windowMs: 60_000 }
      );
    });
  });
});
