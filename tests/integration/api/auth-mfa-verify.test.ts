import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

const { mockCheck } = vi.hoisted(() => ({
  mockCheck: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({
    check: mockCheck,
  })),
}));

vi.mock('@/lib/supabase/server');

import { POST } from '@/app/api/auth/mfa/verify/route';

describe('POST /api/auth/mfa/verify', () => {
  const testUrl = 'http://localhost:3000/api/auth/mfa/verify';

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue(undefined);
  });

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
    challengeResult?: { data?: any; error?: any };
    verifyResult?: { data?: any; error?: any };
  }) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.user ?? { id: 'user-123', email: 'test@example.com' } },
      error: options.userError ?? null,
    });

    const challenge = vi.fn().mockResolvedValue(
      options.challengeResult ?? { data: { id: 'challenge-id' }, error: null }
    );

    const verify = vi.fn().mockResolvedValue(
      options.verifyResult ?? { data: { access_token: 'new-token' }, error: null }
    );

    const mockClient = {
      auth: {
        getUser,
        mfa: { challenge, verify },
      },
    };

    return { mockClient, getUser, challenge, verify };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-050: should verify TOTP code successfully', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '123456',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('2FA verification successful');
    });

    it('TC-AUTH-051: should call challenge then verify with correct params', async () => {
      const { mockClient, challenge, verify } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '654321',
      });

      await POST(request as NextRequest);

      expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-123' });
      expect(verify).toHaveBeenCalledWith({
        factorId: 'factor-123',
        challengeId: 'challenge-id',
        code: '654321',
      });
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-AUTH-052: should reject missing factorId', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, { code: '123456' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('factorId');
    });

    it('TC-AUTH-053: should reject missing code', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, { factorId: 'factor-123' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('code');
    });

    it('TC-AUTH-054: should reject code with wrong length (not 6 digits)', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '12345', // only 5 digits
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it('TC-AUTH-055: should reject non-string factorId', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 12345,
        code: '123456',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-056: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({
        user: null,
        userError: { message: 'Not authenticated' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '123456',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-AUTH-057: should return 429 when rate limited', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      mockCheck.mockRejectedValue(new Error('Rate limit exceeded'));

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '123456',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toContain('Too many');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-058: should return 400 when challenge fails', async () => {
      const { mockClient } = setupSupabaseMock({
        challengeResult: { data: null, error: { message: 'Challenge creation failed' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '123456',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Challenge creation failed');
    });

    it('TC-AUTH-059: should return 400 for invalid TOTP code', async () => {
      const { mockClient } = setupSupabaseMock({
        verifyResult: { data: null, error: { message: 'Invalid TOTP code' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {
        factorId: 'factor-123',
        code: '000000',
      });

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });
  });
});
