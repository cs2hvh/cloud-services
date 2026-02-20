import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Security Tests: Admin Privilege Enforcement
 *
 * Verifies that admin-only endpoints properly enforce
 * requireAdmin() checks and reject unauthorized access.
 */

vi.mock('@/lib/supabase/auth');
vi.mock('@/lib/supabase/queries/products');

describe('Security: Admin Privilege Enforcement', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Products Admin Route', () => {
    it('SEC-ADMIN-001: GET /admin/products rejects non-admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { GET } = await import('@/app/api/admin/products/route');
      const req = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'GET',
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('SEC-ADMIN-002: GET /admin/products allows admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({
        ok: true,
        email: 'admin@test.com',
        userId: 'admin-id',
      } as any);

      const { Products } = await import('@/lib/supabase/queries/products');
      vi.mocked(Products.get_all).mockResolvedValue([
        { id: '1', name: 'Test Product' },
      ] as any);

      const { GET } = await import('@/app/api/admin/products/route');
      const req = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'GET',
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.products).toBeDefined();
    });

    it('SEC-ADMIN-003: POST /admin/products rejects non-admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { POST } = await import('@/app/api/admin/products/route');
      const req = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', type: 'compute', price: 10 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('SEC-ADMIN-004: PUT /admin/products rejects non-admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { PUT } = await import('@/app/api/admin/products/route');
      const req = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', name: 'updated' }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(401);
    });

    it('SEC-ADMIN-005: DELETE /admin/products rejects non-admin users', async () => {
      const { requireAdmin } = await import('@/lib/supabase/auth');
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as any);

      const { DELETE } = await import('@/app/api/admin/products/route');
      const req = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1' }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(401);
    });
  });
});
