//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/domains/verify/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/services/custom-domain');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/platform-apps/domains/verify', () => {
  const testUrl = 'http://localhost:3000/api/services/platform-apps/domains/verify';
  const validDomainId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-PA-131: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, { domain_id: validDomainId });
      const response = await POST(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-PA-132: should return 400 when domain_id is missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });

    it('TC-PA-133: should return 400 when domain_id is invalid UUID', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, { domain_id: 'not-a-uuid' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 400);
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    it('TC-PA-134: should return 429 when rate limited', async () => {
      await mockAuthenticatedUser();

      const { limitByUser } = await import('@/lib/cooldown/userbased');
      vi.mocked(limitByUser).mockResolvedValue({ allowed: false, retryAfterSec: 20 });

      const request = createMockPostRequest(testUrl, { domain_id: validDomainId });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });

  // ============================================
  // Verification Results
  // ============================================
  describe('Verification', () => {
    it('TC-PA-135: should return verified: false when domain not verified', async () => {
      await mockAuthenticatedUser();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.verifyDomain).mockResolvedValue({
        verified: false,
        error: 'DNS records not found',
        records_found: [],
      } as any);

      const request = createMockPostRequest(testUrl, { domain_id: validDomainId });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(false);
      expect(data.verified).toBe(false);
      expect(data.error).toContain('DNS records not found');
    });

    it('TC-PA-136: should return verified: true when domain verified', async () => {
      await mockAuthenticatedUser();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.verifyDomain).mockResolvedValue({
        verified: true,
        records_found: [{ type: 'CNAME', value: 'proxy.example.com' }],
      } as any);
      vi.mocked(CustomDomainService.getDomain).mockResolvedValue({
        id: validDomainId,
        domain: 'example.com',
        verified: true,
      } as any);

      const request = createMockPostRequest(testUrl, { domain_id: validDomainId });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.verified).toBe(true);
      expect(data.domain).toBeDefined();
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-PA-137: should return 500 on unexpected error', async () => {
      await mockAuthenticatedUser();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.verifyDomain).mockRejectedValue(new Error('Service unavailable'));

      const request = createMockPostRequest(testUrl, { domain_id: validDomainId });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('Service unavailable');
    });
  });
});
