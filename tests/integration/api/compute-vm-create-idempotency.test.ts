//@ts-nocheck
// The VM create route reserves the caller's idempotency key for the full 24h
// TTL before it knows the request is even valid, and it used to settle that key
// only on success. So one rejected deploy left the key stuck "in-progress" and
// every retry came back 409 "This request is already being processed" — nothing
// created, and no way out but reloading the page for a fresh key.
//
// These tests pin the release: every failure exit drops the reservation, the
// success path still records the result for replay, and an unhandled throw is
// answered in JSON rather than escaping to Next's HTML error page (the source
// of the `Unexpected token '<', "<!DOCTYPE"...` toast the customer saw).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/services/compute/vms/create/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/lib/idempotency');
vi.mock('@/lib/admin/platform-settings');
vi.mock('@/lib/services/compute/providers/linode/create');
vi.mock('@/lib/redis', () => ({ redis: { set: vi.fn(), del: vi.fn(), get: vi.fn() } }));

const USER = { id: 'user-1', email: 'ved@example.com' };

const reserve = vi.fn();
const complete = vi.fn();
const abort = vi.fn();

function request(body: Record<string, unknown>, key = 'idem-key-1') {
  return new NextRequest('http://localhost/api/services/compute/vms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

/** A valid-looking Linode order — enough to reach the provider dispatch. */
const ORDER = {
  region: 'us-dallas',
  type: 'g6-nanode-1',
  image: 'linode/ubuntu22.04',
  label: 'sg-test2',
  root_pass: 'A1234@qwertyZ',
};

beforeEach(async () => {
  vi.clearAllMocks();

  reserve.mockResolvedValue(true);
  complete.mockResolvedValue(undefined);
  abort.mockResolvedValue(undefined);

  const { checkIdempotency, getIdempotencyKey } = await import('@/lib/idempotency');
  vi.mocked(getIdempotencyKey).mockImplementation(
    (headers: Headers) => headers.get('idempotency-key')
  );
  vi.mocked(checkIdempotency).mockResolvedValue({
    status: 'new',
    reserve,
    complete,
    abort,
  } as never);

  const { createClient, createWorkerClient } = await import('@/lib/supabase/server');
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
  } as never);
  // Per-user VM count check — well under the cap.
  vi.mocked(createWorkerClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({ in: () => Promise.resolve({ count: 0, error: null }) }),
      }),
    }),
  } as never);

  const { limitByUser, releaseUserLimit } = await import('@/lib/cooldown/userbased');
  vi.mocked(limitByUser).mockResolvedValue({ allowed: true } as never);
  vi.mocked(releaseUserLimit).mockResolvedValue(undefined as never);

  const { getComputeProvider } = await import('@/lib/admin/platform-settings');
  vi.mocked(getComputeProvider).mockResolvedValue('linode' as never);
});

describe('POST /api/services/compute/vms/create — idempotency release', () => {
  it('releases the reservation when the request is rejected before dispatch', async () => {
    // No region — the earliest validation exit in the handler.
    const res = await POST(request({ ...ORDER, region: '' }));

    expect(res.status).toBe(400);
    expect(reserve).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });

  it('releases the reservation when the provider rejects the order', async () => {
    const { handleLinodeCreate } = await import('@/lib/services/compute/providers/linode/create');
    vi.mocked(handleLinodeCreate).mockResolvedValue(
      Response.json({ ok: false, error: 'Unknown plan: g6-nanode-1' }, { status: 400 })
    );

    const res = await POST(request(ORDER));

    expect(res.status).toBe(400);
    expect(abort).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });

  it('releases the reservation when the provider fails with a 5xx', async () => {
    const { handleLinodeCreate } = await import('@/lib/services/compute/providers/linode/create');
    vi.mocked(handleLinodeCreate).mockResolvedValue(
      Response.json({ ok: false, error: 'Unable to reserve your server.' }, { status: 500 })
    );

    const res = await POST(request(ORDER));

    expect(res.status).toBe(500);
    expect(abort).toHaveBeenCalledOnce();
  });

  it('releases the reservation when the handler throws, and answers in JSON', async () => {
    // This is the case that produced the HTML error page: an unhandled throw
    // skipped every release path AND gave the dashboard a <!DOCTYPE body to
    // JSON.parse.
    const { handleLinodeCreate } = await import('@/lib/services/compute/providers/linode/create');
    vi.mocked(handleLinodeCreate).mockRejectedValue(new Error('socket hang up'));

    const res = await POST(request(ORDER));

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toMatchObject({ ok: false });
    expect(abort).toHaveBeenCalledOnce();
  });

  it('keeps the reservation on success so a retry replays instead of double-provisioning', async () => {
    const { handleLinodeCreate } = await import('@/lib/services/compute/providers/linode/create');
    vi.mocked(handleLinodeCreate).mockResolvedValue(
      Response.json({ ok: true, serverId: 42 }, { status: 200 })
    );

    const res = await POST(request(ORDER));

    expect(res.status).toBe(200);
    expect(abort).not.toHaveBeenCalled();
  });

  it('still answers 409 while a genuine in-flight request holds the key', async () => {
    // The 409 itself is correct behaviour — the bug was that it outlived the
    // request that caused it. A live reservation must still be honoured.
    const { checkIdempotency } = await import('@/lib/idempotency');
    vi.mocked(checkIdempotency).mockResolvedValue({
      status: 'in-progress',
      retryAfter: 5,
    } as never);

    const res = await POST(request(ORDER));

    expect(res.status).toBe(409);
    expect(abort).not.toHaveBeenCalled();
  });

  it('replays the stored result for a key that already completed', async () => {
    const { checkIdempotency } = await import('@/lib/idempotency');
    vi.mocked(checkIdempotency).mockResolvedValue({
      status: 'completed',
      data: { ok: true, serverId: 42 },
    } as never);

    const res = await POST(request(ORDER));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, serverId: 42 });
  });

  it('refunds the rate-limit slot on rejection without touching it on a 429', async () => {
    const { releaseUserLimit } = await import('@/lib/cooldown/userbased');
    const { handleLinodeCreate } = await import('@/lib/services/compute/providers/linode/create');

    vi.mocked(handleLinodeCreate).mockResolvedValue(
      Response.json({ ok: false, error: 'bad password' }, { status: 400 })
    );
    await POST(request(ORDER));
    expect(releaseUserLimit).toHaveBeenCalledOnce();

    vi.mocked(releaseUserLimit).mockClear();
    vi.mocked(handleLinodeCreate).mockResolvedValue(
      Response.json({ ok: false, error: 'slow down' }, { status: 429 })
    );
    await POST(request(ORDER));
    expect(releaseUserLimit).not.toHaveBeenCalled();
  });
});
