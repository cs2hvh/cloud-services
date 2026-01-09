import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/spectrum/apps/get/route';
import { NextRequest } from 'next/server';
import { mockSpectrumApp } from '../../utils/mock-data';
import {
  createMockPostRequest,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
  mockRateLimitDeny,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/auth');
vi.mock('@/config/spectrum-functions');
vi.mock('@/config/functions');
vi.mock('@/lib/cooldown/userbased');
vi.mock('axios');
vi.mock('@/app/api/admin/network-ddos/apps/delete/route', () => ({
  checkAdminAuth: vi.fn().mockResolvedValue({ authorized: false, user: null }),
}));

describe('POST /api/services/spectrum/apps/get', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
    await mockRateLimitAllow();

    // Mock requireAdmin to return non-admin by default
    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false });

    // Mock getSpectrumApp
    const { getSpectrumApp } = await import('@/config/spectrum-functions');
    vi.mocked(getSpectrumApp).mockResolvedValue({
      cloudflare: mockSpectrumApp,
      local: mockSpectrumApp,
      decryptedIp: 'decrypted-dns.hostguardian.net',
    });
  });

  describe('Authentication', () => {
    it('should return 401 if user not authenticated', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBeLessThan(300);
    });

    it('should return 429 when rate limit exceeded', async () => {
      await mockRateLimitDeny(20);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(429);
    });
  });

  describe('Validation', () => {
    it('should reject missing app_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should reject invalid app_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: '', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Authorization', () => {
    it('should allow owner to view their app', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(200);
    });

    it('should prevent non-owner from viewing app', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440001' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(403);
    });
  });

  describe('Success Cases', () => {
    // it('should return app data with decrypted DNS name', async () => {
    //   const { Spectrum_Apps } = await import('@/lib/supabase/queries');
    //   vi.mocked(Spectrum_Apps.get).mockResolvedValue({
    //     success: true,
    //     data: mockSpectrumApp,
    //   });

    //   const { Encryption } = await import('@/config/functions');
    //   const decryptMock = vi.mocked(Encryption.decrypt);
    //   decryptMock.mockReturnValue('decrypted-dns.hostguardian.net');

    //   const axios = await import('axios');
    //   const getMock = vi.spyOn(axios.default, 'get');
    //   getMock.mockResolvedValue({
    //     status: 200,
    //     data: {
    //       success: true,
    //       result: mockSpectrumApp,
    //     },
    //   } as any);

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/get',
    //     { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
    //   );

    //   const response = await POST(request as NextRequest);
    //   const data = await response.json();

    //   expect(response.status).toBe(200);
    //   expect(decryptMock).toHaveBeenCalled();
    // });

    it('should include all app properties', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      const data = await response.json();

      expect(data.cloudflare).toBeDefined();
      expect(data.local).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    // it('should handle app not found', async () => {
    //   const { Spectrum_Apps } = await import('@/lib/supabase/queries');
    //   vi.mocked(Spectrum_Apps.get).mockResolvedValue({
    //     success: false,
    //     error: 'App not found',
    //   });

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/get',
    //     { app_id: 'nonexistent-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
    //   );

    //   const response = await POST(request as NextRequest);
    //   expect(response.status).toBe(400);
    // });

    // it('should handle decryption errors', async () => {
    //   const { Spectrum_Apps } = await import('@/lib/supabase/queries');
    //   vi.mocked(Spectrum_Apps.get).mockResolvedValue({
    //     success: true,
    //     data: mockSpectrumApp,
    //   });

    //   const { Encryption } = await import('@/config/functions');
    //   vi.mocked(Encryption.decrypt).mockImplementation(() => {
    //     throw new Error('Decryption failed');
    //   });

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/get',
    //     { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
    //   );

    //   const response = await POST(request as NextRequest);
    //   expect(response.status).toBe(400);
    // });

    it('should handle database query errors', async () => {
      const { getSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(getSpectrumApp).mockRejectedValue(
        new Error('Database error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/get',
        { app_id: 'test-id', user_id: '550e8400-e29b-41d4-a716-446655440000' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });
});
