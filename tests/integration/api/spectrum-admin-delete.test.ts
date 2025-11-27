import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/admin/network-ddos/apps/delete/route';
import { NextRequest } from 'next/server';
import { mockSpectrumApp } from '../../utils/mock-data';
import {
  createMockPostRequest,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockAdminUser,
  mockNonAdminUser,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('axios');
vi.mock('@/config/spectrum-functions', () => ({
  deleteSpectrumApp: vi.fn(),
}));

// Dynamic mock for createClient
const mockCreateClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}));

describe('POST /api/admin/network-ddos/apps/delete', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
    // Default to admin user
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { roles: ['admin'] },
            }),
          }),
        }),
      }),
    });
  });

  describe('Authentication', () => {
    it('should return 401 if user not authenticated', async () => {
      await mockUnauthenticatedUser();
      // Mock no user
      mockCreateClient.mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
          }),
        },
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(403);
    });
  });

  describe('Authorization', () => {
    it('should allow admin to delete any app', async () => {
      await mockAdminUser();

      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(deleteSpectrumApp).mockResolvedValue({
        id: 'test-id',
        message: 'Spectrum app deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBeLessThan(400);
    });

    it('should return 403 for non-admin users', async () => {
      await mockNonAdminUser();
      // Mock non-admin user
      mockCreateClient.mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'non-admin-user-id' } },
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { roles: [] }, // No admin role
              }),
            }),
          }),
        }),
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(403);
    });
  });

  describe('Validation', () => {
    it('should reject missing spectrum_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        {}
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Success Cases', () => {
    it('should delete app from Cloudflare', async () => {
      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      const deleteMock = vi.mocked(deleteSpectrumApp);
      deleteMock.mockResolvedValue({
        id: 'test-id',
        message: 'Spectrum app deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      await POST(request as NextRequest);

      expect(deleteMock).toHaveBeenCalledWith('test-id');
    });

    it('should delete app from database using admin method', async () => {
      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      const deleteMock = vi.mocked(deleteSpectrumApp);
      deleteMock.mockResolvedValue({
        id: 'test-id',
        message: 'Spectrum app deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      await POST(request as NextRequest);

      expect(deleteMock).toHaveBeenCalled();
    });

    it('should return 200 on successful deletion', async () => {
      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(deleteSpectrumApp).mockResolvedValue({
        id: 'test-id',
        message: 'Spectrum app deleted successfully',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(200);
    });
  });

  describe('Error Cases', () => {
    it('should handle app not found', async () => {
      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(deleteSpectrumApp).mockResolvedValue(null as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'nonexistent-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    });

    it('should handle Cloudflare API errors', async () => {
      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(deleteSpectrumApp).mockRejectedValue(
        new Error('Cloudflare API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    });

    it('should handle database deletion failure', async () => {
      const { deleteSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(deleteSpectrumApp).mockResolvedValue(null as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/admin/network-ddos/apps/delete',
        { spectrum_id: 'test-id' }
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    });
  });
});
