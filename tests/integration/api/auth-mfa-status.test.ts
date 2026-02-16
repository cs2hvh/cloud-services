import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');

import { GET } from '@/app/api/auth/mfa/status/route';

describe('GET /api/auth/mfa/status', () => {
  const testUrl = 'http://localhost:3000/api/auth/mfa/status';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockGetRequest(url: string) {
    return new Request(url, { method: 'GET' }) as unknown as NextRequest;
  }

  function setupSupabaseMock(options: {
    user?: any;
    userError?: any;
    aalResult?: { data?: any; error?: any };
    listFactorsResult?: { data?: any; error?: any };
  }) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.user ?? { id: 'user-123', email: 'test@example.com' } },
      error: options.userError ?? null,
    });

    const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue(
      options.aalResult ?? {
        data: { currentLevel: 'aal1', nextLevel: 'aal1' },
        error: null,
      }
    );

    const listFactors = vi.fn().mockResolvedValue(
      options.listFactorsResult ?? {
        data: {
          totp: [],
          phone: [],
        },
        error: null,
      }
    );

    const mockClient = {
      auth: {
        getUser,
        mfa: { getAuthenticatorAssuranceLevel, listFactors },
      },
    };

    return { mockClient, getUser, getAuthenticatorAssuranceLevel, listFactors };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-AUTH-060: should return MFA status with no factors', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockGetRequest(testUrl);
      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.currentLevel).toBe('aal1');
      expect(data.hasVerifiedFactor).toBe(false);
      expect(data.factorId).toBeNull();
      expect(data.factors).toEqual([]);
    });

    it('TC-AUTH-061: should return verified factor info', async () => {
      const { mockClient } = setupSupabaseMock({
        aalResult: {
          data: { currentLevel: 'aal2', nextLevel: 'aal2' },
          error: null,
        },
        listFactorsResult: {
          data: {
            totp: [{
              id: 'factor-123',
              status: 'verified',
              factor_type: 'totp',
              friendly_name: 'My TOTP',
              created_at: '2024-01-01T00:00:00Z',
            }],
            phone: [],
          },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.currentLevel).toBe('aal2');
      expect(data.hasVerifiedFactor).toBe(true);
      expect(data.factorId).toBe('factor-123');
      expect(data.factors).toHaveLength(1);
    });

    it('TC-AUTH-062: should distinguish verified vs unverified factors', async () => {
      const { mockClient } = setupSupabaseMock({
        listFactorsResult: {
          data: {
            totp: [
              { id: 'f1', status: 'unverified', factor_type: 'totp', friendly_name: null, created_at: '2024-01-01' },
              { id: 'f2', status: 'verified', factor_type: 'totp', friendly_name: 'My Factor', created_at: '2024-02-01' },
            ],
            phone: [],
          },
          error: null,
        },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 200);

      expect(data.hasVerifiedFactor).toBe(true);
      expect(data.factorId).toBe('f2');
      expect(data.factors).toHaveLength(2);
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-AUTH-063: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({
        user: null,
        userError: { message: 'Not authenticated' },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-AUTH-064: should return 400 when AAL check fails', async () => {
      const { mockClient } = setupSupabaseMock({
        aalResult: { data: null, error: { message: 'AAL check failed' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it('TC-AUTH-065: should return 400 when listFactors fails', async () => {
      const { mockClient } = setupSupabaseMock({
        listFactorsResult: { data: null, error: { message: 'List factors failed' } },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const response = await GET();
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });
  });
});
