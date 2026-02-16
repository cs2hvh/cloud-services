//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/platform-apps/domains/add/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';
import { mockUser } from '../../utils/mock-data';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/services/custom-domain');
vi.mock('@/lib/cooldown/userbased');

describe('POST /api/services/platform-apps/domains/add', () => {
  const testUrl = 'http://localhost:3000/api/services/platform-apps/domains/add';
  const validAppId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { limitByUser } = await import('@/lib/cooldown/userbased');
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  });

  async function mockAppOwned() {
    const { Platform_Apps } = await import('@/lib/supabase/queries');
    vi.mocked(Platform_Apps.get).mockResolvedValue({
      success: true,
      data: { user_id: mockUser.id, name: 'my-app' },
    } as any);
  }

  // ============================================
  // Auth Tests
  // ============================================
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

  // ============================================
  // Validation Tests
  // ============================================
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

  // ============================================
  // App Not Found / Authorization
  // ============================================
  describe('Authorization', () => {
    it('TC-PA-124: should return 404 when app does not exist', async () => {
      await mockAuthenticatedUser();

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: false,
      } as any);

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('not found');
    });

    it('TC-PA-125: should return 403 for non-owner', async () => {
      await mockAuthenticatedUser();

      const { Platform_Apps } = await import('@/lib/supabase/queries');
      vi.mocked(Platform_Apps.get).mockResolvedValue({
        success: true,
        data: { user_id: 'other-user', name: 'my-app' },
      } as any);

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toContain('denied');
    });
  });

  // ============================================
  // Domain Limit
  // ============================================
  describe('Domain Limit', () => {
    it('TC-PA-126: should return 403 when 5 domains already exist', async () => {
      await mockAuthenticatedUser();
      await mockAppOwned();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.listDomains).mockResolvedValue(
        Array(5).fill({ domain: 'test.com' }) as any
      );

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'new-domain.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toContain('limit reached');
    });
  });

  // ============================================
  // Success
  // ============================================
  describe('Success', () => {
    it('TC-PA-127: should add domain successfully', async () => {
      await mockAuthenticatedUser();
      await mockAppOwned();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.listDomains).mockResolvedValue([] as any);
      vi.mocked(CustomDomainService.addDomain).mockResolvedValue({
        success: true,
        domain: { id: 'domain-1', domain: 'example.com' },
        verification_instructions: 'Add TXT record',
      } as any);

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.message).toContain('added successfully');
    });

    it('TC-PA-128: should return 400 when addDomain fails', async () => {
      await mockAuthenticatedUser();
      await mockAppOwned();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.listDomains).mockResolvedValue([] as any);
      vi.mocked(CustomDomainService.addDomain).mockResolvedValue({
        success: false,
        error: 'Domain already in use',
      } as any);

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'taken.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('already in use');
    });
  });

  // ============================================
  // Rate Limiting
  // ============================================
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
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe('Too Many Requests');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-PA-130: should return 500 on unexpected error', async () => {
      await mockAuthenticatedUser();
      await mockAppOwned();

      const { CustomDomainService } = await import('@/lib/services/custom-domain');
      vi.mocked(CustomDomainService.listDomains).mockRejectedValue(new Error('Service down'));

      const request = createMockPostRequest(testUrl, {
        app_id: validAppId,
        domain: 'example.com',
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 500);

      expect(data.error).toContain('Service down');
    });
  });
});
