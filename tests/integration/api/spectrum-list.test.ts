import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/services/spectrum/apps/list/route';
import { NextRequest } from 'next/server';
import { mockSpectrumApp } from '../../utils/mock-data';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
  mockRateLimitDeny,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/config/functions');
vi.mock('@/lib/cooldown/userbased');
vi.mock('axios');
vi.mock('@/config/spectrum-functions', () => ({
  listSpectrumApps: vi.fn(),
}));

describe('GET /api/services/spectrum/apps/list', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockAuthenticatedUser();
    await mockRateLimitAllow();
  });

  describe('Authentication', () => {
    it('should return 401 if user not authenticated', async () => {
      await mockUnauthenticatedUser();

      const response = await GET();
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      vi.mocked(listSpectrumApps).mockResolvedValue({
        cloudflare: [mockSpectrumApp as any],
        local: [mockSpectrumApp as any],
      });

      const response = await GET();
      expect(response.status).toBeLessThan(300);
    });

    it('should return 429 when rate limit exceeded', async () => {
      await mockRateLimitDeny(15);

      const response = await GET();
      expect(response.status).toBe(429);
    });
  });

  describe('Success Cases', () => {
    it('should return empty array when user has no apps', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      vi.mocked(listSpectrumApps).mockResolvedValue({
        cloudflare: [],
        local: [],
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cloudflare).toEqual([]);
      expect(data.local).toEqual([]);
    });

    it('should return list of user apps with decrypted DNS names', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      vi.mocked(listSpectrumApps).mockResolvedValue({
        cloudflare: [mockSpectrumApp as any, { ...mockSpectrumApp, id: 'app-2' }],
        local: [mockSpectrumApp as any, { ...mockSpectrumApp, id: 'app-2' }],
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cloudflare).toHaveLength(2);
      expect(data.local).toHaveLength(2);
    });

    it('should include all app properties in list', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      vi.mocked(listSpectrumApps).mockResolvedValue({
        cloudflare: [mockSpectrumApp as any],
        local: [mockSpectrumApp as any],
      });

      const response = await GET();
      const data = await response.json();

      expect(data.cloudflare[0]).toHaveProperty('id');
      expect(data.cloudflare[0]).toHaveProperty('protocol');
      expect(data.cloudflare[0]).toHaveProperty('origin_direct');
      expect(data.cloudflare[0]).toHaveProperty('dns');
    });

    it('should only return apps owned by authenticated user', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      const listMock = vi.mocked(listSpectrumApps);
      listMock.mockResolvedValue({
        cloudflare: [mockSpectrumApp as any],
        local: [mockSpectrumApp as any],
      });

      await GET();

      expect(listMock).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('Error Cases', () => {
    it('should handle database query errors', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      vi.mocked(listSpectrumApps).mockRejectedValue(
        new Error('Database error')
      );

      const response = await GET();
      expect(response.status).toBe(500);
    });

    it('should handle partial decryption failures', async () => {
      const { listSpectrumApps } = await import('@/config/spectrum-functions');
      vi.mocked(listSpectrumApps).mockRejectedValue(
        new Error('Decryption failed')
      );

      const response = await GET();
      expect(response.status).toBe(500);
    });
  });
});
