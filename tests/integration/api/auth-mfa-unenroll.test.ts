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

import { POST } from '@/app/api/auth/mfa/unenroll/route';

describe('POST /api/auth/mfa/unenroll', () => {
  const testUrl = 'http://localhost:3000/api/auth/mfa/unenroll';

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue(undefined);
  });

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
    listFactorsResult?: { data?: any; error?: any };
    unenrollResult?: { data?: any; error?: any };
  }) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.user ?? { id: 'user-123', email: 'test@example.com' } },
      error: options.userError ?? null,
    });

    const listFactors = vi.fn().mockResolvedValue(
      options.listFactorsResult ?? {
        data: {
          totp: [{ id: 'factor-123', status: 'verified' }],
        },
        error: null,
      }
    );

    const unenroll = vi.fn().mockResolvedValue(
      options.unenrollResult ?? { data: {}, error: null }
    );

    const mockClient = {
      auth: {
        getUser,
        mfa: { listFactors, unenroll },
      },
    };

    return { mockClient, getUser, listFactors, unenroll };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-070: should unenroll factor by specific factorId', async () => {
      const { mockClient, unenroll } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, { factorId: 'factor-123' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('successfully removed');
      expect(unenroll).toHaveBeenCalledWith({ factorId: 'factor-123' });
    });

    it('TC-AUTH-071: should auto-find verified factor when no factorId given', async () => {
      const { mockClient, unenroll } = setupSupabaseMock({
        listFactorsResult: {
          data: {
            totp: [
              { id: 'unverified-f', status: 'unverified' },
              { id: 'verified-f', status: 'verified' },
            ],
          },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(unenroll).toHaveBeenCalledWith({ factorId: 'verified-f' });
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-072: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({
        user: null,
        userError: { message: 'Not authenticated' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Not Found Cases
  // ============================================
  describe('Not Found', () => {
    it('TC-AUTH-073: should return 404 when specific factorId not found', async () => {
      const { mockClient } = setupSupabaseMock({
        listFactorsResult: {
          data: { totp: [{ id: 'other-factor', status: 'verified' }] },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, { factorId: 'nonexistent' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('Factor not found');
    });

    it('TC-AUTH-074: should return 404 when no verified factor exists (no factorId)', async () => {
      const { mockClient } = setupSupabaseMock({
        listFactorsResult: {
          data: { totp: [{ id: 'f1', status: 'unverified' }] },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('No verified');
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-AUTH-075: should return 429 when rate limited', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      mockCheck.mockRejectedValue(new Error('Rate limit exceeded'));

      const request = createMockPostRequest(testUrl, { factorId: 'factor-123' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toContain('Too many');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-076: should return 400 when listFactors fails', async () => {
      const { mockClient } = setupSupabaseMock({
        listFactorsResult: { data: null, error: { message: 'Failed to list' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, { factorId: 'factor-123' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it('TC-AUTH-077: should return 400 when unenroll fails', async () => {
      const { mockClient } = setupSupabaseMock({
        unenrollResult: { data: null, error: { message: 'Unenroll failed' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, { factorId: 'factor-123' });
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });
  });
});
