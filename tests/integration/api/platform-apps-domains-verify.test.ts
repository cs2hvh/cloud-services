//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/domains/[id]/verify/route';
import { DOMAIN_ERROR_CODES, DomainServiceError } from '@/lib/domain-service/core/errors';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/domain-service');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/domains/[id]/verify', () => {
  const testUrl = 'http://localhost:3000/api/domains/verify';
  const validDomainId = '550e8400-e29b-41d4-a716-446655440000';
  let domainService: {
    verifyDomain: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 });

    const { getDomainService } = await import('@/lib/domain-service');
    domainService = {
      verifyDomain: vi.fn().mockResolvedValue({
        id: validDomainId,
        domain: 'example.com',
        status: 'verified',
      }),
    };
    vi.mocked(getDomainService).mockReturnValue(domainService as any);
  });

  describe('Authentication', () => {
    it('TC-PA-131: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any, {
        params: Promise.resolve({ id: validDomainId }),
      } as any);
      await expectResponseStatus(response, 401);
    });
  });

  describe('Validation', () => {
    it('TC-PA-132: should return 400 when route id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any, {
        params: Promise.resolve({ id: 'not-a-uuid' }),
      } as any);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Rate Limiting', () => {
    it('TC-PA-134: should return 429 when rate limited', async () => {
      await mockAuthenticatedUser();

      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({ allowed: false, retryAfterSec: 20 });

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any, {
        params: Promise.resolve({ id: validDomainId }),
      } as any);
      await expectResponseStatus(response, 429);
    });
  });

  describe('Verification', () => {
    it('TC-PA-135: should return verified: false when domain not verified', async () => {
      await mockAuthenticatedUser();

      domainService.verifyDomain.mockRejectedValue(
        new DomainServiceError({
          code: DOMAIN_ERROR_CODES.DOMAIN_NOT_VERIFIED,
          message: 'Verification token not found in DNS TXT records',
          details: { records_found: [] },
        })
      );

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any, {
        params: Promise.resolve({ id: validDomainId }),
      } as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(false);
      expect(data.verified).toBe(false);
    });

    it('TC-PA-136: should return verified: true when domain verified', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any, {
        params: Promise.resolve({ id: validDomainId }),
      } as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.verified).toBe(true);
      expect(data.domain).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('TC-PA-137: should return 500 on unexpected error', async () => {
      await mockAuthenticatedUser();

      domainService.verifyDomain.mockRejectedValue(new Error('Service unavailable'));

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any, {
        params: Promise.resolve({ id: validDomainId }),
      } as any);
      await expectResponseStatus(response, 500);
    });
  });
});
