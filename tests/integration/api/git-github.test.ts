import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_REPOS } from '@/app/api/github/repositories/route';
import { GET as GET_BRANCHES } from '@/app/api/github/branches/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/providers/github/utils');

describe('GitHub Git Provider API', () => {
  const mockUser = { id: 'user-1', email: 'user@test.com' };

  function createSupabaseMock(user: any = mockUser) {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: 'Not auth' } }),
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ GET /api/github/repositories ============
  describe('GET /api/github/repositories', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock(null) as any);

      const res = await GET_REPOS();
      expect(res.status).toBe(401);
    });

    it('should return repositories', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { fetchUserRepositories } = await import('@/lib/providers/github/utils');
      vi.mocked(fetchUserRepositories).mockResolvedValue({
        repositories: [{ id: '1', name: 'repo1', fullName: 'user/repo1' }],
        needsAppAuth: false,
      } as any);

      const res = await GET_REPOS();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.repositories).toHaveLength(1);
    });

    it('should return 400 when needs auth', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { fetchUserRepositories } = await import('@/lib/providers/github/utils');
      vi.mocked(fetchUserRepositories).mockResolvedValue({
        repositories: [],
        needsAppAuth: true,
      } as any);

      const res = await GET_REPOS();
      expect(res.status).toBe(400);
    });

    it('should return 500 on error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { fetchUserRepositories } = await import('@/lib/providers/github/utils');
      vi.mocked(fetchUserRepositories).mockRejectedValue(new Error('API error'));

      const res = await GET_REPOS();
      expect(res.status).toBe(500);
    });
  });

  // ============ GET /api/github/branches ============
  describe('GET /api/github/branches', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock(null) as any);

      const req = new Request('http://localhost:3000/api/github/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(401);
    });

    it('should return 400 when repo param missing', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const req = new Request('http://localhost:3000/api/github/branches');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Repository name is required');
    });

    it('should return branches', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { fetchRepositoryBranches } = await import('@/lib/providers/github/utils');
      vi.mocked(fetchRepositoryBranches).mockResolvedValue({
        branches: [{ name: 'main', commitSha: 'abc123' }],
      } as any);

      const req = new Request('http://localhost:3000/api/github/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.branches).toHaveLength(1);
    });

    it('should return 500 on error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { fetchRepositoryBranches } = await import('@/lib/providers/github/utils');
      vi.mocked(fetchRepositoryBranches).mockRejectedValue(new Error('Branch error'));

      const req = new Request('http://localhost:3000/api/github/branches?repo=user/repo1');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(500);
    });
  });
});
