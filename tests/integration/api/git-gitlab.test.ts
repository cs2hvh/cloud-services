import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GET_REPOS } from '@/app/api/gitlab/repositories/route';
import { GET as GET_BRANCHES } from '@/app/api/gitlab/branches/route';

vi.mock('@/lib/supabase/server');
vi.mock('@/lib/providers/gitlab');
vi.mock('@/lib/gitlab/token-refresh');

describe('GitLab Git Provider API', () => {
  const mockUser = { id: 'user-1', email: 'user@test.com' };

  function createSupabaseMock(user: any = mockUser) {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: 'Not auth' } }),
      },
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ GET /api/gitlab/repositories ============
  describe('GET /api/gitlab/repositories', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock(null) as any);

      const res = await GET_REPOS();
      expect(res.status).toBe(401);
    });

    it('should return 500 on createClient error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockRejectedValue(new Error('Server error'));

      const res = await GET_REPOS();
      expect(res.status).toBe(500);
    });

    it('should return 500 on error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockRejectedValue(new Error('Server error'));

      const res = await GET_REPOS();
      expect(res.status).toBe(500);
    });
  });

  // ============ GET /api/gitlab/branches ============
  describe('GET /api/gitlab/branches', () => {
    it('should return 401 when not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock(null) as any);

      const req = new Request('http://localhost:3000/api/gitlab/branches?project_id=123');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(401);
    });

    it('should return 400 when no token found', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
      vi.mocked(getValidGitLabToken).mockResolvedValue(null);

      const req = new Request('http://localhost:3000/api/gitlab/branches?project_id=123');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.needsAppAuth).toBe(true);
    });

    it('should return 400 when project_id missing', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
      vi.mocked(getValidGitLabToken).mockResolvedValue('valid-token');

      const req = new Request('http://localhost:3000/api/gitlab/branches');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toBe('Project ID is required');
    });

    it('should return branches on success', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
      vi.mocked(getValidGitLabToken).mockResolvedValue('valid-token');

      // Mock global fetch for GitLab API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([
          { name: 'main', commit: { id: 'abc123' }, protected: true },
        ]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const req = new Request('http://localhost:3000/api/gitlab/branches?project_id=123');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.branches).toHaveLength(1);
      expect(body.branches[0].name).toBe('main');

      vi.unstubAllGlobals();
    });

    it('should return 500 on error', async () => {
      const { createClient } = await import('@/lib/supabase/server');
      vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

      const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
      vi.mocked(getValidGitLabToken).mockResolvedValue('valid-token');

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const req = new Request('http://localhost:3000/api/gitlab/branches?project_id=123');
      const res = await GET_BRANCHES(req);
      expect(res.status).toBe(500);

      vi.unstubAllGlobals();
    });
  });
});
