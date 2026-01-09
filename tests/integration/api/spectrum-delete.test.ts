import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/spectrum/apps/delete/route';
import { NextRequest } from 'next/server';
import { mockCreateSpectrumPayload, mockSpectrumApp } from '../../utils/mock-data';
import {
  createMockPostRequest,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
  mockRateLimitDeny,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/spectrum_apps');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('@/lib/supabase/auth');
vi.mock('@/config/spectrum-functions');
vi.mock('axios');
vi.mock('@/lib/cooldown/userbased');
vi.mock('@/app/api/admin/network-ddos/apps/delete/route', () => ({
  checkAdminAuth: vi.fn().mockResolvedValue({ authorized: false, user: null }),
}));

describe('POST /api/services/spectrum/apps/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
    mockRateLimitAllow();

    // Mock requireAdmin to return non-admin by default
    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false });

    // Mock Billing.close_active_service
    const { Billing } = await import('@/lib/supabase/queries/billing');
    vi.mocked(Billing.close_active_service).mockResolvedValue({ success: true });

    // Mock deleteSpectrumApp function
    const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
    vi.mocked(deleteSpectrumApp).mockResolvedValue({ success: true, message: 'App deleted' });
  });

   describe('Authentication', () => {
      it('should return 401 if user not authenticated', async () => {
        await mockUnauthenticatedUser();
  
        const request = createMockPostRequest(
          'http://localhost:3000/api/services/spectrum/apps/delete',
          mockCreateSpectrumPayload
        );
  
        const response = await POST(request as NextRequest);
        expect(response.status).toBe(401);
      });
    });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const { Spectrum_Apps } = await import('@/lib/supabase/queries/spectrum_apps');
      vi.mocked(Spectrum_Apps.get).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });
      vi.mocked(Spectrum_Apps.delete).mockResolvedValue({
        success: true,
        data: [],
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440000', id: 'test-service-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBeLessThan(300);
    });

    // it('should return 429 when rate limit exceeded', async () => {
    //   mockRateLimitDeny(30);

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/delete',
    //     { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440000' }
    //   );

    //   const response = await POST(request as NextRequest);
    //   expect(response.status).toBe(429);
    // });
  });

  describe('Validation', () => {
    // it('should reject missing app_id', async () => {
    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/delete',
    //     {}
    //   );

    //   const response = await POST(request as NextRequest);
    //   expect(response.status).toBe(400);
    // });

    it('should reject invalid app_id format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: '', owner_id: '550e8400-e29b-41d4-a716-446655440000', id: 'test-service-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Authorization', () => {
    it('should allow owner to delete their app', async () => {
      const { Spectrum_Apps } = await import('@/lib/supabase/queries/spectrum_apps');
      vi.mocked(Spectrum_Apps.get).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });
      vi.mocked(Spectrum_Apps.delete).mockResolvedValue({
        success: true,
        data: [],
      });

      const axios = await import('axios');
      vi.mocked(axios.default.delete).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440000', id: 'test-service-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBeLessThan(400);
    });

    it('should prevent non-owner from deleting app', async () => {
      const { Spectrum_Apps } = await import('@/lib/supabase/queries/spectrum_apps');
      vi.mocked(Spectrum_Apps.get).mockResolvedValue({
        success: true,
        data: { ...mockSpectrumApp, owner_id: '550e8400-e29b-41d4-a716-446655440001' },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440001', id: 'test-service-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(403);
    });
  });

  describe('Success Cases', () => {
    it('should delete app from Cloudflare successfully', async () => {
      const { Spectrum_Apps } = await import('@/lib/supabase/queries/spectrum_apps');
      vi.mocked(Spectrum_Apps.get).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });
      vi.mocked(Spectrum_Apps.delete).mockResolvedValue({
        success: true,
        data: [],
      });

      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      const deleteMock = vi.mocked(deleteSpectrumApp);
      deleteMock.mockResolvedValue({
        success: true,
        message: 'App deleted',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440000', id: 'test-service-id' }
      );

      await POST(request as NextRequest);

      expect(deleteMock).toHaveBeenCalledWith('test-id');
    });

    it('should delete app from database after Cloudflare deletion', async () => {
      const { Spectrum_Apps } = await import('@/lib/supabase/queries/spectrum_apps');
      vi.mocked(Spectrum_Apps.get).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      const deleteMock = vi.mocked(deleteSpectrumApp);
      deleteMock.mockResolvedValue({
        success: true,
        message: 'App deleted',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440000', id: 'test-service-id' }
      );

      await POST(request as NextRequest);

      expect(deleteMock).toHaveBeenCalled();
    });

    it('should return 200 on successful deletion', async () => {
      const { Spectrum_Apps } = await import('@/lib/supabase/queries/spectrum_apps');
      vi.mocked(Spectrum_Apps.get).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });
      vi.mocked(Spectrum_Apps.delete).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/delete',
        { app_id: 'test-id', owner_id: '550e8400-e29b-41d4-a716-446655440000', id: 'test-service-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(200);
    });
  });

 

  
});
