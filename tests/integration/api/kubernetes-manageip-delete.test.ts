//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/manageip/delete/route';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

vi.mock('axios');
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    getAll: vi.fn(() => []),
    has: vi.fn(),
  })),
}));
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');

// The route resolves droplet_id to a cluster the caller owns before deleting,
// so every test needs the ownership lookup to succeed. `ownedDroplets` is what
// the mocked clusters row claims to contain; a test that wants the
// not-your-node path empties it.
let ownedDroplets: number[] = [];

function mockClustersFor(droplets: number[]) {
  ownedDroplets = droplets;
}

describe('POST /api/services/kubernetes/manageip/delete', () => {
  const testUrl = 'http://localhost:3000/api/services/kubernetes/manageip/delete';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClustersFor([12345, 67890]);

    const axios = (await import('axios')).default;
    vi.mocked(axios.isAxiosError).mockReturnValue(false);

    // Mock authenticated user
    const { authenticateUser } = await import('@/lib/auth/server-auth');
    vi.mocked(authenticateUser).mockResolvedValue({
      authenticated: true,
      user: { id: 'test-user-id', email: 'test@example.com' },
      response: null,
    });

    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            neq: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'cluster-1',
                    control_plane: { droplet_id: ownedDroplets[0] ?? null },
                    workers: ownedDroplets
                      .slice(1)
                      .map((d) => ({ droplet_id: d })),
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    } as any);
  });

  // ============================================
  // Success Cases
  // ============================================
  describe('Success Cases', () => {
    it('TC-K8S-140: should delete droplet successfully', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(testUrl, { droplet_id: '12345' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.message).toContain('deleted success');
    });

    it('TC-K8S-141: should call DO API with correct droplet_id', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockResolvedValue({ status: 204 });

      const request = createMockPostRequest(testUrl, { droplet_id: '67890' });
      await POST(request as any);

      expect(axios.delete).toHaveBeenCalledWith(
        'https://api.digitalocean.com/v2/droplets/67890',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  // ============================================
  // DO API Error Cases
  // ============================================
  describe('DigitalOcean API Failures', () => {
    it('TC-K8S-142: should return 503 when DO returns non-204', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockResolvedValue({ status: 422 });

      const request = createMockPostRequest(testUrl, { droplet_id: '12345' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 503);

      expect(data.message).toContain('internal error');
    });

    it('TC-K8S-143: should return 400 on Axios error', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockRejectedValue(new Error('Network error'));

      const request = createMockPostRequest(testUrl, { droplet_id: '12345' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Failed to delete droplet');
    });

    it('TC-K8S-144: should return 400 on non-Error throw', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockRejectedValue('string error');

      const request = createMockPostRequest(testUrl, { droplet_id: '12345' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Unknown error');
    });
  });

  // ============================================
  // Authorization — the fault this route shipped with
  // ============================================
  describe('Ownership', () => {
    it('TC-K8S-145: refuses a droplet the caller does not own, without calling DO', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockResolvedValue({ status: 204 });

      // The caller owns 12345; they ask to delete someone else's 999999.
      mockClustersFor([12345]);

      const request = createMockPostRequest(testUrl, { droplet_id: '999999' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 404);

      // The point of the fix: DigitalOcean is never reached, so an
      // unauthorized delete cannot happen even if the id is valid.
      expect(axios.delete).not.toHaveBeenCalled();
    });

    it('TC-K8S-146: rejects a non-numeric droplet_id before any lookup', async () => {
      const axios = (await import('axios')).default;

      const request = createMockPostRequest(testUrl, {
        droplet_id: '../account',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);

      expect(axios.delete).not.toHaveBeenCalled();
    });

    it('TC-K8S-147: treats a failed ownership read as a refusal, not a pass', async () => {
      const axios = (await import('axios')).default;
      vi.mocked(axios.delete).mockResolvedValue({ status: 204 });

      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              neq: () =>
                Promise.resolve({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      } as any);

      const request = createMockPostRequest(testUrl, { droplet_id: '12345' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 503);

      expect(axios.delete).not.toHaveBeenCalled();
    });
  });
});
