import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/route';
import { NextRequest } from 'next/server';
import {
  mockCreateKubernetesPayload,
  mockInvalidKubernetesPayloads,
  mockKubernetesUser,
} from '../../utils/mock-data-kubernetes';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/queue');
vi.mock('@/lib/rate-limit');
vi.mock('@/config/functions');

describe('POST /api/services/kubernetes/clusters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Tests', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      // Mock rate limiter to pass
      const { rateLimit } = await import('@/lib/rate-limit');
      vi.mocked(rateLimit).mockReturnValue({
        check: vi.fn().mockResolvedValue(undefined),
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock rate limiter
      const { rateLimit } = await import('@/lib/rate-limit');
      vi.mocked(rateLimit).mockReturnValue({
        check: vi.fn().mockResolvedValue(undefined),
      } as any);

      // Mock requireAdmin
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      // Mock provisionQueue.add()
      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      // Mock Projects.add_log
      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });

  describe('Success Cases', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      // Mock rate limiter
      const { rateLimit } = await import('@/lib/rate-limit');
      vi.mocked(rateLimit).mockReturnValue({
        check: vi.fn().mockResolvedValue(undefined),
      } as any);

      // Mock requireAdmin for non-admin user
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);
    });

    it('should create cluster with valid payload', async () => {
      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      expect(data.clusterId).toBeDefined();
      expect(data.job).toBeDefined();
      expect(data.status).toBe('QUEUED');
    });

    it('should generate unique cluster_id', async () => {
      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      // Verify UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(data.clusterId).toMatch(uuidRegex);
    });

    it('should queue cluster provisioning job', async () => {
      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-456' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(mockAdd).toHaveBeenCalledWith(
        'provision',
        expect.objectContaining({
          clusterId: expect.any(String),
          ...mockCreateKubernetesPayload,
          role: 'user',
        })
      );
    });

    it('should add activity log to project', async () => {
      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      const mockAddLog = vi.fn().mockResolvedValue(true);
      vi.mocked(Projects.add_log).mockImplementation(mockAddLog);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(mockAddLog).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: mockCreateKubernetesPayload.projectId,
          event: 'Kubernetes Create',
          text: expect.stringContaining(mockCreateKubernetesPayload.cluster.name),
        }),
        'user'
      );
    });

    it('should derive role correctly for regular user', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(mockAdd).toHaveBeenCalledWith(
        'provision',
        expect.objectContaining({
          role: 'user',
        })
      );
    });

    it('should derive role correctly for admin', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({
        ok: true,
        userId: mockKubernetesUser.id,
      } as any);

      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(mockAdd).toHaveBeenCalledWith(
        'provision',
        expect.objectContaining({
          role: 'admin',
        })
      );
    });

   
  });

  describe('Validation Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { rateLimit } = await import('@/lib/rate-limit');
      vi.mocked(rateLimit).mockReturnValue({
        check: vi.fn().mockResolvedValue(undefined),
      } as any);

      // Mock provisionQueue for validation tests (won't be called but needs to exist)
      const { provisionQueue } = await import('@/lib/queue');
      (provisionQueue as any).add = vi.fn().mockResolvedValue({ id: 'job-123' });
    });

   

    it('should reject missing required fields', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockInvalidKubernetesPayloads.missingRequiredFields
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    

    it('should reject invalid IP addresses', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockInvalidKubernetesPayloads.invalidPrivateIP
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject malformed JSON', async () => {
      const request = new Request(
        'http://localhost:3000/api/services/kubernetes/clusters',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid-json{',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid provider', async () => {
      const invalidPayload = {
        ...mockCreateKubernetesPayload,
        provider: 'invalid-provider',
      };

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        invalidPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should validate payload structure', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        { invalid: 'payload' }
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
      expect(data.error).toContain('Invalid payload');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { rateLimit } = await import('@/lib/rate-limit');
      const mockCheck = vi.fn().mockRejectedValue(new Error('Too many requests'));
      vi.mocked(rateLimit).mockReturnValue({
        check: mockCheck,
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 429);
    });

    it('should allow requests within rate limit', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

      const { rateLimit } = await import('@/lib/rate-limit');
      const mockCheck = vi.fn().mockResolvedValue(undefined);
      vi.mocked(rateLimit).mockReturnValue({
        check: mockCheck,
      } as any);

      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { provisionQueue } = await import('@/lib/queue');
      const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
      (provisionQueue as any).add = mockAdd;

      const { Projects } = await import('@/lib/supabase/queries');
      vi.mocked(Projects.add_log).mockResolvedValue(true);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);

      expect(mockCheck).toHaveBeenCalledWith(expect.anything(), 10);
    });
  });
});
