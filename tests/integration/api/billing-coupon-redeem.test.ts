//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/billing/coupons/redeem/route';
import { expectResponseStatus } from '../../utils/test-helpers';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/queries/promocodes');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/billing/coupons/redeem', () => {
  const testUrl = 'http://localhost:3000/api/billing/coupons/redeem';

  function createMockRequest(body: any) {
    return new Request(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  function setupSupabaseMock(options: { user?: any } = {}) {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: 'user' in options ? options.user : { id: 'user-123', email: 'test@example.com' },
      },
    });

    return { mockClient: { auth: { getUser } } };
  }

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-BILL-020: should redeem valid coupon', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Promocodes } = await import('@/lib/supabase/queries/promocodes');
      vi.mocked(Promocodes.redeem).mockResolvedValue({
        success: true,
        balance: 150,
        amount: 50,
      } as any);

      const request = createMockRequest({ code: 'SAVE50' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.balance).toBe(150);
      expect(data.amount).toBe(50);
      expect(data.message).toContain('$50');
    });

    it('TC-BILL-021: should uppercase and trim the code before redeeming', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Promocodes } = await import('@/lib/supabase/queries/promocodes');
      vi.mocked(Promocodes.redeem).mockResolvedValue({
        success: true,
        balance: 100,
        amount: 25,
      } as any);

      const request = createMockRequest({ code: '  save25  ' });
      await POST(request);

      expect(Promocodes.redeem).toHaveBeenCalledWith('SAVE25', 'user-123', 'test@example.com');
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-BILL-022: should reject missing code', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({});
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('required');
    });

    it('TC-BILL-023: should reject empty code', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ code: '' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('required');
    });
  });

  // ============================================
  // Invalid Coupon Cases
  // ============================================
  describe('Invalid Coupon', () => {
    it('TC-BILL-024: should reject non-existent coupon', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Promocodes } = await import('@/lib/supabase/queries/promocodes');
      vi.mocked(Promocodes.redeem).mockResolvedValue({
        success: false,
        error: 'Invalid promo code',
      } as any);

      const request = createMockRequest({ code: 'INVALID' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('Invalid promo code');
    });

    it('TC-BILL-025: should reject already redeemed coupon', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Promocodes } = await import('@/lib/supabase/queries/promocodes');
      vi.mocked(Promocodes.redeem).mockResolvedValue({
        success: false,
        error: 'You have already redeemed this coupon',
      } as any);

      const request = createMockRequest({ code: 'USED' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('already redeemed');
    });

    it('TC-BILL-026: should reject expired coupon', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Promocodes } = await import('@/lib/supabase/queries/promocodes');
      vi.mocked(Promocodes.redeem).mockResolvedValue({
        success: false,
        error: 'This coupon has expired',
      } as any);

      const request = createMockRequest({ code: 'EXPIRED' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 400);

      expect(data.message).toContain('expired');
    });
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('TC-BILL-027: should return 401 for unauthenticated user', async () => {
      const { mockClient } = setupSupabaseMock({ user: null });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ code: 'SAVE50' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });

    it('TC-BILL-028: should return 401 for user without email', async () => {
      const { mockClient } = setupSupabaseMock({
        user: { id: 'user-123', email: null },
      });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const request = createMockRequest({ code: 'SAVE50' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 401);

      expect(data.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-BILL-029: should return 429 when rate limited', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({ allowed: false, retryAfterSec: 30 });

      const request = createMockRequest({ code: 'SAVE50' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-BILL-030: should return 500 on unexpected error', async () => {
      const { mockClient } = setupSupabaseMock({});

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const { Promocodes } = await import('@/lib/supabase/queries/promocodes');
      vi.mocked(Promocodes.redeem).mockRejectedValue(new Error('DB connection failed'));

      const request = createMockRequest({ code: 'SAVE50' });
      const response = await POST(request);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('DB connection failed');
    });
  });
});
