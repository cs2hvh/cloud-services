//@ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Security Tests: Route Authentication & Authorization
 *
 * After security fix: K8s status route requires authenticateUser(),
 * admin products GET requires requireAdmin(), K8s manageip routes
 * require authentication.
 */

vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/queries/products');

describe('Security: Route Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================================================================
  // K8s Clusters Status — Now requires auth
  // ==================================================================
  describe('K8s Clusters Status Route', () => {
    it('SEC-AUTH-001: should reject unauthenticated requests', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      } as any);

      const { POST } = await import(
        '@/app/api/services/kubernetes/clusters/status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clusterId: 'test-cluster' }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('SEC-AUTH-002: should not leak error.message from DB queries', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: true,
        user: { id: 'user-1' },
        response: null,
      } as any);

      const { createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createSSRClient).mockResolvedValue({
        // Two .eq() calls: cluster_id AND owner_id. The ownership filter was
        // added in 7ad7c12b, because this route runs on the service-role client
        // and so has no RLS policy behind it to catch a missing filter. A mock
        // that chains only one .eq would pass while the route silently lost its
        // ownership check, so the shape here is load-bearing.
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    message: 'relation "clusters" does not exist',
                    code: '42P01',
                  },
                }),
              }),
            }),
          }),
        }),
      } as any);

      const { POST } = await import(
        '@/app/api/services/kubernetes/clusters/status/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/clusters/status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clusterId: 'test-cluster' }),
        }
      );

      const res = await POST(req);
      const data = await res.json();

      // After fix: should return generic error, not DB internals
      expect(data.error).toBe('Failed to fetch cluster status');
      expect(data.error).not.toContain('relation');
    });
  });

  // ==================================================================
  // K8s ManageIP Routes — Now require auth
  // ==================================================================
  describe('K8s ManageIP Routes', () => {
    // SEC-AUTH-010 used to import
    // @/app/api/services/kubernetes/manageip/add/route, which does not exist.
    // The import failed at transform time, so the WHOLE file never ran and all
    // seven SEC-AUTH cases in it silently reported nothing — including
    // SEC-AUTH-011 below, which asserts manageip/delete rejects unauthenticated
    // requests. A security suite that never executes is worse than none,
    // because it reads as coverage.
    //
    // It now covers readdroplet and dropletstatus instead: the two routes that
    // genuinely had NO authentication until fad9e73f, which is what this file
    // exists to catch.
    // The import must be a literal, not a variable: Vite resolves these
    // statically, so import(someVariable) cannot see the "@/" alias and fails at
    // runtime. Each case therefore carries its own thunk.
    it.each([
      [
        'readdroplet',
        () => import('@/app/api/services/kubernetes/manageip/readdroplet/route'),
      ],
      [
        'dropletstatus',
        () => import('@/app/api/services/kubernetes/manageip/dropletstatus/route'),
      ],
    ])(
      'SEC-AUTH-010: manageip/%s should reject unauthenticated requests',
      async (name, loadRoute) => {
        const { authenticateUser } = await import('@/lib/auth/server-auth');
        vi.mocked(authenticateUser).mockResolvedValue({
          authenticated: false,
          user: null,
          response: new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          ),
        } as any);

        const { POST } = await loadRoute();

        const req = new NextRequest(
          `http://localhost:3000/api/services/kubernetes/manageip/${name}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: '12345', cluster_id: 'c-1' }),
          }
        );

        const res = await POST(req);
        expect(res.status).toBe(401);
      }
    );

    it('SEC-AUTH-011: manageip/delete should reject unauthenticated requests', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      } as any);

      const { POST } = await import(
        '@/app/api/services/kubernetes/manageip/delete/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/manageip/delete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ droplet_id: '12345' }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    // SEC-AUTH-012 imported manageip/update, which does not exist either. It is
    // repointed at createdroplet, a route that DOES exist and provisions real
    // infrastructure, so it is worth asserting on.
    it('SEC-AUTH-012: manageip/createdroplet should reject unauthenticated requests', async () => {
      const { authenticateUser } = await import('@/lib/auth/server-auth');
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      } as any);

      const { POST } = await import(
        '@/app/api/services/kubernetes/manageip/createdroplet/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/manageip/createdroplet',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cluster_id: 'c-1', names: ['n1'] }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    // Guards the failure this file was in: an import of a route that does not
    // exist fails at transform time and takes the WHOLE suite silently offline.
    // This assertion fails loudly instead.
    it('SEC-AUTH-013: every manageip route this suite names still exists', async () => {
      const modules = [
        import('@/app/api/services/kubernetes/manageip/readdroplet/route'),
        import('@/app/api/services/kubernetes/manageip/dropletstatus/route'),
        import('@/app/api/services/kubernetes/manageip/delete/route'),
        import('@/app/api/services/kubernetes/manageip/createdroplet/route'),
      ];
      const loaded = await Promise.all(modules);
      for (const m of loaded) {
        expect(typeof (m as { POST?: unknown }).POST).toBe('function');
      }
    });
  });

  // ==================================================================
  // Admin Products GET — Now requires admin auth
  // ==================================================================
  describe('Admin Products Route', () => {
    it('SEC-AUTH-020: products GET should reject non-admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false });

      const { GET } = await import('@/app/api/admin/products/route');

      const req = new NextRequest('http://localhost:3000/api/admin/products');

      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('SEC-AUTH-021: products GET should allow admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({
        ok: true,
        email: 'admin@example.com',
        userId: 'admin-1',
      });

      const { Products } = await import('@/lib/supabase/queries/products');
      vi.mocked(Products.get_all).mockResolvedValue([
        { id: 'p1', name: 'Test', price: 10 },
      ] as any);

      const { GET } = await import('@/app/api/admin/products/route');

      const req = new NextRequest('http://localhost:3000/api/admin/products');

      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });
});
