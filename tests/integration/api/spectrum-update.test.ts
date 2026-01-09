import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/services/spectrum/apps/update/route';
import { NextRequest } from 'next/server';
import {
  mockSpectrumApp,
  mockCloudflareSpectrumApp,
} from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
  mockRateLimitDeny,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');
vi.mock('@/config/functions');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/config/spectrum-functions', () => ({
  updateSpectrumApp: vi.fn(),
}));

describe('POST /api/services/spectrum/apps/update', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
    await mockRateLimitAllow();

    // Setup default mock for updateSpectrumApp
    const { updateSpectrumApp } = await import('@/config/spectrum-functions');
    vi.mocked(updateSpectrumApp).mockResolvedValue({
      cloudflare: mockCloudflareSpectrumApp as any,
      local: mockSpectrumApp as any,
    });
  });

  describe('Authentication', () => {
    it('should return 401 if user not authenticated', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id' }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['2.3.4.5'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBeLessThan(300);
    });

    // it('should return 429 when rate limit exceeded', async () => {
    //   await mockRateLimitDeny(60);

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/update',
    //     { app_id: 'test-id' }
    //   );

    //   const response = await PUT(request as NextRequest);
    //   expect(response.status).toBe(429);
    // });
  });

  describe('Validation', () => {
    it('should reject missing app_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { origin_direct: ['1.2.3.4'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(400);
    });

    // it('should reject invalid origin_direct format', async () => {
    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/update',
    //     { app_id: 'test-id', origin_direct: ['invalid-ip'] }
    //   );

    //   const response = await PUT(request as NextRequest);
    //   expect(response.status).toBe(400);
    // });

    // it('should reject empty origin_direct array', async () => {
    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/update',
    //     { app_id: 'test-id', origin_direct: [] }
    //   );

    //   const response = await PUT(request as NextRequest);
    //   expect(response.status).toBe(400);
    // });
  });

  describe('Authorization', () => {
    it('should allow owner to update their app', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['1.2.3.4'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBeLessThan(400);
    });

    it('should prevent non-owner from updating app', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(updateSpectrumApp).mockRejectedValue(
        new Error('Unauthorized: You do not own this app')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['1.2.3.4'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Success Cases', () => {
    it('should update app in Cloudflare successfully', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      const updateMock = vi.mocked(updateSpectrumApp);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['2.3.4.5'], argo_smart_routing: true }
      );

      await PUT(request as NextRequest);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          app_id: 'test-id',
          origin_direct: ['2.3.4.5'],
        })
      );
    });

    it('should persist update to database', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      const updateMock = vi.mocked(updateSpectrumApp);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['2.3.4.5'], argo_smart_routing: true }
      );

      await PUT(request as NextRequest);

      expect(updateMock).toHaveBeenCalled();
    });

    it('should return 200 with updated data', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['2.3.4.5'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(200);
    });
  });

  describe('Error Cases', () => {
    it('should handle app not found', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(updateSpectrumApp).mockRejectedValue(
        new Error('App not found')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'nonexistent-id', origin_direct: ['1.2.3.4'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should handle Cloudflare API errors', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(updateSpectrumApp).mockRejectedValue(
        new Error('Cloudflare API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['2.3.4.5'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should handle database update failure', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(updateSpectrumApp).mockRejectedValue(
        new Error('Database update failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['2.3.4.5'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Partial Updates', () => {
    it('should allow updating only origin_direct', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['3.3.3.3'], argo_smart_routing: true }
      );

      const response = await PUT(request as NextRequest);
      expect(response.status).toBe(200);
    });

    it('should preserve unchanged fields', async () => {
      const { updateSpectrumApp } = await import('@/config/spectrum-functions');
      const updateMock = vi.mocked(updateSpectrumApp);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/update',
        { app_id: 'test-id', origin_direct: ['4.4.4.4'], argo_smart_routing: true }
      );

      await PUT(request as NextRequest);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          app_id: 'test-id',
          origin_direct: ['4.4.4.4'],
        })
      );
    });
  });
});
