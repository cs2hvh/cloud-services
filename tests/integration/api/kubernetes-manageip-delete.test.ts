//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/manageip/delete/route';
import { createMockPostRequest, expectResponseStatus } from '../../utils/test-helpers';

vi.mock('axios');

describe('POST /api/services/kubernetes/manageip/delete', () => {
  const testUrl = 'http://localhost:3000/api/services/kubernetes/manageip/delete';

  beforeEach(async () => {
    vi.clearAllMocks();

    const axios = (await import('axios')).default;
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
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

      expect(data.error).toContain('Network error');
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
});
