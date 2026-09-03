//@ts-nocheck
// destroyServer used to log a failed billing close and hard-delete the servers
// row anyway. billing.active_compute is keyed by billing_service_id and has no
// foreign key back to servers, so the meter kept accruing every cron tick with
// nothing left to trace it to — five were found running that way, one at
// $120/hr since June. The row now survives a failed close so the meter stays
// findable and re-closable.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { destroyServer } from '@/lib/services/compute/server-lifecycle';

vi.mock('@/lib/supabase/server');
vi.mock('@/config/billing-flow');
vi.mock('@/lib/billing/credits');
vi.mock('@/lib/proxmox-utils', () => ({ removeHostRoute: vi.fn(), addHostRoute: vi.fn() }));
vi.mock('@/lib/proxmox/on-demand-vmac', () => ({ releaseVmacForIp: vi.fn(), isRoutedPool: () => false }));
vi.mock('@/lib/services/compute/providers/linode/client', () => ({ deleteLinodeInstance: vi.fn() }));
// For the tests that run the REAL closeActiveBilling behind the module mock:
// the v2 meter and the credit ledger it must never touch.
vi.mock('@/lib/billing/meters', () => ({
  openMeter: vi.fn().mockResolvedValue(undefined),
  closeMeter: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/supabase/queries/billing', () => ({
  Billing: { deduct: vi.fn(), save_transaction: vi.fn(), move_credit: vi.fn() },
}));

const SERVER = {
  id: 42, vmid: null, node: null, ip: '1.2.3.4', location: 'us-ord',
  owner_id: 'user-1', status: 'running',
  billing_service_id: 'svc-abc', provider: 'linode', linode_id: 111,
};

const deleted: number[] = [];
const updates: Array<Record<string, unknown>> = [];

function mockDb(server: unknown = SERVER) {
  return import('@/lib/supabase/server').then(({ createWorkerClient }) => {
    vi.mocked(createWorkerClient).mockResolvedValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: server, error: null }) }) }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: () => Promise.resolve({ error: null }) };
        },
        delete: () => ({
          eq: (_c: string, id: number) => { deleted.push(id ?? 42); return Promise.resolve({ error: null }); },
        }),
      }),
    } as never);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deleted.length = 0;
  updates.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('destroyServer — billing settlement gates row deletion', () => {
  it('deletes the row once billing has settled', async () => {
    const { closeActiveBilling } = await import('@/config/billing-flow');
    vi.mocked(closeActiveBilling).mockResolvedValue(undefined as never);
    await mockDb();

    const res = await destroyServer(42);

    expect(res.success).toBe(true);
    expect(deleted.length).toBe(1);
  });

  it('keeps the row when the billing close throws', async () => {
    // The regression: the meter is keyed by billing_service_id, so deleting
    // the row here is what stranded it.
    const { closeActiveBilling } = await import('@/config/billing-flow');
    vi.mocked(closeActiveBilling).mockRejectedValue(new Error('deduct failed'));
    await mockDb();

    const res = await destroyServer(42);

    expect(deleted.length).toBe(0);
    // Still a success for the caller — the resource really is gone.
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/billing could not be settled/i);
  });

  it('still marks the kept row destroyed so it leaves every list and quota', async () => {
    const { closeActiveBilling } = await import('@/config/billing-flow');
    vi.mocked(closeActiveBilling).mockRejectedValue(new Error('deduct failed'));
    await mockDb();

    await destroyServer(42);

    expect(updates.some((u) => u.status === 'destroyed')).toBe(true);
    expect(updates.some((u) => u.billing_end)).toBe(true);
  });

  it('deletes the row when there is no meter to strand', async () => {
    // No billing_service_id means nothing in active_compute is keyed to this
    // server, so there is nothing that could be left behind.
    await mockDb({ ...SERVER, billing_service_id: null });

    const res = await destroyServer(42);

    expect(res.success).toBe(true);
    expect(deleted.length).toBe(1);
  });

  it('closes billing against the right service before deleting', async () => {
    const { closeActiveBilling } = await import('@/config/billing-flow');
    vi.mocked(closeActiveBilling).mockResolvedValue(undefined as never);
    await mockDb();

    await destroyServer(42);

    expect(closeActiveBilling).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', serviceId: 'svc-abc', serviceType: 'compute' })
    );
  });
});

// The v1 "final prorated charge" was a double charge of the whole lifetime
// (see closeActiveBilling in config/billing-flow.ts). These run the REAL
// closeActiveBilling behind the module mock so the contract is checked from
// destroyServer down: the v1 row is closed, the v2 meter is closed, and
// nothing is deducted.
describe('destroyServer — the real closeActiveBilling never deducts and always closes the meter', () => {
  async function useRealCloseActiveBilling() {
    const actual = await vi.importActual<typeof import('@/config/billing-flow')>('@/config/billing-flow');
    const { closeActiveBilling } = await import('@/config/billing-flow');
    vi.mocked(closeActiveBilling).mockImplementation(actual.closeActiveBilling);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  }

  afterEach(async () => {
    const { closeActiveBilling } = await import('@/config/billing-flow');
    vi.mocked(closeActiveBilling).mockReset();
  });

  it('closes the compute meter and deducts nothing', async () => {
    await useRealCloseActiveBilling();
    const { BillingCredits } = await import('@/lib/billing/credits');
    const { closeMeter } = await import('@/lib/billing/meters');
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(BillingCredits.closeActiveCompute).mockResolvedValue(0.5); // what v1 would have charged
    await mockDb();

    const res = await destroyServer(42);

    expect(res.success).toBe(true);
    expect(BillingCredits.closeActiveCompute).toHaveBeenCalledWith({ serviceId: 'svc-abc' });
    expect(closeMeter).toHaveBeenCalledTimes(1);
    expect(closeMeter).toHaveBeenCalledWith('compute', 'svc-abc');
    expect(Billing.deduct).not.toHaveBeenCalled();
    expect(Billing.save_transaction).not.toHaveBeenCalled();
    expect(Billing.move_credit).not.toHaveBeenCalled();
    expect(deleted.length).toBe(1);
  });

  it('a throwing v1 close still closes the meter, does not throw, and lets the row go', async () => {
    await useRealCloseActiveBilling();
    const { BillingCredits } = await import('@/lib/billing/credits');
    const { closeMeter } = await import('@/lib/billing/meters');
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(BillingCredits.closeActiveCompute).mockRejectedValue(new Error('active_compute read failed'));
    await mockDb();

    const res = await destroyServer(42);

    // closeActiveBilling swallows the v1 failure so the meter still closes;
    // a meter that outlives its resource is what charged one customer $4,629.91.
    expect(closeMeter).toHaveBeenCalledWith('compute', 'svc-abc');
    expect(Billing.deduct).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.message).toBeUndefined();
    expect(deleted.length).toBe(1);
  });
});
