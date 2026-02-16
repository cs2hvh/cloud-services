import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingCredits } from '@/lib/billing/credits';

vi.mock('@/lib/supabase/server');

describe('BillingCredits', () => {
  let mockSupabase: any;

  function createChainMock(result: { data?: any; error?: any }) {
    return {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(result),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(result),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue(result),
        }),
      }),
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  async function setupMock(result: { data?: any; error?: any }) {
    mockSupabase = createChainMock(result);
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(mockSupabase as any);
  }

  // ============================================
  // getBalance
  // ============================================
  describe('getBalance', () => {
    it('should return balance for valid user', async () => {
      await setupMock({ data: { credit_balance: 100 }, error: null });

      const balance = await BillingCredits.getBalance('user-1');
      expect(balance).toBe(100);
    });

    it('should return 0 when user has no credits (error)', async () => {
      await setupMock({ data: null, error: { message: 'not found' } });

      const balance = await BillingCredits.getBalance('user-missing');
      expect(balance).toBe(0);
    });

    it('should return 0 when credit_balance is null', async () => {
      await setupMock({ data: { credit_balance: null }, error: null });

      const balance = await BillingCredits.getBalance('user-null');
      expect(balance).toBe(0);
    });
  });

  // ============================================
  // hasSufficientBalance
  // ============================================
  describe('hasSufficientBalance', () => {
    it('should return true when balance >= required', async () => {
      await setupMock({ data: { credit_balance: 50 }, error: null });

      const result = await BillingCredits.hasSufficientBalance('user-1', 50);
      expect(result).toBe(true);
    });

    it('should return false when balance < required', async () => {
      await setupMock({ data: { credit_balance: 10 }, error: null });

      const result = await BillingCredits.hasSufficientBalance('user-1', 50);
      expect(result).toBe(false);
    });

    it('should handle zero balance', async () => {
      await setupMock({ data: { credit_balance: 0 }, error: null });

      const result = await BillingCredits.hasSufficientBalance('user-1', 1);
      expect(result).toBe(false);
    });

    it('should handle zero required amount', async () => {
      await setupMock({ data: { credit_balance: 0 }, error: null });

      const result = await BillingCredits.hasSufficientBalance('user-1', 0);
      expect(result).toBe(true);
    });
  });

  // ============================================
  // deduct
  // ============================================
  describe('deduct', () => {
    // deduct() calls createServiceClient() FIRST for itself (update chain),
    // then internally calls getBalance() which calls createServiceClient() AGAIN (select chain).
    // So: call 1 = deduct's own supabase (for update), call 2 = getBalance's supabase (for select).

    it('should deduct correct amount', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      let callCount = 0;
      vi.mocked(createServiceClient).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // deduct's own supabase — used for update later
          return createChainMock({ data: { credit_balance: 80 }, error: null }) as any;
        }
        // getBalance's supabase — returns current balance
        return createChainMock({ data: { credit_balance: 100 }, error: null }) as any;
      });

      const result = await BillingCredits.deduct('user-1', 20);
      expect(result).toBe(80);
    });

    it('should throw on insufficient balance', async () => {
      await setupMock({ data: { credit_balance: 5 }, error: null });

      await expect(BillingCredits.deduct('user-1', 50)).rejects.toThrow('Insufficient balance');
    });

    it('should handle exact balance deduction', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      let callCount = 0;
      vi.mocked(createServiceClient).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // deduct's own supabase — for update
          return createChainMock({ data: { credit_balance: 0 }, error: null }) as any;
        }
        // getBalance — returns exactly 25
        return createChainMock({ data: { credit_balance: 25 }, error: null }) as any;
      });

      const result = await BillingCredits.deduct('user-1', 25);
      expect(result).toBe(0);
    });

    it('should throw on Supabase update error', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      let callCount = 0;
      vi.mocked(createServiceClient).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // deduct's own supabase — update will fail
          return createChainMock({ data: null, error: { message: 'update failed' } }) as any;
        }
        // getBalance — returns sufficient balance
        return createChainMock({ data: { credit_balance: 100 }, error: null }) as any;
      });

      await expect(BillingCredits.deduct('user-1', 10)).rejects.toThrow('Credit deduction failed');
    });
  });

  // ============================================
  // addActiveKubernetes
  // ============================================
  describe('addActiveKubernetes', () => {
    it('should insert correct record', async () => {
      await setupMock({ error: null });

      await expect(
        BillingCredits.addActiveKubernetes({
          userId: 'user-1',
          serviceId: 'k8s-123',
          hourlyRate: 0.05,
        })
      ).resolves.toBeUndefined();
    });

    it('should throw on insert error', async () => {
      await setupMock({ error: { message: 'duplicate key' } });

      await expect(
        BillingCredits.addActiveKubernetes({
          userId: 'user-1',
          serviceId: 'k8s-123',
          hourlyRate: 0.05,
        })
      ).rejects.toThrow('Failed to insert active_kubernetes');
    });
  });
});
