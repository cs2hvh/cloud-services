import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Billing } from '@/lib/supabase/queries/billing';
import { closeMeter } from '@/lib/billing/meters';

vi.mock('@/lib/supabase/server');

// close_active_service closes the v2 meter before it touches the v1 row.
vi.mock('@/lib/billing/meters', () => ({
  closeMeter: vi.fn().mockResolvedValue(undefined),
}));

describe('Billing queries', () => {
  function schemaChainMock(result: { data?: any; error?: any }) {
    const single = vi.fn().mockResolvedValue(result);
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single, maybeSingle }),
      single,
    });
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single }),
        eq: vi.fn().mockResolvedValue(result),
      }),
    });
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    });

    return {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select,
          insert,
          update,
          delete: deleteFn,
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupMock(result: { data?: any; error?: any }) {
    const mock = schemaChainMock(result);
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(mock as any);
    return mock;
  }

  // ============================================
  // get_balance
  // ============================================
  describe('get_balance', () => {
    it('should return balance for valid user', async () => {
      await setupMock({ data: { credit_balance: 150 }, error: null });

      const balance = await Billing.get_balance('user-1');
      expect(balance).toBe(150);
    });

    it('should throw on a read error instead of reporting $0', async () => {
      // A balance that could not be read treated as $0 both blocks a funded
      // customer and lets a provisioning refund vanish.
      await setupMock({ data: null, error: { message: 'not found' } });

      await expect(Billing.get_balance('user-missing')).rejects.toThrow(
        'Balance read failed for user-missing: not found'
      );
    });

    it('should return 0 when the user has no credit row', async () => {
      // maybeSingle: no row is honestly $0.
      await setupMock({ data: null, error: null });

      const balance = await Billing.get_balance('user-missing');
      expect(balance).toBe(0);
    });
  });

  // ============================================
  // has_balance
  // ============================================
  describe('has_balance', () => {
    it('should return true when sufficient', async () => {
      await setupMock({ data: { credit_balance: 100 }, error: null });

      const result = await Billing.has_balance('user-1', 50);
      expect(result).toBe(true);
    });

    it('should return false when insufficient', async () => {
      await setupMock({ data: { credit_balance: 10 }, error: null });

      const result = await Billing.has_balance('user-1', 50);
      expect(result).toBe(false);
    });
  });

  // ============================================
  // topup
  // ============================================
  describe('topup', () => {
    it('should create new record when user has no existing credits', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const mock = schemaChainMock({ data: null, error: null });
      // Override select to return maybeSingle with null data first (no existing record)
      const schemaFrom = mock.schema().from();
      schemaFrom.select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });
      schemaFrom.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { credit_balance: 50 }, error: null }),
        }),
      });
      // Re-mock to return fresh schema each time
      vi.mocked(createServiceClient).mockResolvedValue({
        schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(schemaFrom) }),
      } as any);

      const result = await Billing.topup('user-new', 50);
      expect(result.credit_balance).toBe(50);
    });

    it('should add to existing balance', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const schemaFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { credit_balance: 100 }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { credit_balance: 150 }, error: null }),
            }),
          }),
        }),
      };
      vi.mocked(createServiceClient).mockResolvedValue({
        schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(schemaFrom) }),
      } as any);

      const result = await Billing.topup('user-1', 50);
      expect(result.credit_balance).toBe(150);
    });

    it('should throw on update error', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const schemaFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { credit_balance: 100 }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'update failed' } }),
            }),
          }),
        }),
      };
      vi.mocked(createServiceClient).mockResolvedValue({
        schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(schemaFrom) }),
      } as any);

      await expect(Billing.topup('user-1', 50)).rejects.toThrow('Top-up failed');
    });
  });

  // ============================================
  // deduct
  // ============================================
  describe('deduct', () => {
    it('should deduct amount from balance', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      let callCount = 0;
      vi.mocked(createServiceClient).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // deduct's own supabase — for update
          return schemaChainMock({ data: { credit_balance: 80 }, error: null }) as any;
        }
        // get_balance call — returns current balance
        return schemaChainMock({ data: { credit_balance: 100 }, error: null }) as any;
      });

      const result = await Billing.deduct('user-1', 20);
      expect(result).toBe(80);
    });

    it('should throw on insufficient balance', async () => {
      await setupMock({ data: { credit_balance: 5 }, error: null });

      await expect(Billing.deduct('user-1', 50)).rejects.toThrow('Insufficient balance');
    });
  });

  // ============================================
  // add_active_* methods
  // ============================================
  describe('add_active_kubernetes', () => {
    it('should insert active kubernetes record', async () => {
      await setupMock({ error: null });

      await expect(
        Billing.add_active_kubernetes({ userId: 'u1', serviceId: 'k8s-1', hourlyRate: 0.05 })
      ).resolves.toBeUndefined();
    });

    it('should throw on insert error', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      vi.mocked(createServiceClient).mockResolvedValue({
        schema: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
          }),
        }),
      } as any);

      await expect(
        Billing.add_active_kubernetes({ userId: 'u1', serviceId: 'k8s-1', hourlyRate: 0.05 })
      ).rejects.toThrow('Failed to insert active_kubernetes');
    });
  });

  describe('add_active_database', () => {
    it('should insert active database record', async () => {
      await setupMock({ error: null });

      await expect(
        Billing.add_active_database({ userId: 'u1', serviceId: 'db-1', hourlyRate: 0.1 })
      ).resolves.toBeUndefined();
    });
  });

  describe('add_active_platform_app', () => {
    it('should insert active platform app record', async () => {
      await setupMock({ error: null });

      await expect(
        Billing.add_active_platform_app({ userId: 'u1', serviceId: 'app-1', hourlyRate: 0.02 })
      ).resolves.toBeUndefined();
    });
  });

  // ============================================
  // _computeProratedCharge
  // ============================================
  describe('_computeProratedCharge', () => {
    it('should compute charge based on hourly rate and time', () => {
      const now = new Date('2026-02-15T12:00:00Z');
      const lastBilled = '2026-02-15T10:00:00Z'; // 2 hours ago

      const charge = Billing._computeProratedCharge(0.1, lastBilled, now);
      expect(charge).toBeCloseTo(0.2, 4);
    });

    it('should return 0 for zero hourly rate', () => {
      const charge = Billing._computeProratedCharge(0);
      expect(charge).toBe(0);
    });

    it('should return 0 for negative rate', () => {
      const charge = Billing._computeProratedCharge(-5);
      expect(charge).toBe(0);
    });

    it('should default to 1 hour when no lastBilledAt', () => {
      const charge = Billing._computeProratedCharge(0.5);
      expect(charge).toBeCloseTo(0.5, 4);
    });

    it('should handle string hourly rate', () => {
      const now = new Date('2026-02-15T13:00:00Z');
      const lastBilled = '2026-02-15T12:00:00Z';

      const charge = Billing._computeProratedCharge('0.25' as any, lastBilled, now);
      expect(charge).toBeCloseTo(0.25, 4);
    });

    it('should handle timestamp without timezone', () => {
      const now = new Date('2026-02-15T14:00:00Z');
      const lastBilled = '2026-02-15T12:00:00'; // no Z

      const charge = Billing._computeProratedCharge(0.1, lastBilled, now);
      expect(charge).toBeCloseTo(0.2, 4);
    });
  });

  // ============================================
  // close_active_service
  // ============================================
  describe('close_active_service', () => {
    it('should throw for unknown service type', async () => {
      await expect(
        Billing.close_active_service('unknown' as any, { userId: 'u1', serviceId: 's1' })
      ).rejects.toThrow('Unknown service type');
    });

    it('should return charged: 0 when no active row found', async () => {
      const { createServiceClient } = await import('@/lib/supabase/server');
      // The read chains .eq("service_id").eq("user_id") before maybeSingle().
      const selectChain: any = {
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      const deleteUserEq = vi.fn().mockResolvedValue({ error: null });
      const deleteServiceEq = vi.fn().mockReturnValue({ eq: deleteUserEq });
      const schemaFrom: any = {
        select: vi.fn().mockReturnValue(selectChain),
        delete: vi.fn().mockReturnValue({ eq: deleteServiceEq }),
      };
      vi.mocked(createServiceClient).mockResolvedValue({
        schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(schemaFrom) }),
      } as any);

      const result = await Billing.close_active_service('database', { userId: 'u1', serviceId: 's1' });
      expect(result).toEqual({ charged: 0, newBalance: null });
      // The v2 meter is closed whether or not a v1 row exists.
      expect(closeMeter).toHaveBeenCalledWith('database', 's1');
      // Stale-state cleanup still runs against the v1 table.
      expect(deleteServiceEq).toHaveBeenCalledWith('service_id', 's1');
      expect(deleteUserEq).toHaveBeenCalledWith('user_id', 'u1');
    });
  });
});
