import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/admin/databases/route';

vi.mock('@/lib/supabase/server');

describe('Admin Databases API', () => {
  const mockAdminUser = { id: 'admin-1', email: 'admin@test.com' };

  function createSupabaseMock(options: {
    user?: any;
    profileRoles?: string[];
    queryResult?: any;
    authUsers?: any[];
  } = {}) {
    const {
      user = mockAdminUser,
      profileRoles = ['admin'],
      queryResult = { data: [], error: null, count: 0 },
      authUsers = [{ id: 'user-1', email: 'user@test.com' }],
    } = options;

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: authUsers } }),
        },
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { roles: profileRoles }, error: null }),
            order: vi.fn().mockResolvedValue(queryResult),
          }),
          or: vi.fn().mockReturnValue({
            range: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(queryResult),
            }),
          }),
          range: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(queryResult),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(queryResult),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(queryResult),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ GET ============
  describe('GET /api/admin/databases', () => {
    it('should return 403 when user is not admin', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ profileRoles: ['user'] }) as any
      );
      vi.mocked(createSSRClient).mockResolvedValue(createSupabaseMock() as any);

      const req = new Request('http://localhost:3000/api/admin/databases');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('should return 403 when user is not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('should return databases with pagination', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({
          queryResult: {
            data: [{ id: 'db-1', name: 'test-db', owner_id: 'user-1', user_profiles: { username: 'testuser' } }],
            error: null,
            count: 1,
          },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases?page=1&limit=10');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
    });

    it('should return 500 on database error', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({
          queryResult: { data: null, error: { message: 'DB error' }, count: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases');
      const res = await GET(req);
      expect(res.status).toBe(500);
    });
  });

  // ============ PATCH ============
  describe('PATCH /api/admin/databases', () => {
    it('should return 403 when user is not admin', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ profileRoles: ['user'] }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: 'c-1', status: 'active' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(403);
    });

    it('should return 400 when clusterId is missing', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(createSupabaseMock() as any);

      const req = new Request('http://localhost:3000/api/admin/databases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('should update database successfully', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({
          queryResult: { data: { cluster_id: 'c-1', status: 'active' }, error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: 'c-1', status: 'active' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('updated successfully');
    });

    it('should return 500 on update error', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({
          queryResult: { data: null, error: { message: 'Update failed' } },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: 'c-1', status: 'active' }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(500);
    });
  });

  // ============ DELETE ============
  describe('DELETE /api/admin/databases', () => {
    it('should return 403 when user is not admin', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createSupabaseMock({ profileRoles: ['user'] }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases?clusterId=c-1', {
        method: 'DELETE',
      });
      const res = await DELETE(req);
      expect(res.status).toBe(403);
    });

    it('should return 400 when clusterId is missing', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(createSupabaseMock() as any);

      const req = new Request('http://localhost:3000/api/admin/databases', {
        method: 'DELETE',
      });
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('should delete database successfully', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({ queryResult: { error: null } }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases?clusterId=c-1', {
        method: 'DELETE',
      });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('deleted successfully');
    });

    it('should return 500 on delete error', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSupabaseMock({ queryResult: { error: { message: 'Delete failed' } } }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/databases?clusterId=c-1', {
        method: 'DELETE',
      });
      const res = await DELETE(req);
      expect(res.status).toBe(500);
    });
  });
});
