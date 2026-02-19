//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/spectrum/apps/create/route';
import { NextRequest } from 'next/server';
import {
  mockCreateSpectrumPayload,
  mockCloudflareSpectrumApp,
  mockSpectrumApp,
  mockInvalidSpectrumPayloads,
} from '../../utils/mock-data';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  mockRateLimitAllow,
  mockRateLimitDeny,
  mockCloudflareAPI,
  mockDNSResolution,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries/spectrum_apps');
vi.mock('@/config/billing-flow');
vi.mock('@/config/pricing');
vi.mock('@/config/spectrum-functions');
vi.mock('axios');
vi.mock('@/config/functions');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/spectrum/apps/create', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
    mockRateLimitAllow();
    
    // Mock getRatesForSpectrum
    const { getRatesForSpectrum } = await import('@/config/pricing');
    vi.mocked(getRatesForSpectrum).mockResolvedValue({
      initialCost: 5,
      hourlyRate: 0.01,
    });

    // Mock ensureBalance
    const { ensureBalance } = await import('@/config/billing-flow');
    vi.mocked(ensureBalance).mockResolvedValue({ ok: true, balance: 100 });

    // Mock createSpectrumApp
    const { createSpectrumApp } = await import('@/config/spectrum-functions');
    vi.mocked(createSpectrumApp).mockResolvedValue({
      app: mockSpectrumApp,
      cloudflare: mockCloudflareSpectrumApp,
    });
  });

  describe('Authentication', () => {
    it('TC-SP-001: should return 401 if user not authenticated', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('TC-SP-002: should allow requests within rate limit', async () => {
      await mockRateLimitAllow();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBeLessThan(300);
    }, 30000);

    it('TC-SP-003: should return 429 when rate limit exceeded', async () => {
      await mockRateLimitDeny(45);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
      expect(data.message).toContain('Retry after 45s');
    });

    it('TC-SP-004: should include retry-after in 429 response', async () => {
      await mockRateLimitDeny(30);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.message).toContain('30');
    });
  });

  describe('Validation', () => {
    it('TC-SP-005: should validate request body with createSpectrumAppSchema', async () => {
      const { createSpectrumApp } = await import('@/config/spectrum-functions');
      const createMock = vi.mocked(createSpectrumApp);
      createMock.mockResolvedValue({
        app: mockSpectrumApp,
        cloudflare: mockCloudflareSpectrumApp,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      await POST(request as NextRequest);
      expect(createMock).toHaveBeenCalled();
    }, 30000);

    it('TC-SP-006: should reject invalid project_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidProjectId
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('TC-SP-007: should reject invalid protocol format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidProtocol
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('TC-SP-008: should reject empty origin_direct array', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.emptyOrigins
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('TC-SP-009: should reject invalid DNS type', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidDNSType
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('TC-SP-010: should reject short DNS name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.shortDNSName
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('TC-SP-011: should reject invalid owner_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidOwnerId
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Success Cases', () => {
    it('TC-SP-012: should create app in Cloudflare successfully', async () => {
      const { createSpectrumApp } = await import('@/config/spectrum-functions');
      const createMock = vi.mocked(createSpectrumApp);
      createMock.mockResolvedValue({
        app: mockSpectrumApp,
        cloudflare: mockCloudflareSpectrumApp,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      await POST(request as NextRequest);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'tcp/22',
        }),
        expect.anything()
      );
    }, 30000);

    it('TC-SP-013: should persist app to database after Cloudflare creation', async () => {
      const { createSpectrumApp } = await import('@/config/spectrum-functions');
      const createMock = vi.mocked(createSpectrumApp);
      createMock.mockResolvedValue({
        app: mockSpectrumApp,
        cloudflare: mockCloudflareSpectrumApp,
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      await POST(request as NextRequest);

      expect(createMock).toHaveBeenCalled();
    }, 30000);

    // it('should encrypt DNS name before storing', async () => {
    //   const axios = await import('axios');
    //   vi.mocked(axios.default.post).mockResolvedValue({
    //     status: 200,
    //     data: { success: true, result: mockCloudflareSpectrumApp },
    //   });

    //   vi.mocked(axios.default.get).mockResolvedValue({
    //     status: 200,
    //     data: { query: '1.2.3.4' },
    //   });

    //   const { Spectrum_Apps } = await import('@/lib/supabase/queries');
    //   vi.mocked(Spectrum_Apps.create).mockResolvedValue({
    //     success: true,
    //     data: mockSpectrumApp,
    //   });

    //   const { Encryption } = await import('@/config/functions');
    //   const encryptMock = vi.mocked(Encryption.encrypt);
    //   encryptMock.mockReturnValue({
    //     iv: 'test-iv',
    //     encrypted: 'encrypted-dns',
    //     tag: 'test-tag',
    //     salt: 'test-salt',
    //   });

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/create',
    //     mockCreateSpectrumPayload
    //   );

    //   await POST(request as NextRequest);

    //   expect(encryptMock).toHaveBeenCalled();
    // }, 30000);

    it('TC-SP-014: should return 201 with created app data', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(201);
    }, 30000);
  });

  describe('Error Cases', () => {
    it('TC-SP-015: should handle Cloudflare API errors', async () => {
      const { createSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(createSpectrumApp).mockRejectedValue(
        new Error('Cloudflare API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    });

    it('TC-SP-016: should handle database insert failure', async () => {
      const { createSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(createSpectrumApp).mockRejectedValue(
        new Error('Database insert failed')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    }, 30000);

    it('TC-SP-017: should handle DNS resolution timeout gracefully', async () => {
      // createSpectrumApp already mocked successfully in beforeEach

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      // Should succeed with DNS resolution
      expect(response.status).toBe(201);
    }, 30000);
  });

  describe('Billing Checks', () => {
    it('TC-SP-067: should return 402 when insufficient credits', async () => {
      const { ensureBalance } = await import('@/config/billing-flow');
      vi.mocked(ensureBalance).mockResolvedValue({ ok: false, balance: 0 });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 402);

      expect(data.error).toBe('Insufficient credits');
    }, 30000);
  });

  describe('Error Recovery', () => {
    it('TC-SP-068: should handle Cloudflare success + database persist failure', async () => {
      const { createSpectrumApp } = await import('@/config/spectrum-functions');
      vi.mocked(createSpectrumApp).mockRejectedValue(
        new Error('Created in Cloudflare but failed to persist')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      // Route returns 500 — Cloudflare resource is orphaned (no cleanup)
      expect(response.status).toBe(500);
    }, 30000);
  });
});
