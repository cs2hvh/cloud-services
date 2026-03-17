//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/domains/route';
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

describe('POST /api/domains', () => {
  const testUrl = 'http://localhost:3000/api/domains';
  const validAppId = '550e8400-e29b-41d4-a716-446655440000';
  let domainService: {
    listDomains: ReturnType<typeof vi.fn>;
    addDomain: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 });

    const { getDomainService } = await import('@/lib/domain-service');
    domainService = {
      listDomains: vi.fn().mockResolvedValue([]),
      addDomain: vi.fn().mockResolvedValue({
        domain: { id: 'domain-1', domain: 'example.com' },
        verification_instructions: {
          record_type: 'TXT',
          record_name: 'galaxyhvh-verify.example.com',
          record_value: 'verify_token',
          ttl: 300,
        },
      }),
    };
    vi.mocked(getDomainService).mockReturnValue(domainService as any);
  });

  describe('Authentication', () => {
    it('TC-PA-120: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  describe('Validation', () => {
    it('TC-PA-121: should return 400 when app_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, { domain: 'example.com' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-PA-122: should return 400 when domain is too short', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'ab',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-PA-123: should return 400 when app_id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: 'not-uuid',
        domain: 'example.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Authorization', () => {
    it('TC-PA-124: should return 404 when app does not exist', async () => {
      await mockAuthenticatedUser();

      domainService.listDomains.mockRejectedValue(
        new DomainServiceError({ code: DOMAIN_ERROR_CODES.APP_NOT_FOUND, message: 'App not found' })
      );

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 404);
    });

    it('TC-PA-125: should return 403 for non-owner', async () => {
      await mockAuthenticatedUser();

      domainService.listDomains.mockRejectedValue(
        new DomainServiceError({ code: DOMAIN_ERROR_CODES.FORBIDDEN, message: 'Access denied' })
      );

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 403);
    });
  });

  describe('Domain Limit', () => {
    it('TC-PA-126: should return 403 when 5 domains already exist', async () => {
      await mockAuthenticatedUser();

      domainService.listDomains.mockResolvedValue(Array(5).fill({ id: 'd', domain: 'test.com' }));

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'new-domain.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 403);
    });
  });

  describe('Success', () => {
    it('TC-PA-127: should add domain successfully', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 201);

      expect(data.success).toBe(true);
      expect(data.verification_instructions.record_type).toBe('TXT');
    });

    it('TC-PA-128: should return mapped error when addDomain fails', async () => {
      await mockAuthenticatedUser();

      domainService.addDomain.mockRejectedValue(
        new DomainServiceError({
          code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
          message: 'This domain is already in use by another app',
        })
      );

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'taken.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 409);
    });
  });

  describe('Rate Limiting', () => {
    it('TC-PA-129: should return 429 when rate limited', async () => {
      await mockAuthenticatedUser();

      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({ allowed: false, retryAfterSec: 30 });

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 429);
    });
  });

  describe('Error Handling', () => {
    it('TC-PA-130: should return 500 on unexpected error', async () => {
      await mockAuthenticatedUser();

      domainService.listDomains.mockRejectedValue(new Error('Service down'));

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      await expectResponseStatus(response, 500);
    });
  });
});
