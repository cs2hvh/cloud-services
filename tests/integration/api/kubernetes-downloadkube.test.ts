import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/services/kubernetes/clusters/downloadkube/route';
import {
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
  createMockPostRequest,
  expectResponseStatus,
} from '../../utils/test-helpers';

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({
    check: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('POST /api/services/kubernetes/clusters/downloadkube', () => {
  const testUrl = 'http://localhost:3000/api/services/kubernetes/clusters/downloadkube';

  let mockSupabase: any;
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSingle = vi.fn();
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockSingle,
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      }),
    };

    const { createSSRClient } = await import('@/lib/supabase/server');
    vi.mocked(createSSRClient).mockResolvedValue(mockSupabase as any);

    const { requireAdmin } = await import('@/lib/supabase/auth');
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);
  });

  // ============================================
  // Auth Tests
  // ============================================
  describe('Authentication', () => {
    it('TC-K8S-110: should return 401 for unauthenticated user', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      await expectResponseStatus(response, 401);
    });
  });

  // ============================================
  // Validation Tests
  // ============================================
  describe('Validation', () => {
    it('TC-K8S-111: should return 400 when cluster_id and kubeconfig are missing', async () => {
      await mockAuthenticatedUser();

      const request = createMockPostRequest(testUrl, {});
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('cluster_id or kubeconfig required');
    });
  });

  // ============================================
  // Success Cases — cluster_id path
  // ============================================
  describe('Success Cases (cluster_id)', () => {
    it('TC-K8S-112: should return kubeconfig as string', async () => {
      await mockAuthenticatedUser();

      const kubeconfigBytes = Array.from(Buffer.from('apiVersion: v1\nkind: Config'));
      mockSingle.mockResolvedValue({
        data: {
          kubeconfig: { data: kubeconfigBytes },
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        error: null,
      });

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toContain('apiVersion');
    });

    it('TC-K8S-113: should handle kubeconfig stored as plain string', async () => {
      await mockAuthenticatedUser();

      mockSingle.mockResolvedValue({
        data: {
          kubeconfig: 'apiVersion: v1\nkind: Config\nclusters: []',
          owner_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        error: null,
      });

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toContain('apiVersion');
    });

    it('TC-K8S-114: should return 404 when kubeconfig is null', async () => {
      await mockAuthenticatedUser();

      mockSingle.mockResolvedValue({
        data: { kubeconfig: null, owner_id: 'user-1' },
        error: null,
      });

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain('not found');
    });

    it('TC-K8S-115: should return 400 when cluster query errors', async () => {
      await mockAuthenticatedUser();

      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Row not found' },
      });

      const request = createMockPostRequest(testUrl, { cluster_id: 'nonexistent' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Row not found');
    });

    it('TC-K8S-116: admin should bypass owner check', async () => {
      await mockAuthenticatedUser();

      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as any);

      const kubeconfigBytes = Array.from(Buffer.from('apiVersion: v1'));
      mockSingle.mockResolvedValue({
        data: {
          kubeconfig: { data: kubeconfigBytes },
          owner_id: 'other-user',
        },
        error: null,
      });

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
    });
  });

  // ============================================
  // Backward Compatibility — kubeconfig path
  // ============================================
  describe('Backward Compatibility (kubeconfig body)', () => {
    it('TC-K8S-117: should decode kubeconfig from JSON buffer', async () => {
      await mockAuthenticatedUser();

      const kubeconfigBytes = Array.from(Buffer.from('apiVersion: v1'));
      const request = createMockPostRequest(testUrl, {
        kubeconfig: JSON.stringify({ data: kubeconfigBytes }),
      });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toContain('apiVersion');
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('TC-K8S-118: should return 400 on unexpected Error', async () => {
      await mockAuthenticatedUser();

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockRejectedValue(new Error('DB down'));

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('DB down');
    });

    it('TC-K8S-119: should return 400 on non-Error throw', async () => {
      await mockAuthenticatedUser();

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockRejectedValue('string error');

      const request = createMockPostRequest(testUrl, { cluster_id: 'cluster-1' });
      const response = await POST(request as any);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain('Unknown error');
    });
  });
});
