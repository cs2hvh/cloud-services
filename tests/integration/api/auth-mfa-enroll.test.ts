import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

// Use vi.hoisted so mockCheck is available inside the hoisted vi.mock factory
const { mockCheck } = vi.hoisted(() => ({
  mockCheck: vi.fn().mockResolvedValue(undefined),
}));

// Factory mock for rate-limit (called at module level by route)
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({
    check: mockCheck,
  })),
}));

vi.mock('@/lib/supabase/server');

// Import after mocks are set up
import { POST } from '@/app/api/auth/mfa/enroll/route';

describe('POST /api/auth/mfa/enroll', () => {
  const testUrl = 'http://localhost:3000/api/auth/mfa/enroll';

  const defaultEnrollData = {
    id: 'factor-id-123',
    type: 'totp',
    totp: {
      qr_code: 'data:image/svg+xml;base64,abc',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/test?secret=JBSWY3DPEHPK3PXP',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockResolvedValue(undefined);
  });

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
    enrollResults?: Array<{ data: any; error: any }>;
    listFactorsResult?: { data?: any; error?: any };
    unenrollResult?: { data?: any; error?: any };
  }) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.user ?? { id: 'user-123', email: 'test@example.com' } },
      error: options.userError ?? null,
    });

    const enrollResults = options.enrollResults ?? [
      { data: defaultEnrollData, error: null },
    ];
    const enroll = vi.fn();
    enrollResults.forEach((result, i) => {
      if (i === enrollResults.length - 1) {
        enroll.mockResolvedValue(result);
      } else {
        enroll.mockResolvedValueOnce(result);
      }
    });

    const listFactors = vi.fn().mockResolvedValue(
      options.listFactorsResult ?? { data: { totp: [] }, error: null }
    );

    const unenroll = vi.fn().mockResolvedValue(
      options.unenrollResult ?? { data: {}, error: null }
    );

    const mockClient = {
      auth: {
        getUser,
        mfa: { enroll, listFactors, unenroll },
      },
    };

    return { mockClient, getUser, enroll, listFactors, unenroll };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-040: should enroll new TOTP factor', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.factorId).toBe('factor-id-123');
      expect(data.qrCode).toBeDefined();
      expect(data.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(data.uri).toContain('otpauth://totp/');
    });

    it('TC-AUTH-041: should retry enrollment after cleaning unverified factors', async () => {
      const { mockClient, unenroll } = setupSupabaseMock({
        enrollResults: [
          { data: null, error: { message: 'factor already exists' } },
          { data: defaultEnrollData, error: null },
        ],
        listFactorsResult: {
          data: { totp: [{ id: 'old-unverified', status: 'unverified' }] },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(unenroll).toHaveBeenCalledWith({ factorId: 'old-unverified' });
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-042: should return 401 for unauthenticated user', async () => {
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
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-AUTH-043: should return 429 when rate limited', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      mockCheck.mockRejectedValue(new Error('Rate limit exceeded'));

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toContain('Too many');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-044: should return 400 when enroll fails', async () => {
      const { mockClient } = setupSupabaseMock({
        enrollResults: [{ data: null, error: { message: 'Enrollment failed' } }],
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Enrollment failed');
    });

    it('TC-AUTH-045: should handle max verified factors by cleaning oldest', async () => {
      const { mockClient, unenroll } = setupSupabaseMock({
        enrollResults: [
          { data: null, error: { message: 'Maximum number of verified factors reached' } },
          { data: defaultEnrollData, error: null },
        ],
        listFactorsResult: {
          data: {
            totp: [
              { id: 'old-factor', status: 'verified', created_at: '2024-01-01' },
              { id: 'new-factor', status: 'verified', created_at: '2024-06-01' },
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
      expect(unenroll).toHaveBeenCalledWith({ factorId: 'old-factor' });
    });

    it('TC-AUTH-046: should return 500 when no data returned', async () => {
      const { mockClient } = setupSupabaseMock({
        enrollResults: [{ data: null, error: null }],
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toBe('Failed to enroll MFA factor');
    });
  });
});
