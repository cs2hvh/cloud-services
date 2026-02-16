import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '@/app/api/admin/users/route';
import { GET as GET_USER } from '@/app/api/admin/users/[id]/route';

vi.mock('@/lib/supabase/server');

describe('Admin Users API', () => {
  const mockAdminUser = { id: 'admin-1', email: 'admin@test.com' };
  const mockUserProfile = {
    id: 'user-1',
    username: 'testuser',
    display_name: 'Test User',
    roles: ['user'],
    created_at: '2024-01-01',
  };

  /**
   * Creates a Supabase mock for auth check (createClient).
   * checkAdminAuth does: supabase.auth.getUser() + supabase.from('user_profiles').select('roles').eq('id', ...).single()
   */
  function createAuthMock(options: { user?: any; profileRoles?: string[] } = {}) {
    const { user = mockAdminUser, profileRoles = ['admin'] } = options;
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { roles: profileRoles }, error: null }),
          }),
        }),
      }),
    };
  }

  /**
   * Creates a Supabase mock for SSR data queries (createSSRClient).
   * GET /admin/users uses: auth.admin.listUsers(), from('user_profiles').select().or().range().order(),
   * from('servers').select().in(), from('game_servers').select().in(), from('clusters').select().in()
   * PATCH /admin/users uses: from('user_profiles').update().eq().select().single()
   * GET /admin/users/[id] uses: from('user_profiles').select().eq().single(),
   *   auth.admin.getUserById(), from('servers/game_servers/clusters/projects/apps').select().eq().order()
   */
  function createSSRMock(options: {
    listUsersResult?: any;
    getUserByIdResult?: any;
    profileQueryResult?: any;
    profileSingleResult?: any;
    serverCounts?: any[];
    gameServerCounts?: any[];
    clusterCounts?: any[];
    updateResult?: any;
    resourcesResult?: any;
  } = {}) {
    const {
      listUsersResult = { data: { users: [{ id: 'user-1', email: 'user1@test.com' }] } },
      getUserByIdResult = { data: { user: { email: 'user1@test.com' } } },
      profileQueryResult = { data: [mockUserProfile], error: null, count: 1 },
      profileSingleResult = { data: mockUserProfile, error: null },
      serverCounts = [],
      gameServerCounts = [],
      clusterCounts = [],
      updateResult = { data: mockUserProfile, error: null },
      resourcesResult = { data: [], error: null },
    } = options;

    // Track which table is being queried
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockImplementation((_cols?: string, opts?: any) => {
            // select('*', { count: 'exact' }) is for the list query
            if (opts?.count === 'exact') {
              return {
                or: vi.fn().mockReturnValue({
                  contains: vi.fn().mockReturnValue({
                    range: vi.fn().mockReturnValue({
                      order: vi.fn().mockResolvedValue(profileQueryResult),
                    }),
                  }),
                  range: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue(profileQueryResult),
                  }),
                }),
                contains: vi.fn().mockReturnValue({
                  range: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue(profileQueryResult),
                  }),
                }),
                range: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue(profileQueryResult),
                }),
              };
            }
            // select('*') for single user detail
            // select('roles') for auth check
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(profileSingleResult),
                order: vi.fn().mockResolvedValue(resourcesResult),
              }),
            };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(updateResult),
              }),
            }),
          }),
        };
      }

      // For servers, game_servers, clusters, projects, apps
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: table === 'servers' ? serverCounts :
                  table === 'game_servers' ? gameServerCounts :
                  table === 'clusters' ? clusterCounts : [],
          }),
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(resourcesResult),
          }),
        }),
      };
    });

    return {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(listUsersResult),
          getUserById: vi.fn().mockResolvedValue(getUserByIdResult),
        },
      },
      from: fromMock,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ GET /api/admin/users ============
  describe('GET /api/admin/users', () => {
    it('should return 403 when user is not admin', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createAuthMock({ profileRoles: ['user'] }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users');
      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized - Admin access required');
    });

    it('should return 403 when user is not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createAuthMock({ user: null }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('should return users with pagination', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          profileQueryResult: {
            data: [mockUserProfile],
            error: null,
            count: 1,
          },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users?page=1&limit=10');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(10);
      expect(body.pagination.total).toBe(1);
    });

    it('should apply search filter', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      const ssrMock = createSSRMock();
      vi.mocked(createSSRClient).mockResolvedValue(ssrMock as any);

      const req = new Request('http://localhost:3000/api/admin/users?search=test');
      const res = await GET(req);
      expect(res.status).toBe(200);
      // Verify user_profiles was queried
      expect(ssrMock.from).toHaveBeenCalledWith('user_profiles');
    });

    it('should enhance users with email and stats', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          listUsersResult: { data: { users: [{ id: 'user-1', email: 'user1@test.com' }] } },
          profileQueryResult: {
            data: [mockUserProfile],
            error: null,
            count: 1,
          },
          serverCounts: [{ owner_id: 'user-1' }, { owner_id: 'user-1' }],
          gameServerCounts: [{ user_id: 'user-1' }],
          clusterCounts: [],
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users?page=1&limit=10');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].email).toBe('user1@test.com');
      expect(body.data[0].stats.servers).toBe(2);
      expect(body.data[0].stats.gameServers).toBe(1);
      expect(body.data[0].stats.clusters).toBe(0);
    });

    it('should return 500 on database error', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          profileQueryResult: { data: null, error: { message: 'DB error' }, count: 0 },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users?page=1&limit=10');
      const res = await GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to fetch users');
    });
  });

  // ============ PATCH /api/admin/users ============
  describe('PATCH /api/admin/users', () => {
    it('should return 403 when not admin', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createAuthMock({ profileRoles: ['user'] }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: 'user-1', roles: ['admin'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(403);
    });

    it('should return 400 when userId is missing', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);

      const req = new Request('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ roles: ['admin'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('User ID is required');
    });

    it('should prevent self-demotion', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);

      const req = new Request('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: 'admin-1', roles: ['user'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Cannot remove your own admin role');
    });

    it('should update user roles successfully', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          updateResult: { data: { ...mockUserProfile, roles: ['admin'] }, error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: 'user-1', roles: ['admin'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('User updated successfully');
      expect(body.data.roles).toContain('admin');
    });

    it('should suspend a user', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          updateResult: { data: { ...mockUserProfile, suspend: true }, error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: 'user-1', suspend: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.suspend).toBe(true);
    });

    it('should return 500 on update error', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          updateResult: { data: null, error: { message: 'Update failed' } },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: 'user-1', roles: ['moderator'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to update user');
    });
  });

  // ============ GET /api/admin/users/[id] ============
  describe('GET /api/admin/users/[id]', () => {
    const mockParams = Promise.resolve({ id: 'user-1' });

    it('should return 403 when not admin', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(
        createAuthMock({ profileRoles: ['user'] }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users/user-1');
      const res = await GET_USER(req, { params: mockParams });
      expect(res.status).toBe(403);
    });

    it('should return 404 when user not found', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          profileSingleResult: { data: null, error: { message: 'Not found' } },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users/user-1');
      const res = await GET_USER(req, { params: mockParams });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('User not found');
    });

    it('should return detailed user info with resources', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockResolvedValue(
        createSSRMock({
          profileSingleResult: { data: mockUserProfile, error: null },
          getUserByIdResult: { data: { user: { email: 'user1@test.com' } } },
          resourcesResult: { data: [{ id: 'resource-1' }], error: null },
        }) as any
      );

      const req = new Request('http://localhost:3000/api/admin/users/user-1');
      const res = await GET_USER(req, { params: mockParams });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.profile).toBeDefined();
      expect(body.profile.email).toBe('user1@test.com');
      expect(body.resources).toBeDefined();
      expect(body.stats).toBeDefined();
    });

    it('should return 500 on unexpected error', async () => {
      const { createClient, createSSRClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createAuthMock() as any);
      vi.mocked(createSSRClient).mockRejectedValue(new Error('Unexpected'));

      const req = new Request('http://localhost:3000/api/admin/users/user-1');
      const res = await GET_USER(req, { params: mockParams });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });
  });
});
