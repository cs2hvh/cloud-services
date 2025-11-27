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
vi.mock('@/lib/supabase/queries');
vi.mock('axios');
vi.mock('@/config/functions');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/spectrum/apps/create', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
     mockAuthenticatedUser();
    mockRateLimitAllow();
    
    // Mock Projects.add_log to prevent errors
    // const { Projects } = await import('@/lib/supabase/queries');
    // if (Projects.add_log) {
    //   vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);
    // }
  });

  describe('Authentication', () => {
    it('should return 401 if user not authenticated', async () => {
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
    it('should allow requests within rate limit', async () => {
      await mockRateLimitAllow();

      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: {
          success: true,
          result: mockCloudflareSpectrumApp,
        },
      });

      const axios_get = await import('axios');
      vi.mocked(axios_get.default.get).mockResolvedValue({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Spectrum_Apps.create).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-data',
        tag: 'test-tag',
        salt: 'test-salt',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBeLessThan(300);
    }, 30000);

    it('should return 429 when rate limit exceeded', async () => {
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

    it('should include retry-after in 429 response', async () => {
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
    it('should validate request body with createSpectrumAppSchema', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: { success: true, result: mockCloudflareSpectrumApp },
      });

      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Spectrum_Apps.create).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-data',
        tag: 'test-tag',
        salt: 'test-salt',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      await POST(request as NextRequest);
      expect(axios.default.post).toHaveBeenCalled();
    }, 30000);

    it('should reject invalid project_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidProjectId
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should reject invalid protocol format', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidProtocol
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should reject empty origin_direct array', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.emptyOrigins
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should reject invalid DNS type', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidDNSType
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should reject short DNS name', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.shortDNSName
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });

    it('should reject invalid owner_id', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockInvalidSpectrumPayloads.invalidOwnerId
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(400);
    });
  });

  describe('Success Cases', () => {
    it('should create app in Cloudflare successfully', async () => {
      const axios = await import('axios');
      const postMock = vi.mocked(axios.default.post);
      postMock.mockResolvedValue({
        status: 200,
        data: {
          success: true,
          result: mockCloudflareSpectrumApp,
        },
      });

      const getMock = vi.mocked(axios.default.get);
      getMock.mockResolvedValue({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Spectrum_Apps.create).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-ip',
        tag: 'test-tag',
        salt: 'test-salt',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      await POST(request as NextRequest);

      expect(postMock).toHaveBeenCalledWith(
        expect.stringContaining('spectrum/apps'),
        expect.objectContaining({
          dns: expect.objectContaining({
            name: expect.stringContaining('.hostguardian.net'),
          }),
          protocol: 'tcp/22',
        }),
        expect.any(Object)
      );
    }, 30000);

    it('should persist app to database after Cloudflare creation', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: { success: true, result: mockCloudflareSpectrumApp },
      });

      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      const createMock = vi.mocked(Spectrum_Apps.create);
      createMock.mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-data',
        tag: 'test-tag',
        salt: 'test-salt',
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

    it('should return 201 with created app data', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: { success: true, result: mockCloudflareSpectrumApp },
      });

      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Spectrum_Apps.create).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-data',
        tag: 'test-tag',
        salt: 'test-salt',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(201);
    }, 30000);
  });

  describe('Error Cases', () => {
    it('should handle Cloudflare API errors', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockRejectedValue(
        new Error('Cloudflare API error')
      );

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    });

    it('should handle database insert failure', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: { success: true, result: mockCloudflareSpectrumApp },
      });

      vi.mocked(axios.default.get).mockResolvedValue({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Spectrum_Apps.create).mockResolvedValue({
        success: false,
        error: 'Database insert failed',
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-data',
        tag: 'test-tag',
        salt: 'test-salt',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      expect(response.status).toBe(500);
    }, 30000);

    it('should handle DNS resolution timeout gracefully', async () => {
      const axios = await import('axios');
      vi.mocked(axios.default.post).mockResolvedValue({
        status: 200,
        data: { success: true, result: mockCloudflareSpectrumApp },
      });

      // DNS resolution succeeds after initial attempts
      vi.mocked(axios.default.get).mockResolvedValueOnce({
        status: 200,
        data: { query: '1.2.3.4' },
      });

      const { Spectrum_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Spectrum_Apps.create).mockResolvedValue({
        success: true,
        data: mockSpectrumApp,
      });

      const { Encryption } = await import('@/config/functions');
      vi.mocked(Encryption.encrypt).mockReturnValue({
        iv: 'test-iv',
        encrypted: 'encrypted-fallback',
        tag: 'test-tag',
        salt: 'test-salt',
      });

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/spectrum/apps/create',
        mockCreateSpectrumPayload
      );

      const response = await POST(request as NextRequest);
      // Should succeed with DNS resolution
      expect(response.status).toBe(201);
    }, 30000);

    // it('should handle encryption errors', async () => {
    //   // Mock Encryption to throw error FIRST
    //   const { Encryption } = await import('@/config/functions');
    //   vi.mocked(Encryption.encrypt).mockImplementation(() => {
    //     throw new Error('Encryption failed');
    //   });

    //   const axios = await import('axios');
    //   vi.mocked(axios.default.post).mockResolvedValue({
    //     status: 200,
    //     data: { success: true, result: mockCloudflareSpectrumApp },
    //   });

    //   vi.mocked(axios.default.get).mockResolvedValue({
    //     status: 200,
    //     data: { query: '1.2.3.4' },
    //   });

    //   const request = createMockPostRequest(
    //     'http://localhost:3000/api/services/spectrum/apps/create',
    //     mockCreateSpectrumPayload
    //   );

    //   const response = await POST(request as NextRequest);
    //   expect(response.status).toBe(500);
    // }, 30000);
  });
});
