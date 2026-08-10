//@ts-nocheck
// destroyServer used to log a failed billing close and hard-delete the servers
// row anyway. billing.active_compute is keyed by billing_service_id and has no
// foreign key back to servers, so the meter kept accruing every cron tick with
// nothing left to trace it to — five were found running that way, one at
// $120/hr since June. The row now survives a failed close so the meter stays
// findable and re-closable.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { destroyServer } from '@/lib/services/compute/server-lifecycle';

vi.mock('@/lib/supabase/server');
vi.mock('@/config/billing-flow');
vi.mock('@/lib/billing/credits');
vi.mock('@/lib/proxmox-utils', () => ({ removeHostRoute: vi.fn(), addHostRoute: vi.fn() }));
vi.mock('@/lib/proxmox/on-demand-vmac', () => ({ releaseVmacForIp: vi.fn(), isRoutedPool: () => false }));
vi.mock('@/lib/services/compute/providers/linode/client', () => ({ deleteLinodeInstance: vi.fn() }));

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
