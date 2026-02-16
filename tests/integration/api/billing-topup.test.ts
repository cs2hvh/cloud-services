import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/billing/topup/route';
import { expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/billing');

describe('POST /api/billing/topup', () => {
  const testUrl = 'http://localhost:3000/api/billing/topup';

  function createMockRequest(body: any) {
    return new Request(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupSupabaseMock(options: { userId?: string | null }) {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: options.userId !== null ? { id: options.userId ?? 'user-123' } : null },
    });

    return { mockClient: { auth: { getUser } } };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-BILL-001: should topup successfully with valid amount', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Billing } = await import('@/lib/supabase/queries/billing');
      vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 150 } as any);

      const request = createMockRequest({ amount: 50 });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 200);

      expect(data.ok).toBe(true);
      expect(data.balance).toBe(150);
      expect(Billing.topup).toHaveBeenCalledWith('user-123', 50);
    });

    it('TC-BILL-002: should accept decimal amounts', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Billing } = await import('@/lib/supabase/queries/billing');
      vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 25.50 } as any);

      const request = createMockRequest({ amount: 25.50 });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 200);

      expect(data.ok).toBe(true);
      expect(data.balance).toBe(25.50);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-BILL-003: should reject negative amount', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ amount: -10 });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid amount');
    });

    it('TC-BILL-004: should reject zero amount', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ amount: 0 });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid amount');
    });

    it('TC-BILL-005: should reject non-numeric amount', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ amount: 'fifty' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid amount');
    });

    it('TC-BILL-006: should reject Infinity', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ amount: Infinity });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid amount');
    });

    it('TC-BILL-007: should reject NaN', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ amount: NaN });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Invalid amount');
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-BILL-008: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({ userId: null });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ amount: 50 });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-BILL-009: should return 400 when Billing.topup fails', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Billing } = await import('@/lib/supabase/queries/billing');
      vi.mocked(Billing.topup).mockRejectedValue(new Error('DB error'));

      const request = createMockRequest({ amount: 50 });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe('Bad request');
    });
  });
});
