//@ts-nocheck
// When the provider has created a cluster but our insert fails, the cluster is
// live, billable and owned by nobody. This path fires seconds after create, and
// DigitalOcean rejects a delete while a cluster is still `creating` — so a
// single attempt would nearly always fail and leave the orphan behind. That is
// not hypothetical: a create during verification orphaned a real cluster.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

import { clusterLifecycleOperations } from '@/lib/services/database/operations/cluster-lifecycle-operations';

vi.mock('axios');
vi.mock('@/lib/supabase/queries/database_clusters');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/config/billing-flow');
vi.mock('@/config/pricing');
vi.mock('@/lib/audit', () => ({ AuditLogService: { create: vi.fn() }, getAuditContext: () => ({}) }));
vi.mock('@/lib/notifications', () => ({
  NotificationService: { create: vi.fn() }, createServiceNotification: vi.fn(),
}));

const CLUSTER_ID = 'orphan-abc-123';

function providerCreatesThenInsertFails() {
  vi.mocked(axios.post).mockResolvedValue({
    status: 201,
    data: { database: { id: CLUSTER_ID, name: 'x', engine: 'mysql', version: '8.4', num_nodes: 1,
      connection: {}, private_connection: {}, status: 'creating', size: 'db-s-1vcpu-1gb', region: 'blr1' } },
  } as never);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';

  const { getRatesForDatabase } = await import('@/config/pricing');
  vi.mocked(getRatesForDatabase).mockResolvedValue({ initialCost: 0, hourlyRate: 0.02 });
  const { reserveProvision, releaseProvision } = await import('@/config/billing-flow');
  vi.mocked(reserveProvision).mockResolvedValue({ ok: true, balance: 100, reservation: {} });
  vi.mocked(releaseProvision).mockResolvedValue(undefined);
  const { Database_Clusters } = await import('@/lib/supabase/queries/database_clusters');
  vi.mocked(Database_Clusters.create).mockResolvedValue({ success: false, error: 'insert failed' });
});

afterEach(() => vi.useRealTimers());

async function runCreate() {
  providerCreatesThenInsertFails();
  const p = clusterLifecycleOperations.createCluster(
    { name: 'x', engine: 'mysql', version: '8.4', num_nodes: 1, size: 'db-s-1vcpu-1gb',
      plan_id: 'p', region: 'blr1', project_id: 'proj', owner_id: 'user' } as never,
    {} as never
  );
  await vi.runAllTimersAsync();
  return p;
}

describe('orphan cluster cleanup', () => {
  it('deletes the provider cluster when our insert fails', async () => {
    vi.mocked(axios.delete).mockResolvedValue({ status: 204 } as never);

    const res = await runCreate();

    expect(res.success).toBe(false);
    expect(axios.delete).toHaveBeenCalledWith(
      expect.stringContaining(CLUSTER_ID), expect.anything()
    );
  });

  it('retries while the provider still reports the cluster as creating', async () => {
    // DigitalOcean rejects a delete mid-create — the exact window this runs in.
    vi.mocked(axios.delete)
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ status: 204 } as never);

    await runCreate();

    expect(vi.mocked(axios.delete).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stops immediately on 404 — already gone', async () => {
    vi.mocked(axios.delete).mockRejectedValue({ response: { status: 404 } });

    await runCreate();

    expect(vi.mocked(axios.delete).mock.calls.length).toBe(1);
  });

  it('logs the cluster id and a runnable command when every attempt fails', async () => {
    vi.mocked(axios.delete).mockRejectedValue({ response: { status: 500 } });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runCreate();

    const shouted = err.mock.calls.flat().join(' ');
    expect(shouted).toContain('ORPHAN CLEANUP FAILED');
    expect(shouted).toContain(CLUSTER_ID);
    // A human has to be able to act on this without reading the source.
    expect(shouted).toMatch(/DELETE https:\/\/api\.digitalocean\.com/);
  });

  it('gives the reservation back — nothing was provisioned for the customer', async () => {
    vi.mocked(axios.delete).mockResolvedValue({ status: 204 } as never);
    const { releaseProvision } = await import('@/config/billing-flow');

    await runCreate();

    expect(releaseProvision).toHaveBeenCalled();
  });
});
