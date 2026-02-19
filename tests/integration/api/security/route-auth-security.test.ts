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
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
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
    it('SEC-AUTH-010: manageip/add should reject unauthenticated requests', async () => {
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
        '@/app/api/services/kubernetes/manageip/add/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/manageip/add',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ipAddress: '10.0.0.1' }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

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

    it('SEC-AUTH-012: manageip/update should reject unauthenticated requests', async () => {
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
        '@/app/api/services/kubernetes/manageip/update/route'
      );

      const req = new NextRequest(
        'http://localhost:3000/api/services/kubernetes/manageip/update',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ipAddress: ['10.0.0.1'] }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
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
