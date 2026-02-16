import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/admin/kubernetes/clusters/delete/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server');
vi.mock('axios');

describe('POST /api/admin/kubernetes/clusters/delete', () => {
  const testUrl = 'http://localhost:3000/api/admin/kubernetes/clusters/delete';
  const mockAdminUser = { id: 'admin-1' };

  function createAuthMock(authorized: boolean) {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { roles: authorized ? ['admin'] : ['user'] },
              error: null,
            }),
          }),
        }),
      }),
    };
  }

  function createServiceMock(clusterData: any = null, deleteError: any = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: clusterData,
              error: clusterData ? null : { message: 'Not found' },
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: deleteError }),
        }),
      }),
    };
  }

  const mockCluster = {
    cluster_id: 'k8s-1',
    control_plane: { droplet_id: 'droplet-cp' },
    workers: [
      { droplet_id: 'droplet-w1' },
      { droplet_id: 'droplet-w2' },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const axios = await import('axios');
    vi.mocked(axios.default.delete).mockResolvedValue({ status: 204 });
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('should return 403 when user is not admin', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(createAuthMock(false) as any);

    const req = createRequest({ cluster_id: 'k8s-1' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('should return 400 when cluster_id is missing', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockResolvedValue(createServiceMock() as any);

    const req = createRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Cluster ID');
  });

  it('should return 404 when cluster is not found', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockResolvedValue(createServiceMock(null) as any);

    const req = createRequest({ cluster_id: 'non-existent' });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('should delete cluster successfully with all droplets', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    const axios = await import('axios');

    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockResolvedValue(createServiceMock(mockCluster) as any);

    const req = createRequest({ cluster_id: 'k8s-1' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('deleted successfully');

    // Should delete control plane + 2 workers = 3 API calls
    expect(axios.default.delete).toHaveBeenCalledTimes(3);
  });

  it('should continue with warnings if droplet deletion fails', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    const axios = await import('axios');

    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockResolvedValue(createServiceMock(mockCluster) as any);

    // Control plane delete fails, workers succeed
    vi.mocked(axios.default.delete)
      .mockRejectedValueOnce(new Error('DO API error'))
      .mockResolvedValueOnce({ status: 204 } as any)
      .mockResolvedValueOnce({ status: 204 } as any);

    const req = createRequest({ cluster_id: 'k8s-1' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.droplet_warnings).toBeDefined();
    expect(data.droplet_warnings.length).toBeGreaterThan(0);
  });

  it('should handle cluster with no workers', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    const axios = await import('axios');

    const clusterNoWorkers = { ...mockCluster, workers: [] };
    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockResolvedValue(createServiceMock(clusterNoWorkers) as any);

    const req = createRequest({ cluster_id: 'k8s-1' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Only control plane delete
    expect(axios.default.delete).toHaveBeenCalledTimes(1);
  });

  it('should return 500 when database delete fails', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockResolvedValue(
      createServiceMock(mockCluster, { message: 'DB delete error' }) as any
    );

    const req = createRequest({ cluster_id: 'k8s-1' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('DB delete error');
  });

  it('should return 500 on unexpected error', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(createAuthMock(true) as any);
    vi.mocked(createServiceClient).mockRejectedValue(new Error('Connection lost'));

    const req = createRequest({ cluster_id: 'k8s-1' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('Connection lost');
  });
});
