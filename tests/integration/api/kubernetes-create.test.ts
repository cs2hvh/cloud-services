import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/route';
import { NextRequest } from 'next/server';
import {
  mockCreateKubernetesPayload,
  mockKubernetesUser,
} from '../../utils/mock-data-kubernetes';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock all dependencies before imports
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/queries/projects');
vi.mock('@/lib/supabase/queries/billing');
vi.mock('@/lib/rate-limit');
vi.mock('@/config/functions');
vi.mock('@/config/billing-flow');
vi.mock('@/config/pricing');

// Mock the queue module with a factory that doesn't require Redis
vi.mock('@/lib/queue', () => ({
  provisionQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
  },
}));

describe('POST /api/services/kubernetes/clusters', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock for rate limiter
    const { rateLimit } = await import('@/lib/rate-limit');
    vi.mocked(rateLimit).mockReturnValue({
      check: vi.fn().mockResolvedValue(undefined),
    } as any);

    // Default mock for requireAdmin (non-admin)
    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

    // Default mock for billing flow
    const { ensureBalance, postProvisionBilling } = await import('@/config/billing-flow');
    vi.mocked(ensureBalance).mockResolvedValue({ ok: true, balance: 100 } as any);
    vi.mocked(postProvisionBilling).mockResolvedValue(undefined);

    // Default mock for pricing
    const { getRatesForKubernetesExisting } = await import('@/config/pricing');
    vi.mocked(getRatesForKubernetesExisting).mockResolvedValue({
      initialCost: 10,
      hourlyRate: 0.1,
    });

    // Default mock for Projects.add_log
    const { Projects } = await import('@/lib/supabase/queries/projects');
    vi.mocked(Projects.add_log).mockResolvedValue({ success: true } as any);

    // Default mock for Encryption
    const { Encryption } = await import('@/config/functions');
    vi.mocked(Encryption.decrypt).mockReturnValue('decrypted-password');
  });

  describe('Authentication Tests', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should accept authenticated user request', async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);

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
    });

    it('should create cluster with valid payload', async () => {
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
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      const data = await expectResponseStatus(response, 200);

      // UUID format check
      expect(data.clusterId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should queue cluster provisioning job', async () => {
      const { provisionQueue } = await import('@/lib/queue');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(provisionQueue.add).toHaveBeenCalledWith(
        'provision',
        expect.objectContaining({
          clusterId: expect.any(String),
          provider: 'existing',
        })
      );
    });

    it('should add activity log to project', async () => {
      const { Projects } = await import('@/lib/supabase/queries/projects');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(Projects.add_log).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: mockCreateKubernetesPayload.projectId,
          event: 'Kubernetes Create',
        }),
        'user'
      );
    });

    it('should derive role correctly for regular user', async () => {
      const { provisionQueue } = await import('@/lib/queue');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(provisionQueue.add).toHaveBeenCalledWith(
        'provision',
        expect.objectContaining({
          role: 'user',
        })
      );
    });

    it('should derive role correctly for admin', async () => {
      // Mock admin check
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

      const { provisionQueue } = await import('@/lib/queue');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(provisionQueue.add).toHaveBeenCalledWith(
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
    });

    it('should reject missing required fields', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        {
          provider: 'existing',
          cluster: { name: 'test' },
          // Missing auth, nodes, ips, etc.
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject invalid IP addresses', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        {
          ...mockCreateKubernetesPayload,
          nodes: [
            { ...mockCreateKubernetesPayload.nodes[0], private_ip: 'invalid-ip' },
          ],
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should reject malformed JSON', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        {
          method: 'POST',
          body: 'not-json-{',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const response = await POST(request);
      await expectResponseStatus(response!, 400);
    });

    it('should reject invalid provider', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        {
          ...mockCreateKubernetesPayload,
          provider: 'invalid-provider',
        }
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });
  });

  describe('Billing Tests', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);
    });

    it('should check balance before provisioning', async () => {
      const { ensureBalance } = await import('@/config/billing-flow');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(ensureBalance).toHaveBeenCalledWith(
        mockCreateKubernetesPayload.ownerId,
        expect.any(Number)
      );
    });

    it('should return 402 for insufficient balance', async () => {
      const { ensureBalance } = await import('@/config/billing-flow');
      vi.mocked(ensureBalance).mockResolvedValue({ ok: false, balance: 0 } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 402);
    });

    it('should call postProvisionBilling after queuing', async () => {
      const { postProvisionBilling } = await import('@/config/billing-flow');

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      await POST(request as NextRequest);

      expect(postProvisionBilling).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      await mockAuthenticatedUser(mockKubernetesUser.id);
    });

    it('should enforce rate limiting', async () => {
      const { rateLimit } = await import('@/lib/rate-limit');
      vi.mocked(rateLimit).mockReturnValue({
        check: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
      } as any);

      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 429);
    });

    it('should allow requests within rate limit', async () => {
      const request = createMockPostRequest(
        'http://localhost:3000/api/services/kubernetes/clusters',
        mockCreateKubernetesPayload
      );

      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 200);
    });
  });
});
